/**
 * Agent Coordinator - Orchestrates multiple specialized agents
 *
 * This coordinator serves as a bridge between the DeepAgents.js orchestrator
 * and the execution agents, providing:
 * - Single-pass execution with coordination-aware evaluation
 * - Dynamic evaluation criteria inferred from output format
 * - Reputation & pattern context fed into evaluator feedback
 * - Historical learning from past executions
 * - Swarm-based worker orchestration
 * - Persistent state via local memory
 */

import { SwarmAgent, SwarmResult } from "./swarm-agent.js";
import { TaskAgent, TaskConfig, TaskResult, TaskDecomposition } from "./task-agent.js";
import { MemoryAgent, MemoryNamespace, PatternEntry } from "./memory-agent.js";
import { WorkerAgent, WorkerType, WorkerResult } from "./worker-agent.js";
import { EvaluatorAgent, EvaluationResult, TaskEvaluation, CoordinationContext } from "./evaluator-agent.js";
import { ReputationManager, ReputationSummary } from "./reputation.js";
import { getDefaultPersistenceManager } from "../utils/persistence.js";
import { getGlobalLogger, type TopologyChange, type QAReport, type TaskExecutionRecord } from "../utils/logger.js";
import type { EvaluationCriteria } from "./evaluator-agent.js";

export interface CoordinatorConfig {
  /** Quality evaluation settings (single-pass, no iteration) */
  evaluation: {
    enabled: boolean;
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
  patternsLearned: number;
  reputationScores?: ReputationSummary[];
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  evaluation: {
    enabled: process.env.EVALUATION_ENABLED !== "false",
    qualityThreshold: parseFloat(process.env.QUALITY_THRESHOLD || "0.8"),
  },
  historicalLearning: {
    enabled: process.env.HISTORICAL_LEARNING_ENABLED !== "false",
    retrievalTopK: parseInt(process.env.RETRIEVAL_TOP_K || "5"),
    patternMinSuccessRate: parseFloat(process.env.PATTERN_MIN_SUCCESS_RATE || "0.7"),
  },
  swarm: {
    topology: (process.env.SWARM_TOPOLOGY as any) || "hierarchical-mesh",
    maxAgents: parseInt(process.env.SWARM_MAX_AGENTS || "8"),
  },
};

export class AgentCoordinator {
  private config: CoordinatorConfig;
  private swarmAgent: SwarmAgent;
  private taskAgent: TaskAgent;
  private memoryAgent: MemoryAgent;
  private evaluatorAgent: EvaluatorAgent;
  private reputationManager: ReputationManager;
  private workerAgents: Map<WorkerType, WorkerAgent>;
  private metrics: CoordinatorMetrics;
  private initialized = false;
  private sessionId: string;
  private swarmId: string | null = null;
  private logger = getGlobalLogger();

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
    this.reputationManager = new ReputationManager();

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
      patternsLearned: 0,
    };

