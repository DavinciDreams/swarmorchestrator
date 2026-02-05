/**
 * Agent Coordinator - Orchestrates multiple specialized agents
 * Mirrors SunBurpBot's ImprovementCoordinator for consistent task execution
 *
 * This coordinator serves as a bridge between the DeepAgents.js orchestrator
 * and the Agent SDK agents, providing:
 * - Iterative refinement with quality thresholds
 * - Historical learning from past executions
 * - Swarm-based worker orchestration
 * - Persistent state via MCP memory
 */

import { SwarmAgent, SwarmResult } from "./swarm-agent.js";
import { TaskAgent, TaskConfig, TaskResult, TaskDecomposition } from "./task-agent.js";
import { MemoryAgent, MemoryNamespace, PatternEntry } from "./memory-agent.js";
import { WorkerAgent, WorkerType, WorkerResult } from "./worker-agent.js";
import { EvaluatorAgent, EvaluationResult, TaskEvaluation } from "./evaluator-agent.js";
import { callMcpTool } from "../mcp/client.js";

export interface CoordinatorConfig {
  /** Enable iterative refinement for quality improvement */
  iterativeRefinement: {
    enabled: boolean;
    maxIterations: number;
    qualityThreshold: number;
  };
  /** Enable historical learning from past tasks */
  historicalLearning: {
    enabled: boolean;
    retrievalTopK: number;
    patternMinSuccessRate: number;
  };
  /** Default swarm configuration */
  swarm: {
    topology: "mesh" | "hierarchical" | "hierarchical-mesh" | "ring" | "star" | "adaptive" | "hybrid";
    maxAgents: number;
  };
}

export interface CoordinatedTaskResult {
  success: boolean;
  taskId: string;
  output: string;
  quality: number;
  iterations: number;
  patterns: string[];
  evaluation?: TaskEvaluation;
}

export interface CoordinatorMetrics {
  totalTasks: number;
  successfulTasks: number;
  averageQuality: number;
  averageIterations: number;
  patternsLearned: number;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  iterativeRefinement: {
    enabled: true,
    maxIterations: 3,
    qualityThreshold: 0.8,
  },
  historicalLearning: {
    enabled: true,
    retrievalTopK: 5,
    patternMinSuccessRate: 0.7,
  },
  swarm: {
    topology: "hierarchical-mesh",
    maxAgents: 8,
  },
};

export class AgentCoordinator {
  private config: CoordinatorConfig;
  private swarmAgent: SwarmAgent;
  private taskAgent: TaskAgent;
  private memoryAgent: MemoryAgent;
  private evaluatorAgent: EvaluatorAgent;
  private workerAgents: Map<WorkerType, WorkerAgent>;
  private metrics: CoordinatorMetrics;
  private initialized = false;
  private sessionId: string;
  private swarmId: string | null = null;

