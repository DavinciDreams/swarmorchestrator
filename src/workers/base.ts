/**
 * Base Swarm Worker
 *
 * Provides the foundation for swarm-based background workers that:
 * 1. Chunk work into manageable pieces
 * 2. Spawn agents to process chunks in parallel
 * 3. Aggregate results
 * 4. Handle failures gracefully
 */

import { callMcpTool } from "../mcp/client.js";

export interface ScalingConfig {
  /** Enable dynamic scaling based on task size */
  enabled: boolean;
  /** Minimum agents regardless of task size */
  minAgents: number;
  /** Maximum agents to scale to */
  maxAgents: number;
  /** Thresholds for scaling tiers */
  thresholds: {
    /** Items below this use minAgents */
    small: number;
    /** Items below this use medium scaling */
    medium: number;
    /** Items above medium use maxAgents */
  };
}

export interface SwarmWorkerConfig {
  /** Worker name for logging */
  name: string;
  /** Maximum time per chunk in ms */
  chunkTimeoutMs?: number;
  /** Maximum concurrent agents (used when scaling is disabled) */
  maxConcurrency?: number;
  /** Model to use for agents (sonnet for complex, haiku for simple) */
  model?: "haiku" | "sonnet" | "opus";
  /** Swarm topology */
  topology?: "hierarchical" | "mesh" | "hierarchical-mesh";
  /** Dynamic scaling configuration */
  scaling?: Partial<ScalingConfig>;
}