    // Log coordinator initialization
    this.logger.log("info", "AgentCoordinator created", {
      sessionId: this.sessionId,
      topology: this.config.swarm.topology,
      maxAgents: this.config.swarm.maxAgents,
    });
  }

  /**
   * Initialize the coordinator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log("[AgentCoordinator] Initializing...");

    // Try to restore previous metrics from local memory
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

    // Log topology configuration
    await this.logger.logTopology(
      this.swarmId,
      this.config.swarm.topology,
      this.config.swarm.maxAgents,
      0, // No agents active yet
      [
        {
          type: "topology_changed",
          timestamp: new Date().toISOString(),
          details: {
            oldTopology: "none",
            newTopology: this.config.swarm.topology,
            maxAgents: this.config.swarm.maxAgents,
          },
        },
      ]
    );

    // Store initialization in local memory
    await this.memoryAgent.store(
      "coordinator-init",
      {
        swarmId: swarmResult.swarmId,
        topology: swarmResult.topology,
        timestamp: new Date().toISOString(),
      },
      "context"
    );

    // Persist to local memory for cross-session access
    await this.persistToLocal("coordinator_state", {
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
   * Persist data with automatic fallback to local file
   */
  private async persistToLocal(key: string, data: Record<string, unknown>): Promise<void> {
    const persistence = getDefaultPersistenceManager();
    const result = await persistence.store("sdk_coordinator", key, data);

    if (!result.success) {
      console.warn(`[AgentCoordinator] Failed to persist: ${result.error}`);
    } else if (result.backend === "local") {
      console.log(`[AgentCoordinator] Persisted to local file (local file)`);
    }
  }

  /**
   * Restore metrics with automatic fallback to local file
   */
  private async restoreMetrics(): Promise<void> {
    const persistence = getDefaultPersistenceManager();
    const result = await persistence.retrieve("sdk_coordinator", "coordinator_metrics");

    if (result.success && result.data) {
      const parsed = result.data;
      // Merge restored metrics with type safety
      this.metrics = {
        ...this.metrics,
        totalTasks: typeof parsed.totalTasks === "number" ? parsed.totalTasks : this.metrics.totalTasks,
        successfulTasks: typeof parsed.successfulTasks === "number" ? parsed.successfulTasks : this.metrics.successfulTasks,
        averageQuality: typeof parsed.averageQuality === "number" ? parsed.averageQuality : this.metrics.averageQuality,
        patternsLearned: typeof parsed.patternsLearned === "number" ? parsed.patternsLearned : this.metrics.patternsLearned,
      };
      console.log(`[AgentCoordinator] Restored metrics from ${result.backend} storage`);
    } else {
      // No previous metrics, starting fresh
      console.log("[AgentCoordinator] No previous metrics found, starting fresh");
    }
  }

  /**
   * Persist current metrics to local memory
   */
  private async persistMetrics(): Promise<void> {
    await this.persistToLocal("coordinator_metrics", {
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

    const startTime = new Date().toISOString();
    const executionErrors: Array<{ timestamp: string; message: string; recoverable: boolean }> = [];

    console.log("\n=== Task Execution ===");
    console.log(`Task: ${taskConfig.description}`);
    console.log(`Type: ${taskConfig.type}`);

    this.metrics.totalTasks++;

    // Log topology change (agents becoming active)
    await this.logger.logTopologyChange("configuration_changed", {
      active: true,
      taskType: taskConfig.type,
    });

    // Step 1: Retrieve historical patterns (if enabled)
    let historicalPatterns: PatternEntry[] = [];
    if (this.config.historicalLearning.enabled) {
      historicalPatterns = await this.memoryAgent.retrievePatterns(
        taskConfig.description,
        this.config.historicalLearning.retrievalTopK
      );
      console.log(`Patterns retrieved: ${historicalPatterns.length}`);
    }

    // Step 2: Create and decompose task
    console.log("Creating task...");
    const taskResult = await this.taskAgent.createTask(taskConfig);
    if (taskResult.status === "failed") {
      console.log("Task creation failed");
      return {
        success: false,
        taskId: taskResult.taskId,
        output: taskResult.error || "Task creation failed",
        quality: 0,
        iterations: 0,
        patterns: [],
      };
    }
    console.log(`Task created: ${taskResult.taskId}`);

    // Step 2b: Reputation-influenced routing
    if (taskConfig.assignTo && taskConfig.assignTo.length > 1) {
      taskConfig.assignTo = await this.reputationManager.selectAgent(
        taskConfig.assignTo,
        taskConfig.priority
      );
    }

    // Step 3: Single-pass execution + coordination-aware evaluation
    console.log("Dispatching task...");
    const dispatchResult = await this.taskAgent.dispatchTask(taskResult.taskId, "parallel");
    const output = dispatchResult.output || "";
    let quality = 0;
    let evaluation: TaskEvaluation | undefined;
    let coordinationCtx: CoordinationContext | null = null;
    let criteriaUsed: EvaluationCriteria[] = [];
    const executingAgent = taskConfig.assignTo?.[0] ?? `${taskConfig.type}-agent`;
    const agentReputationScore = await this.reputationManager.getScore(executingAgent);

    if (this.config.evaluation.enabled) {
      // Build coordination context for the evaluator
      coordinationCtx = {
        agentReputationScore,
        appliedPatterns: historicalPatterns.map((p) => p.description ?? p.id),
        coordinatorRecommendations: this.buildCoordinatorRecommendations(
          agentReputationScore,
          historicalPatterns
        ),
      };

      try {
        evaluation = await this.evaluatorAgent.evaluateTask(
          taskResult.taskId,
          taskConfig.description,
          taskConfig.requirements || [],
          output,
          taskConfig.type,
          coordinationCtx
        );
        quality = evaluation.evaluation.score;
        // Capture what criteria were actually used
        criteriaUsed = this.evaluatorAgent.getCriteriaOverride() ?? [];
      } catch (evalError: unknown) {
        const msg = evalError instanceof Error ? evalError.message : String(evalError);
        executionErrors.push({ timestamp: new Date().toISOString(), message: `Evaluation failed: ${msg}`, recoverable: true });
        quality = 0.7; // Fallback
      }
    } else {
      quality = 0.7; // Default quality without evaluation
    }

    const endTime = new Date().toISOString();

    console.log("\n--- Execution Result ---");
    console.log(`Task ID: ${taskResult.taskId}`);
    console.log(`Output length: ${output.length} chars`);

    // Step 4: Record reputation outcome
    await this.reputationManager.recordOutcome(executingAgent, taskResult.taskId, quality);

    // Step 5: Record execution and learn patterns
    const patternIds = historicalPatterns.map((p) => p.id);
    let patternLearned = false;

    if (this.config.historicalLearning.enabled && quality >= this.config.historicalLearning.patternMinSuccessRate) {
      patternLearned = await this.recordTaskExecution(taskConfig, output, quality, patternIds);
    }

    // Step 6: Update metrics
    const success = quality >= this.config.evaluation.qualityThreshold;
    if (success) {
      this.metrics.successfulTasks++;
    }
    this.updateMetrics(quality);

    // Step 7: Build QA report
    const qaReport: QAReport = {
      criteriaUsed: criteriaUsed.map((c) => ({ name: c.name, weight: c.weight })),
      evaluation: evaluation?.evaluation ?? null,
      coordinationContext: coordinationCtx,
      passedQualityGate: success,
      qualityThreshold: this.config.evaluation.qualityThreshold,
    };

    // Step 8: Build & persist comprehensive TaskExecutionRecord
    const execRecord = this.logger.buildTaskExecutionRecord({
      taskId: taskResult.taskId,
      taskType: taskConfig.type,
      taskDescription: taskConfig.description,
      requirements: taskConfig.requirements || [],
      agentName: executingAgent,
      agentType: taskConfig.type,
      agentReputationScore,
      startTime,
      endTime,
      output,
      success,
      qualityScore: quality,
      toolsUsed: [],  // Tool details captured at the agent level via logger
      metadata: null,  // Will be populated when backends emit metadata messages
      errors: executionErrors,
      qaReport,
      patternsApplied: patternIds,
      patternLearned,
      backendName: this.taskAgent.getBackendName(),
    });

    await this.logger.recordTaskExecution(execRecord);

    // Step 9: Build result
    const result: CoordinatedTaskResult = {
      success,
      taskId: taskResult.taskId,
      output,
      quality,
      iterations: 1,
      patterns: patternIds,
      evaluation,
    };

    console.log("\n--- Evaluation Result ---");
    console.log(`Quality: ${result.quality.toFixed(2)} (threshold: ${this.config.evaluation.qualityThreshold})`);
    console.log(`Passed: ${result.success}`);
    if (evaluation?.evaluation) {
      const e = evaluation.evaluation;
      if (e.passedCriteria.length) console.log(`Passed criteria: ${e.passedCriteria.join(", ")}`);
      if (e.failedCriteria.length) console.log(`Failed criteria: ${e.failedCriteria.join(", ")}`);
      if (e.recommendations.length) console.log(`Recommendations: ${e.recommendations.join(", ")}`);
    }
    console.log(`Patterns applied: ${patternIds.length}`);

    return result;
  }

  /**
   * Build coordinator-level recommendations for the evaluator based on
   * the executing agent's reputation and historical patterns.
   */
  private buildCoordinatorRecommendations(
    reputationScore: number,
    patterns: PatternEntry[]
  ): string[] {
    const recs: string[] = [];

    if (reputationScore < 0.5) {
      recs.push("Agent has low reputation — verify correctness and completeness carefully.");
    } else if (reputationScore < 0.7) {
      recs.push("Agent reputation is moderate — check edge cases and requirement coverage.");
    }

    if (patterns.length > 0) {
      const highQuality = patterns.filter((p) => p.successRate >= 0.9);
      if (highQuality.length > 0) {
        recs.push(
          `${highQuality.length} high-quality pattern(s) were available — ` +
          "verify the output follows proven approaches."
        );
      }
    } else {
      recs.push("No historical patterns matched — this is a novel task, evaluate thoroughly.");
    }

    return recs;
  }

  /**
   * Record task execution for learning.
   * Returns true if a new pattern was learned.
   */
  private async recordTaskExecution(
    taskConfig: TaskConfig,
    output: string,
    quality: number,
    patternIds: string[]
  ): Promise<boolean> {
    // Store task history
    await this.memoryAgent.store(
      `task-history-${Date.now()}`,
      {
        taskType: taskConfig.type,
        description: taskConfig.description,
        output,
        quality,
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
      return true;
    }
    return false;
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
   * Get coordinator metrics (includes reputation scores)
   */
  async getMetrics(): Promise<CoordinatorMetrics> {
    const reputationScores = await this.reputationManager.getAllScores();
    return { ...this.metrics, reputationScores };
  }

  /**
   * Update running metrics
   */
  private updateMetrics(quality: number): void {
    const total = this.metrics.totalTasks;
    this.metrics.averageQuality =
      (this.metrics.averageQuality * (total - 1) + quality) / total;

    // Persist metrics to local memory (fire and forget)
    this.persistMetrics().catch(() => {});
  }

  /**
   * Shutdown coordinator
   */
  async shutdown(): Promise<void> {
    console.log("[AgentCoordinator] Shutting down...");

    // Persist final metrics
    await this.persistMetrics();

    // Persist shutdown state
    await this.persistToLocal("coordinator_state", {
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
  async getStatus(): Promise<{
    initialized: boolean;
    sessionId: string;
    swarmId: string | null;
    metrics: CoordinatorMetrics;
    config: CoordinatorConfig;
  }> {
    return {
      initialized: this.initialized,
      sessionId: this.sessionId,
      swarmId: this.swarmId,
      metrics: await this.getMetrics(),
      config: { ...this.config },
    };
  }
}
