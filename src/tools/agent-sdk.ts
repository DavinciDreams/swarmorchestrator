/**
 * Agent SDK Execution Tools
 *
 * LangChain tools that wrap the Agent SDK agents, allowing the DeepAgents.js
 * orchestrator to delegate complex tasks to the Agent SDK for execution.
 *
 * This creates a hybrid architecture:
 * - DeepAgents.js handles coordination, checkpointing, and subagent management
 * - Agent SDK agents handle focused task execution with Claude's native tools
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { AgentCoordinator, CoordinatedTaskResult } from "../agents/agent-coordinator.js";
import { TaskConfig, TaskType } from "../agents/task-agent.js";
import { WorkerType } from "../agents/worker-agent.js";
import { getDefaultPersistenceManager } from "../utils/persistence.js";
import { getProjectRoot } from "../utils/project-context.js";

// Singleton coordinator instance
let coordinator: AgentCoordinator | null = null;

/**
 * Get or create the AgentCoordinator singleton
 */
async function getCoordinator(): Promise<AgentCoordinator> {
  if (!coordinator) {
    coordinator = new AgentCoordinator({
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
    });
    await coordinator.initialize();
  }
  return coordinator;
}

/**
 * Shutdown the coordinator (for cleanup)
 */
export async function shutdownCoordinator(): Promise<void> {
  if (coordinator) {
    await coordinator.shutdown();
    coordinator = null;
  }
}

// =============================================================================
// SDK Execution Tools
// =============================================================================

/**
 * Execute a complex task using the Agent SDK with iterative refinement
 */
export const sdkExecuteTask = tool(
  async ({ taskType, description, requirements, targetPath }): Promise<string> => {
    try {
      const coord = await getCoordinator();

      // Validate target path if provided
      if (targetPath) {
        const projectRoot = getProjectRoot();
        if (!targetPath.startsWith(projectRoot)) {
          return JSON.stringify({
            success: false,
            error: "SCOPE_VIOLATION",
            message: `Target path must be within project root: ${projectRoot}`,
            targetPath,
          });
        }
      }

      const taskConfig: TaskConfig = {
        type: taskType as TaskType,
        description,
        requirements: requirements || [],
        targetPath,
      };

      const result = await coord.executeWithImprovement(taskConfig);

      return JSON.stringify(result);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: "EXECUTION_FAILED",
        message: errorMessage,
      });
    }
  },
  {
    name: "sdk_execute_task",
    description: `Execute a complex task using the Agent SDK with iterative refinement and quality evaluation.
Use this tool for:
- Complex code generation that needs quality checks
- Multi-step tasks requiring iterative improvement
- Tasks where historical patterns can improve outcomes

The Agent SDK uses Claude's native tools (Read, Write, Edit, Bash, etc.) for execution,
with iterative refinement to meet quality thresholds.`,
    schema: z.object({
      taskType: z
        .enum(["feature", "bugfix", "research", "refactor", "documentation", "testing", "security", "performance"])
        .describe("Type of task to execute"),
      description: z.string().describe("Detailed description of the task"),
      requirements: z
        .array(z.string())
        .optional()
        .describe("Specific requirements or acceptance criteria"),
      targetPath: z
        .string()
        .optional()
        .describe("Target file or directory path (must be within project root)"),
    }),
  }
);

/**
 * Execute a code generation task with Agent SDK
 */
export const sdkCodeTask = tool(
  async ({ action, targetPath, description, context }): Promise<string> => {
    try {
      const coord = await getCoordinator();

      const projectRoot = getProjectRoot();
      if (!targetPath.startsWith(projectRoot) && !targetPath.startsWith("./") && !targetPath.startsWith("src/")) {
        // Try prepending project root for relative paths
        const fullPath = `${projectRoot}/${targetPath}`;
        if (!fullPath.startsWith(projectRoot)) {
          return JSON.stringify({
            success: false,
            error: "SCOPE_VIOLATION",
            message: `Target path must be within project root: ${projectRoot}`,
          });
        }
      }

      // Map action to task type
      const taskTypeMap: Record<string, TaskType> = {
        generate: "feature",
        modify: "refactor",
        fix: "bugfix",
        document: "documentation",
        test: "testing",
      };

      const taskConfig: TaskConfig = {
        type: taskTypeMap[action] || "feature",
        description: `${action.toUpperCase()}: ${description}\n\nTarget: ${targetPath}${context ? `\n\nContext: ${context}` : ""}`,
        requirements: [`Target path: ${targetPath}`],
        targetPath,
      };

      const result = await coord.executeWithImprovement(taskConfig);

      return JSON.stringify(result);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: "CODE_TASK_FAILED",
        message: errorMessage,
      });
    }
  },
  {
    name: "sdk_code_task",
    description: `Execute a code-specific task using the Agent SDK.
Use this for:
- Generating new code files or functions
- Modifying existing code with specific changes
- Fixing bugs in code
- Adding documentation to code
- Writing tests for code

This tool delegates to specialized Agent SDK agents that use Claude's native
code editing tools (Read, Write, Edit) with iterative quality refinement.`,
    schema: z.object({
      action: z
        .enum(["generate", "modify", "fix", "document", "test"])
        .describe("Type of code action to perform"),
      targetPath: z.string().describe("File or directory path to operate on"),
      description: z.string().describe("What code changes to make"),
      context: z
        .string()
        .optional()
        .describe("Additional context about the codebase or requirements"),
    }),
  }
);