  constructor(config?: Partial<CoordinatorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = `coordinator-${Date.now()}`;

    // Initialize agents
    this.swarmAgent = new SwarmAgent(undefined, {
      topology: this.config.swarm.topology,
      maxAgents: this.config.swarm.maxAgents,
    });
    this.taskAgent = new TaskAgent();
    this.memoryAgent = new MemoryAgent();
    this.evaluatorAgent = new EvaluatorAgent();

    // Initialize worker agents
    this.workerAgents = new Map<WorkerType, WorkerAgent>([
      ["map", new WorkerAgent("map")],
      ["audit", new WorkerAgent("audit")],
      ["optimize", new WorkerAgent("optimize")],
      ["testgaps", new WorkerAgent("testgaps")],
    ]);

    // Initialize metrics
    this.metrics = {
      totalTasks: 0,
      successfulTasks: 0,
      averageQuality: 0,
      averageIterations: 0,
      patternsLearned: 0,
    };
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log("[AgentCoordinator] Initializing...");

    // Try to restore previous metrics from MCP memory
    await this.restoreMetrics();

    // Initialize swarm
    const swarmResult = await this.swarmAgent.initializeSwarm(
      this.config.swarm.topology,
      this.config.swarm.maxAgents
    );

    if (swarmResult.status === "error") {
      throw new Error(`Failed to initialize swarm: ${swarmResult.message}`);
    }

    this.swarmId = swarmResult.swarmId;

    // Store initialization in memory (both local and MCP)
    await this.memoryAgent.store(
      "coordinator-init",
      {
        swarmId: swarmResult.swarmId,
        topology: swarmResult.topology,
        timestamp: new Date().toISOString(),
      },
      "context"
    );

    // Persist to MCP memory for cross-session access
    await this.persistToMcp("coordinator_state", {
      sessionId: this.sessionId,
      swarmId: this.swarmId,
      config: this.config,
      startedAt: new Date().toISOString(),
    });

    this.initialized = true;
    console.log(`[AgentCoordinator] Initialized with swarm ${swarmResult.swarmId}`);
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the current swarm ID
   */
  getSwarmId(): string | null {
    return this.swarmId;
  }

  /**
   * Persist data to MCP memory
   */
  private async persistToMcp(key: string, data: Record<string, unknown>): Promise<void> {
    try {
      await callMcpTool("memory_store", {
        namespace: "sdk_coordinator",
        key,
        value: JSON.stringify(data),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[AgentCoordinator] Failed to persist to MCP: ${msg}`);
    }
  }

  /**
   * Restore metrics from MCP memory
   */
  private async restoreMetrics(): Promise<void> {
    try {
      const result = await callMcpTool("memory_retrieve", {
        namespace: "sdk_coordinator",
        key: "coordinator_metrics",
      });

      const parsed = JSON.parse(result);
      if (parsed && typeof parsed === "object") {
        // Merge restored metrics
        this.metrics = {
          ...this.metrics,
          totalTasks: parsed.totalTasks ?? this.metrics.totalTasks,
          successfulTasks: parsed.successfulTasks ?? this.metrics.successfulTasks,
          averageQuality: parsed.averageQuality ?? this.metrics.averageQuality,
          averageIterations: parsed.averageIterations ?? this.metrics.averageIterations,
          patternsLearned: parsed.patternsLearned ?? this.metrics.patternsLearned,
        };
        console.log("[AgentCoordinator] Restored metrics from previous session");
      }
    } catch {
      // No previous metrics, starting fresh
    }
  }

  /**
   * Persist current metrics to MCP memory
   */
  private async persistMetrics(): Promise<void> {
    await this.persistToMcp("coordinator_metrics", {
      ...this.metrics,
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * Execute a task with improvement mechanisms
   */
  async executeWithImprovement(taskConfig: TaskConfig): Promise<CoordinatedTaskResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log("\n=== Starting Coordinated Task Execution ===");
    console.log(`Task: ${taskConfig.description}`);

    this.metrics.totalTasks++;

    // Step 1: Retrieve historical patterns (if enabled)
    let historicalPatterns: PatternEntry[] = [];
    if (this.config.historicalLearning.enabled) {
      historicalPatterns = await this.memoryAgent.retrievePatterns(
        taskConfig.description,
        this.config.historicalLearning.retrievalTopK
      );
      console.log(`Retrieved ${historicalPatterns.length} relevant patterns`);
    }

    // Step 2: Create and decompose task
    const taskResult = await this.taskAgent.createTask(taskConfig);
    if (taskResult.status === "failed") {
      return {
        success: false,
        taskId: taskResult.taskId,
        output: taskResult.error || "Task creation failed",
        quality: 0,
        iterations: 0,
        patterns: [],
      };
    }

    // Step 3: Execute with iterative refinement
    let output = "";
    let quality = 0;
    let iterations = 0;
    let evaluation: TaskEvaluation | undefined;

    if (this.config.iterativeRefinement.enabled) {
      const refinementResult = await this.executeWithRefinement(
        taskResult.taskId,
        taskConfig,
        historicalPatterns
      );
      output = refinementResult.output;
      quality = refinementResult.quality;
      iterations = refinementResult.iterations;
      evaluation = refinementResult.evaluation;
    } else {
      // Simple execution without refinement
      const dispatchResult = await this.taskAgent.dispatchTask(taskResult.taskId, "parallel");
      output = dispatchResult.output || "";
      quality = 0.7; // Default quality without evaluation
      iterations = 1;
    }

    // Step 4: Record execution and learn patterns
    const patternIds = historicalPatterns.map((p) => p.id);

    if (this.config.historicalLearning.enabled && quality >= this.config.historicalLearning.patternMinSuccessRate) {
      await this.recordTaskExecution(taskConfig, output, quality, iterations, patternIds);
    }

    // Step 5: Update metrics
    const success = quality >= this.config.iterativeRefinement.qualityThreshold;
    if (success) {
      this.metrics.successfulTasks++;
    }
    this.updateMetrics(quality, iterations);

    // Step 6: Build result
    const result: CoordinatedTaskResult = {
      success,
      taskId: taskResult.taskId,
      output,
      quality,
      iterations,
      patterns: patternIds,
      evaluation,
    };

    console.log("\n=== Task Execution Complete ===");
    console.log(`Success: ${result.success}`);
    console.log(`Quality: ${result.quality.toFixed(2)}`);
    console.log(`Iterations: ${result.iterations}`);

    return result;
  }

  /**
   * Execute with iterative refinement
   */
  private async executeWithRefinement(
    taskId: string,
    taskConfig: TaskConfig,
    patterns: PatternEntry[]
  ): Promise<{
    output: string;
    quality: number;
    iterations: number;
    evaluation?: TaskEvaluation;
  }> {
    const maxIterations = this.config.iterativeRefinement.maxIterations;
    const qualityThreshold = this.config.iterativeRefinement.qualityThreshold;

    let output = "";
    let quality = 0;
    let lastEvaluation: TaskEvaluation | undefined;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      console.log(`\n--- Iteration ${iteration}/${maxIterations} ---`);

      // Dispatch task
      const dispatchResult = await this.taskAgent.dispatchTask(taskId, "parallel");
      output = dispatchResult.output || "";

      // Evaluate output
      lastEvaluation = await this.evaluatorAgent.evaluateTask(
        taskId,
        taskConfig.description,
        taskConfig.requirements || [],
        output // Using output as path for simplicity
      );

      quality = lastEvaluation.evaluation.score;
      console.log(`Quality: ${quality.toFixed(2)}`);

      // Check if quality threshold met
      if (quality >= qualityThreshold) {
        console.log(`Quality threshold (${qualityThreshold}) met!`);
        return { output, quality, iterations: iteration, evaluation: lastEvaluation };
      }

      // If not last iteration, generate improvements for next round
      if (iteration < maxIterations) {
        const suggestions = await this.evaluatorAgent.generateImprovementSuggestions(
          lastEvaluation.evaluation
        );
        console.log(`Improvement suggestions: ${suggestions.length}`);

        // Store feedback for next iteration
        await this.memoryAgent.store(
          `feedback-${taskId}-${iteration}`,
          {
            evaluation: lastEvaluation.evaluation,
            suggestions,
          },
          "progress"
        );
      }
    }

    return { output, quality, iterations: maxIterations, evaluation: lastEvaluation };
  }

  /**
   * Record task execution for learning
   */
  private async recordTaskExecution(
    taskConfig: TaskConfig,
    output: string,
    quality: number,
    iterations: number,
    patternIds: string[]
  ): Promise<void> {
    // Store task history
    await this.memoryAgent.store(
      `task-history-${Date.now()}`,
      {
        taskType: taskConfig.type,
        description: taskConfig.description,
        output,
        quality,
        iterations,
        patterns: patternIds,
        timestamp: new Date().toISOString(),
      },
      "tasks"
    );

    // Learn new patterns if quality is high
    if (quality >= 0.9) {
      const pattern = await this.memoryAgent.storePattern({
        description: `Successful ${taskConfig.type} task pattern`,
        context: taskConfig.description.substring(0, 100),
        successRate: quality,
        usageCount: 1,
      });
      this.metrics.patternsLearned++;
      console.log(`Learned new pattern: ${pattern.id}`);
    }
  }

  /**
   * Run a background worker
   */
  async runWorker(workerType: WorkerType, targetPath?: string): Promise<WorkerResult> {
    const worker = this.workerAgents.get(workerType);
    if (!worker) {
      throw new Error(`Unknown worker type: ${workerType}`);
    }

    return worker.run(targetPath);
  }

  /**
   * Get coordinator metrics
   */
  getMetrics(): CoordinatorMetrics {
    return { ...this.metrics };
  }

  /**
   * Update running metrics
   */
  private updateMetrics(quality: number, iterations: number): void {
    const total = this.metrics.totalTasks;
    this.metrics.averageQuality =
      (this.metrics.averageQuality * (total - 1) + quality) / total;
    this.metrics.averageIterations =
      (this.metrics.averageIterations * (total - 1) + iterations) / total;

    // Persist metrics to MCP memory (fire and forget)
    this.persistMetrics().catch(() => {});
  }

  /**
   * Shutdown coordinator
   */
  async shutdown(): Promise<void> {
    console.log("[AgentCoordinator] Shutting down...");

    // Persist final metrics to MCP
    await this.persistMetrics();

    // Persist shutdown state
    await this.persistToMcp("coordinator_state", {
      sessionId: this.sessionId,
      swarmId: this.swarmId,
      status: "shutdown",
      finalMetrics: this.metrics,
      shutdownAt: new Date().toISOString(),
    });

    // Take final snapshot
    await this.memoryAgent.takeSnapshot("coordinator-shutdown");

    // Shutdown swarm
    await this.swarmAgent.shutdown();

    this.initialized = false;
    this.swarmId = null;
    console.log("[AgentCoordinator] Shutdown complete");
  }

  /**
   * Get coordinator status (for monitoring)
   */
  getStatus(): {
    initialized: boolean;
    sessionId: string;
    swarmId: string | null;
    metrics: CoordinatorMetrics;
    config: CoordinatorConfig;
  } {
    return {
      initialized: this.initialized,
      sessionId: this.sessionId,
      swarmId: this.swarmId,
      metrics: { ...this.metrics },
      config: { ...this.config },
    };
  }
}
