/**
 * Task Agent - Specialized for task orchestration and dispatch
 * Handles task creation, decomposition, and tracking
 */

import { BaseAgent, AgentConfig } from "./base-agent.js";
import { getProjectRoot, getProjectContextString, extractAndValidatePaths } from "../utils/project-context.js";

export type TaskType = "feature" | "bugfix" | "research" | "refactor" | "documentation" | "testing" | "security" | "performance" | "audit" | "optimize";

export interface TaskConfig {
  type: TaskType;
  description: string;
  priority?: "low" | "normal" | "high" | "critical";
  requirements?: string[];
  assignTo?: string[];
  /** Target file or directory path */
  targetPath?: string;
}

export interface TaskResult {
  taskId: string;
  status: "created" | "dispatched" | "in_progress" | "completed" | "failed";
  description: string;
  subtasks?: string[];
  output?: string;
  error?: string;
}

export interface TaskDecomposition {
  mainTask: string;
  subtasks: Array<{
    id: string;
    description: string;
    dependencies: string[];
    estimatedComplexity: "low" | "medium" | "high";
  }>;
  executionOrder: string[];
}

export class TaskAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super("task-agent", {
      model: "haiku",
      maxTokens: 4096,
      allowedTools: ["Read", "Write", "Glob", "Grep"],
      permissionMode: "bypassPermissions",
      ...config,
    });
  }

  /**
   * Create a new task with validation
   */
  async createTask(taskConfig: TaskConfig): Promise<TaskResult> {
    // Validate paths in task description
    const { invalid } = extractAndValidatePaths(taskConfig.description);
    if (invalid.length > 0) {
      return {
        taskId: "",
        status: "failed",
        description: taskConfig.description,
        error: `SCOPE_VIOLATION: Task references paths outside project boundary: ${invalid.join(", ")}`,
      };
    }

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildCreatePrompt(taskConfig);

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseTaskResult(response, "created", taskConfig.description);
  }

  /**
   * Decompose a complex task into subtasks
   */
  async decomposeTask(description: string): Promise<TaskDecomposition> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Decompose this task into smaller, independently-completable subtasks:

TASK: ${description}

For each subtask, provide:
1. A unique ID (subtask-1, subtask-2, etc.)
2. Clear description with acceptance criteria
3. Dependencies on other subtasks (if any)
4. Estimated complexity (low/medium/high)

Also determine the optimal execution order considering dependencies.
Format your response as structured data.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseDecomposition(response, description);
  }

  /**
   * Dispatch a task to the swarm for execution
   */
  async dispatchTask(
    taskId: string,
    strategy: "parallel" | "sequential" | "pipeline" | "broadcast" = "parallel"
  ): Promise<TaskResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Dispatch task ${taskId} to the swarm using ${strategy} strategy.

Execution strategy details:
- parallel: Run independent subtasks simultaneously
- sequential: Run subtasks in order, waiting for each to complete
- pipeline: Pass output of each subtask to the next
- broadcast: Send task to all agents simultaneously

Monitor execution and report progress.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseTaskResult(response, "dispatched", taskId);
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<TaskResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Check status of task ${taskId}.
Report: current status, progress percentage, assigned agents, any blockers.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseTaskResult(response, "in_progress", taskId);
  }

  /**
   * Complete a task with results
   */
  async completeTask(taskId: string, result?: string): Promise<TaskResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Mark task ${taskId} as complete.
${result ? `Result: ${result}` : ""}

Finalize the task, store results in memory, and clean up resources.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseTaskResult(response, "completed", taskId);
  }

  private buildSystemPrompt(): string {
    let projectContext = "";
    try {
      projectContext = getProjectContextString();
    } catch {
      // Project root not set
    }

    return `You are a Task Orchestration Agent responsible for creating, decomposing, and managing tasks across the swarm.

${projectContext}

Your responsibilities:
1. Create tasks with clear acceptance criteria
2. Decompose complex tasks into manageable subtasks
3. Determine optimal execution strategies
4. Track task progress and handle failures
5. Ensure all tasks stay within project boundaries

Task types:
- feature: New functionality implementation
- bugfix: Bug fixes and corrections
- research: Investigation and analysis
- refactor: Code improvement without changing behavior
- documentation: Documentation generation/updates
- testing: Test creation and validation
- security: Security audits and vulnerability fixes
- performance: Performance analysis and optimization
- audit: General quality audits
- optimize: Code optimization

Always validate that tasks operate within the project directory.`;
  }

  private buildCreatePrompt(taskConfig: TaskConfig): string {
    let projectRoot = "";
    try {
      projectRoot = getProjectRoot();
    } catch {
      projectRoot = process.cwd();
    }

    return `Create a new task:

Type: ${taskConfig.type}
Description: ${taskConfig.description}
Priority: ${taskConfig.priority || "normal"}
${taskConfig.requirements?.length ? `Requirements:\n${taskConfig.requirements.map((r) => `- ${r}`).join("\n")}` : ""}
${taskConfig.assignTo?.length ? `Assign to: ${taskConfig.assignTo.join(", ")}` : ""}

Project Root: ${projectRoot}

Generate a task ID and confirm creation.`;
  }

  private parseTaskResult(
    response: string,
    expectedStatus: TaskResult["status"],
    fallbackId: string
  ): TaskResult {
    const taskIdMatch = response.match(/task[_-]?id[:\s]+([a-zA-Z0-9-_]+)/i);
    const statusMatch = response.match(/status[:\s]+(created|dispatched|in_progress|completed|failed)/i);
    const subtasksMatch = response.match(/subtasks?[:\s]+\[(.*?)\]/i);

    return {
      taskId: taskIdMatch?.[1] || fallbackId || `task-${Date.now()}`,
      status: statusMatch?.[1] as TaskResult["status"] ||
        (response.toLowerCase().includes("error") ? "failed" : expectedStatus),
      description: fallbackId,
      subtasks: subtasksMatch ? subtasksMatch[1].split(",").map((s) => s.trim()) : undefined,
      output: response,
    };
  }

  private parseDecomposition(response: string, mainTask: string): TaskDecomposition {
    const subtasks: TaskDecomposition["subtasks"] = [];
    const subtaskMatches = response.matchAll(
      /subtask-(\d+)[:\s]+(.+?)(?:dependencies?[:\s]+\[(.*?)\])?(?:complexity[:\s]+(low|medium|high))?/gi
    );

    for (const match of subtaskMatches) {
      subtasks.push({
        id: `subtask-${match[1]}`,
        description: match[2]?.trim() || "",
        dependencies: match[3]?.split(",").map((d) => d.trim()).filter(Boolean) || [],
        estimatedComplexity: (match[4]?.toLowerCase() as "low" | "medium" | "high") || "medium",
      });
    }

    // If no subtasks parsed, create a default structure
    if (subtasks.length === 0) {
      subtasks.push({
        id: "subtask-1",
        description: mainTask,
        dependencies: [],
        estimatedComplexity: "medium",
      });
    }

    return {
      mainTask,
      subtasks,
      executionOrder: subtasks.map((s) => s.id),
    };
  }
}