/**
 * Run an audit task with Agent SDK
 */
export const sdkAuditTask = tool(
  async ({ auditType, targetPath, scope }): Promise<string> => {
    try {
      const coord = await getCoordinator();

      const projectRoot = getProjectRoot();
      const fullTargetPath = targetPath || projectRoot;

      // Map audit type to task type and worker
      const auditTaskType: Record<string, TaskType> = {
        security: "security",
        performance: "performance",
        quality: "refactor",
        dependencies: "security",
      };

      const taskConfig: TaskConfig = {
        type: auditTaskType[auditType] || "security",
        description: `${auditType.toUpperCase()} AUDIT: Analyze ${fullTargetPath} for ${auditType} issues.\n\nScope: ${scope || "full"}`,
        requirements: [
          `Audit type: ${auditType}`,
          `Scope: ${scope || "full"}`,
          "Provide detailed findings with severity levels",
          "Include actionable recommendations",
        ],
        targetPath: fullTargetPath,
      };

      const result = await coord.executeWithImprovement(taskConfig);

      // Also run the specialized worker if available
      try {
        const workerResult = await coord.runWorker("audit" as WorkerType, fullTargetPath);
        return JSON.stringify({
          ...result,
          workerAudit: workerResult,
        });
      } catch {
        // Worker not available, return just the task result
        return JSON.stringify(result);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: "AUDIT_FAILED",
        message: errorMessage,
      });
    }
  },
  {
    name: "sdk_audit_task",
    description: `Run an audit using the Agent SDK with specialized workers.
Use this for:
- Security vulnerability scanning
- Performance analysis and bottleneck detection
- Code quality and maintainability audits
- Dependency vulnerability checks

This tool combines Agent SDK task execution with swarm-based worker agents
that can chunk and parallelize the audit across multiple files.`,
    schema: z.object({
      auditType: z
        .enum(["security", "performance", "quality", "dependencies"])
        .describe("Type of audit to perform"),
      targetPath: z
        .string()
        .optional()
        .describe("Path to audit (defaults to project root)"),
      scope: z
        .enum(["full", "quick", "critical-only"])
        .optional()
        .describe("Audit scope/depth"),
    }),
  }
);

/**
 * Run a background worker task
 */
export const sdkRunWorker = tool(
  async ({ workerType, targetPath }): Promise<string> => {
    try {
      const coord = await getCoordinator();
      const projectRoot = getProjectRoot();
      const fullPath = targetPath || projectRoot;

      const result = await coord.runWorker(workerType as WorkerType, fullPath);

      // Persist result to local memory
      const persistence = getDefaultPersistenceManager();
      await persistence.store("workers", `${workerType}-${Date.now()}`, result as unknown as Record<string, unknown>, ["worker-result", workerType]);

      return JSON.stringify(result);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: "WORKER_FAILED",
        message: errorMessage,
      });
    }
  },
  {
    name: "sdk_run_worker",
    description: `Run a specialized swarm worker using the Agent SDK.
Workers use swarm-based chunking to process large codebases in parallel.

Available workers:
- map: Build codebase structure maps
- audit: Run security/quality audits
- optimize: Analyze and suggest optimizations
- testgaps: Identify missing test coverage

Workers automatically scale agent count based on task size (2-8 agents).`,
    schema: z.object({
      workerType: z
        .enum(["map", "audit", "optimize", "testgaps"])
        .describe("Type of worker to run"),
      targetPath: z
        .string()
        .optional()
        .describe("Target path for the worker (defaults to project root)"),
    }),
  }
);

/**
 * Get Agent SDK coordinator status and metrics
 */
export const sdkGetMetrics = tool(
  async (): Promise<string> => {
    try {
      const coord = await getCoordinator();
      const metrics = await coord.getMetrics();

      return JSON.stringify({
        success: true,
        metrics,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: "METRICS_FAILED",
        message: errorMessage,
      });
    }
  },
  {
    name: "sdk_get_metrics",
    description: `Get metrics from the Agent SDK coordinator.
Returns:
- Total tasks executed
- Success rate
- Average quality scores
- Average iterations per task
- Patterns learned

Use this to monitor Agent SDK execution performance.`,
    schema: z.object({}),
  }
);

// =============================================================================
// Export all SDK tools
// =============================================================================

export const sdkTools = [
  sdkExecuteTask,
  sdkCodeTask,
  sdkAuditTask,
  sdkRunWorker,
  sdkGetMetrics,
];