export interface ChunkResult {
  chunkId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

export interface WorkerResult {
  success: boolean;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  results: ChunkResult[];
  aggregated?: unknown;
  durationMs: number;
}

/**
 * Default scaling configuration
 */
const DEFAULT_SCALING: ScalingConfig = {
  enabled: true,
  minAgents: 2,
  maxAgents: 8,
  thresholds: {
    small: 5,   // < 5 items: use minAgents
    medium: 20, // 5-20 items: use proportional scaling
                // > 20 items: use maxAgents
  },
};

/**
 * Calculate optimal concurrency based on task size
 */
export function calculateOptimalConcurrency(
  taskSize: number,
  scaling: ScalingConfig,
): { concurrency: number; reason: string } {
  if (!scaling.enabled) {
    return { concurrency: scaling.maxAgents, reason: "scaling disabled" };
  }

  const { minAgents, maxAgents, thresholds } = scaling;

  if (taskSize <= 0) {
    return { concurrency: minAgents, reason: "empty task" };
  }

  if (taskSize < thresholds.small) {
    return {
      concurrency: minAgents,
      reason: `small task (${taskSize} < ${thresholds.small})`
    };
  }

  if (taskSize >= thresholds.medium) {
    return {
      concurrency: maxAgents,
      reason: `large task (${taskSize} >= ${thresholds.medium})`
    };
  }

  // Linear interpolation between min and max for medium tasks
  const range = thresholds.medium - thresholds.small;
  const position = taskSize - thresholds.small;
  const ratio = position / range;
  const scaled = Math.round(minAgents + ratio * (maxAgents - minAgents));

  return {
    concurrency: Math.max(minAgents, Math.min(maxAgents, scaled)),
    reason: `medium task (${taskSize} items, ${Math.round(ratio * 100)}% scaling)`,
  };
}

/**
 * Creates a swarm-based worker that chunks and distributes work.
 * Automatically scales agents based on task size when scaling is enabled.
 */
export async function createSwarmWorker(config: SwarmWorkerConfig) {
  const {
    name,
    chunkTimeoutMs = 120000, // 2 min per chunk
    maxConcurrency = 5,
    model = "sonnet",
    topology = "hierarchical-mesh",
    scaling: userScaling,
  } = config;

  // Merge user scaling config with defaults
  const scaling: ScalingConfig = {
    ...DEFAULT_SCALING,
    ...userScaling,
    thresholds: {
      ...DEFAULT_SCALING.thresholds,
      ...userScaling?.thresholds,
    },
  };

  // If scaling is disabled, use maxConcurrency as the fixed value
  if (!scaling.enabled) {
    scaling.maxAgents = maxConcurrency;
    scaling.minAgents = maxConcurrency;
  }

  return {
    name,

    /** Get the scaling configuration */
    getScalingConfig(): ScalingConfig {
      return scaling;
    },

    /**
     * Initialize a swarm for this worker
     * Uses maxAgents from scaling config to allow dynamic growth
     */
    async initSwarm(): Promise<string> {
      const result = await callMcpTool("swarm_init", {
        topology,
        maxAgents: scaling.maxAgents,
        config: {
          name: `${name}-swarm`,
          workerType: name,
          scalingEnabled: scaling.enabled,
        },
      });
      return JSON.parse(result).swarmId ?? `swarm-${name}`;
    },

    /**
     * Spawn agents for chunk processing
     */
    async spawnAgents(
      swarmId: string,
      count: number,
      role: string,
    ): Promise<string[]> {
      const agentIds: string[] = [];
      for (let i = 0; i < count; i++) {
        const result = await callMcpTool("agent_spawn", {
          agentType: "worker",
          agentId: `${name}-agent-${i}`,
          task: role,
          model,
          config: { swarmId },
        });
        const parsed = JSON.parse(result);
        agentIds.push(parsed.agentId ?? `${name}-agent-${i}`);
      }
      return agentIds;
    },

    /**
     * Process chunks in parallel using the swarm
     * Automatically scales agent count based on number of chunks
     */
    async processChunks<T, R>(
      chunks: T[],
      processor: (chunk: T, index: number) => Promise<R>,
    ): Promise<WorkerResult> {
      const startTime = Date.now();
      const results: ChunkResult[] = [];

      // Calculate optimal concurrency based on task size
      const { concurrency, reason } = calculateOptimalConcurrency(chunks.length, scaling);
      console.log(`[${name}] Scaling: ${concurrency} agents (${reason})`);

      // Process in batches of dynamically calculated concurrency
      for (let i = 0; i < chunks.length; i += concurrency) {
        const batch = chunks.slice(i, i + concurrency);
        const batchPromises = batch.map(async (chunk, batchIdx) => {
          const chunkIdx = i + batchIdx;
          const chunkStart = Date.now();
          try {
            const data = await Promise.race([
              processor(chunk, chunkIdx),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("Chunk timeout")),
                  chunkTimeoutMs,
                ),
              ),
            ]);
            return {
              chunkId: `chunk-${chunkIdx}`,
              success: true,
              data,
              durationMs: Date.now() - chunkStart,
            };
          } catch (err) {
            return {
              chunkId: `chunk-${chunkIdx}`,
              success: false,
              error: err instanceof Error ? err.message : String(err),
              durationMs: Date.now() - chunkStart,
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      const completedChunks = results.filter((r) => r.success).length;
      return {
        success: completedChunks === chunks.length,
        totalChunks: chunks.length,
        completedChunks,
        failedChunks: chunks.length - completedChunks,
        results,
        durationMs: Date.now() - startTime,
      };
    },

    /**
     * Dispatch a task to the swarm for orchestrated execution
     * @param taskSize - Optional hint for scaling calculation
     */
    async dispatchTask(
      task: string,
      strategy: "parallel" | "sequential" = "parallel",
      taskSize?: number,
    ): Promise<string> {
      const { concurrency } = calculateOptimalConcurrency(taskSize ?? 10, scaling);
      return callMcpTool("coordination_orchestrate", {
        task,
        strategy,
        agents: concurrency,
        timeout: chunkTimeoutMs * concurrency,
      });
    },

    /**
     * Store results in memory for persistence
     */
    async storeResults(key: string, data: unknown): Promise<void> {
      await callMcpTool("memory_store", {
        key,
        value: JSON.stringify(data),
        namespace: `worker-${name}`,
        tags: ["worker-result", name],
      });
    },

    /**
     * Shutdown the swarm gracefully
     */
    async shutdown(swarmId: string): Promise<void> {
      await callMcpTool("swarm_shutdown", {
        swarmId,
        graceful: true,
      });
    },
  };
}

/**
 * Estimate optimal agent count for a task based on complexity metrics
 */
export function estimateAgentCount(metrics: {
  fileCount?: number;
  totalLines?: number;
  chunkCount?: number;
  complexity?: "low" | "medium" | "high";
}): { agents: number; reasoning: string } {
  const { fileCount = 0, totalLines = 0, chunkCount = 0, complexity = "medium" } = metrics;

  // Base calculation on the most significant metric available
  let base = Math.max(fileCount, chunkCount, Math.ceil(totalLines / 500));

  // Adjust for complexity
  const complexityMultiplier = { low: 0.5, medium: 1, high: 1.5 }[complexity];
  const adjusted = Math.ceil(base * complexityMultiplier);

  // Clamp to reasonable range
  const agents = Math.max(2, Math.min(8, adjusted));

  const reasoning = [
    fileCount > 0 ? `${fileCount} files` : null,
    totalLines > 0 ? `${totalLines} LOC` : null,
    chunkCount > 0 ? `${chunkCount} chunks` : null,
    `${complexity} complexity`,
  ].filter(Boolean).join(", ");

  return { agents, reasoning: `${agents} agents recommended (${reasoning})` };
}

/**
 * Chunk an array of files by directory for parallel processing
 */
export function chunkByDirectory(files: string[], maxChunkSize = 10): string[][] {
  const byDir = new Map<string, string[]>();

  for (const file of files) {
    const parts = file.split("/");
    const dir = parts.slice(0, -1).join("/") || ".";
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(file);
  }

  // Merge small directories, split large ones
  const chunks: string[][] = [];
  let currentChunk: string[] = [];

  for (const [, dirFiles] of byDir) {
    if (dirFiles.length > maxChunkSize) {
      // Split large directory into multiple chunks
      for (let i = 0; i < dirFiles.length; i += maxChunkSize) {
        chunks.push(dirFiles.slice(i, i + maxChunkSize));
      }
    } else if (currentChunk.length + dirFiles.length > maxChunkSize) {
      // Start new chunk
      if (currentChunk.length > 0) chunks.push(currentChunk);
      currentChunk = [...dirFiles];
    } else {
      // Add to current chunk
      currentChunk.push(...dirFiles);
    }
  }

  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

/**
 * Chunk by estimated complexity (LOC-based)
 */
export function chunkByComplexity(
  files: { path: string; lines: number }[],
  maxLinesPerChunk = 1000,
): string[][] {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentLines = 0;

  // Sort by size descending to pack efficiently
  const sorted = [...files].sort((a, b) => b.lines - a.lines);

  for (const file of sorted) {
    if (currentLines + file.lines > maxLinesPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [file.path];
      currentLines = file.lines;
    } else {
      currentChunk.push(file.path);
      currentLines += file.lines;
    }
  }

  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}
