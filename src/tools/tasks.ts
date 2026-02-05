/**
 * Task Orchestration Tools
 *
 * LangChain tool wrappers for dispatching, tracking, and managing tasks
 * across the swarm. This is the orchestrator's primary dispatch interface.
 *
 * Tool names exposed to the LLM stay ergonomic; the callMcpTool() calls
 * map to the *actual* Claude Flow MCP server tool names.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { callMcpTool } from "../mcp/client.js";
import { optionalParams } from "../utils/params.js";
import {
  getProjectRoot,
  extractAndValidatePaths,
  getProjectContextString,
} from "../utils/project-context.js";

export const taskOrchestrate = tool(
  async ({ task, strategy, agents, timeout }) => {
    // Validate paths in the task description
    let projectRoot: string;
    try {
      projectRoot = getProjectRoot();
    } catch {
      // If project root is not set, proceed without validation
      return callMcpTool("coordination_orchestrate", {
        task,
        strategy,
        ...optionalParams({ agents, timeout }),
      });
    }

    const { invalid } = extractAndValidatePaths(task);

    if (invalid.length > 0) {
      return JSON.stringify({
        error: "SCOPE_VIOLATION",
        message: `Task references paths outside the project boundary.`,
        projectRoot,
        invalidPaths: invalid,
        suggestion:
          "Modify the task to only reference files within the project directory.",
      });
    }

    // Inject project context into the task
    const enhancedTask = `${getProjectContextString()}\n\nTASK:\n${task}`;

    return callMcpTool("coordination_orchestrate", {
      task: enhancedTask,
      strategy,
      ...optionalParams({ agents, timeout }),
    });
  },
  {
    name: "task_orchestrate",
    description:
      "Dispatch a complex task to the swarm for execution. The task will be " +
      "decomposed and assigned to appropriate agents based on the strategy. " +
      "Use 'parallel' for independent subtasks, 'sequential' for ordered dependencies, " +
      "'pipeline' for staged handoffs, 'broadcast' for all agents simultaneously. " +
      "Tasks are automatically validated to ensure they operate within the project boundary.",
    schema: z.object({
      task: z.string().describe("Full task description with context and goals"),
      strategy: z
        .enum(["parallel", "sequential", "pipeline", "broadcast"])
        .default("parallel")
        .describe("Execution strategy"),
      agents: z
        .array(z.string())
        .optional()
        .describe("Specific agent IDs to coordinate, or omit for auto-selection"),
      timeout: z
        .number()
        .optional()
        .describe("Timeout in milliseconds"),
    }),
  },
);

export const taskCreate = tool(
  async ({ type, description, priority, tags, assignTo }) => {
    // Validate paths in the task description
    let projectRoot: string;
    try {
      projectRoot = getProjectRoot();
    } catch {
      // If project root is not set, proceed without validation
      return callMcpTool("task_create", {
        type,
        description,
        ...optionalParams({ priority, tags, assignTo }),
      });
    }

    const { invalid } = extractAndValidatePaths(description);

    if (invalid.length > 0) {
      return JSON.stringify({
        error: "SCOPE_VIOLATION",
        message: `Task references paths outside the project boundary.`,
        projectRoot,
        invalidPaths: invalid,
        suggestion:
          "Modify the task description to only reference files within the project directory.",
      });
    }

    // Inject project context into the description
    const enhancedDescription = `[Project: ${projectRoot}]\n\n${description}`;

    return callMcpTool("task_create", {
      type,
      description: enhancedDescription,
      ...optionalParams({ priority, tags, assignTo }),
    });
  },
  {
    name: "task_create",
    description:
      "Create a new task in the task system. Returns a task ID for tracking. " +
      "Use this for individual work items that need to be assigned to agents. " +
      "Tasks are automatically validated to ensure they operate within the project boundary.",
    schema: z.object({
      type: z
        .enum(["feature", "bugfix", "research", "refactor"])
        .describe("Task type"),
      description: z.string().describe("Full task description"),
      priority: z
        .enum(["low", "normal", "high", "critical"])
        .optional()
        .describe("Task priority level"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorization"),
      assignTo: z
        .array(z.string())
        .optional()
        .describe("Agent IDs to assign the task to"),
    }),
  },
);

export const taskStatus = tool(
  async ({ taskId }) => {
    return callMcpTool("task_status", { taskId });
  },
  {
    name: "task_status",
    description:
      "Check the execution status of a dispatched task. Returns current state, " +
      "assigned agent, progress percentage, and any errors encountered.",
    schema: z.object({
      taskId: z.string().describe("Task ID to check"),
    }),
  },
);

export const taskList = tool(
  async ({ status, type, priority, assignedTo, limit }) => {
    return callMcpTool("task_list", {
      ...optionalParams({ status, type, priority, assignedTo, limit }),
    });
  },
  {
    name: "task_list",
    description:
      "List all tasks with optional filters. Use this to get an overview " +
      "of all active, pending, or completed tasks across the system.",
    schema: z.object({
      status: z.string().optional().describe("Filter by status"),
      type: z.string().optional().describe("Filter by type"),
      priority: z.string().optional().describe("Filter by priority"),
      assignedTo: z.string().optional().describe("Filter by assigned agent"),
      limit: z.number().optional().describe("Max tasks to return"),
    }),
  },
);

export const taskComplete = tool(
  async ({ taskId, result }) => {
    return callMcpTool("task_complete", {
      taskId,
      ...optionalParams({ result }),
    });
  },
  {
    name: "task_complete",
    description:
      "Mark a task as complete and optionally attach result data.",
    schema: z.object({
      taskId: z.string().describe("Task ID to complete"),
      result: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Result data to attach"),
    }),
  },
);

export const loadBalance = tool(
  async ({ task, algorithm }) => {
    // Validate paths in the task description
    let projectRoot: string;
    try {
      projectRoot = getProjectRoot();
    } catch {
      // If project root is not set, proceed without validation
      return callMcpTool("coordination_load_balance", {
        action: "distribute",
        task,
        ...optionalParams({ algorithm }),
      });
    }

    const { invalid } = extractAndValidatePaths(task);

    if (invalid.length > 0) {
      return JSON.stringify({
        error: "SCOPE_VIOLATION",
        message: `Task references paths outside the project boundary.`,
        projectRoot,
        invalidPaths: invalid,
      });
    }

    // Inject project context
    const enhancedTask = `[Project: ${projectRoot}] ${task}`;

    return callMcpTool("coordination_load_balance", {
      action: "distribute",
      task: enhancedTask,
      ...optionalParams({ algorithm }),
    });
  },
  {
    name: "load_balance",
    description:
      "Distribute a task across available agents based on " +
      "current load, capabilities, and performance history. " +
      "Optimizes for throughput and minimizes bottlenecks. " +
      "Tasks are validated to stay within project boundaries.",
    schema: z.object({
      task: z.string().describe("Task description to distribute"),
      algorithm: z
        .enum(["round-robin", "least-connections", "weighted", "adaptive"])
        .optional()
        .describe("Load balancing algorithm"),
    }),
  },
);

export const coordinationSync = tool(
  async ({ force, conflictResolution }) => {
    return callMcpTool("coordination_sync", {
      action: "trigger",
      ...optionalParams({ force, conflictResolution }),
    });
  },
  {
    name: "coordination_sync",
    description:
      "Synchronize coordination state across all agents in a swarm. " +
      "Forces a state reconciliation to ensure all agents have consistent " +
      "views of task assignments, progress, and shared context.",
    schema: z.object({
      force: z
        .boolean()
        .optional()
        .describe("Force synchronization even if no drift detected"),
      conflictResolution: z
        .enum(["latest", "merge", "manual"])
        .optional()
        .describe("How to resolve conflicts"),
    }),
  },
);

export const consensus = tool(
  async ({ proposal, type }) => {
    return callMcpTool("hive-mind_consensus", {
      action: "propose",
      value: proposal,
      ...optionalParams({ type }),
    });
  },
  {
    name: "consensus_vote",
    description:
      "Submit a proposal for consensus voting among agents. Use this " +
      "for critical decisions that require agreement: architecture choices, " +
      "merge approvals, strategy changes.",
    schema: z.object({
      proposal: z.string().describe("The proposal to vote on"),
      type: z
        .string()
        .optional()
        .describe("Proposal type for categorization"),
    }),
  },
);

export const taskTools = [
  taskOrchestrate,
  taskCreate,
  taskStatus,
  taskList,
  taskComplete,
  loadBalance,
  coordinationSync,
  consensus,
];
