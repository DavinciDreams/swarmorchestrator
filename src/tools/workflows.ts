/**
 * Workflow & Performance Tools
 *
 * LangChain tool wrappers for workflow execution, performance monitoring,
 * and system health — critical for long-term autonomous operation.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { callMcpTool } from "../mcp/client.js";
import { optionalParams } from "../utils/params.js";

export const workflowExecute = tool(
  async ({ workflowId, variables }) => {
    return callMcpTool("workflow_execute", {
      workflowId,
      ...optionalParams({ variables }),
    });
  },
  {
    name: "workflow_execute",
    description:
      "Execute a predefined workflow. Pass runtime variables to override defaults.",
    schema: z.object({
      workflowId: z.string().describe("Workflow ID to execute"),
      variables: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Runtime variables to inject into the workflow"),
    }),
  },
);

export const workflowCreate = tool(
  async ({ name, description, steps }) => {
    return callMcpTool("workflow_create", {
      name,
      ...optionalParams({ description, steps }),
    });
  },
  {
    name: "workflow_create",
    description:
      "Create a new custom workflow with defined steps. " +
      "Use this to define reusable execution patterns for recurring task types. " +
      "Step types: task, condition, parallel, loop, wait.",
    schema: z.object({
      name: z.string().describe("Workflow name"),
      description: z.string().optional().describe("Workflow description"),
      steps: z
        .array(
          z.object({
            name: z.string(),
            type: z.enum(["task", "condition", "parallel", "loop", "wait"]),
            config: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .optional()
        .describe("Ordered steps in the workflow"),
    }),
  },
);

export const performanceReport = tool(
  async ({ format, timeRange, components }) => {
    return callMcpTool("performance_report", {
      ...optionalParams({ format, timeRange, components }),
    });
  },
  {
    name: "performance_report",
    description:
      "Generate a performance report for the orchestration system. " +
      "Includes agent throughput, task completion rates, error rates, " +
      "token usage, and latency metrics. Use this regularly to detect " +
      "degradation and inform scaling decisions.",
    schema: z.object({
      format: z
        .enum(["summary", "detailed", "json"])
        .default("summary")
        .describe("Report format"),
      timeRange: z
        .enum(["1h", "24h", "7d"])
        .default("24h")
        .describe("Time window for metrics"),
      components: z
        .array(z.string())
        .optional()
        .describe("Specific components to include"),
    }),
  },
);

export const bottleneckAnalyze = tool(
  async ({ component, deep, threshold }) => {
    return callMcpTool("performance_bottleneck", {
      ...optionalParams({ component, deep, threshold }),
    });
  },
  {
    name: "bottleneck_analyze",
    description:
      "Identify performance bottlenecks in the orchestration pipeline. " +
      "Analyzes agent utilization, task queue depth, memory pressure, " +
      "and coordination overhead to find the constraining resource.",
    schema: z.object({
      component: z
        .string()
        .optional()
        .describe("Specific component to analyze, or omit for full system"),
      deep: z
        .boolean()
        .optional()
        .describe("Run deep analysis"),
      threshold: z
        .number()
        .optional()
        .describe("Alert threshold"),
    }),
  },
);

export const healthCheck = tool(
  async ({ deep, fix, components }) => {
    return callMcpTool("system_health", {
      ...optionalParams({ deep, fix, components }),
    });
  },
  {
    name: "health_check",
    description:
      "Run a comprehensive health check on the orchestration system. " +
      "Verifies MCP connectivity, agent responsiveness, memory backend, " +
      "neural system, and consensus mechanisms. Essential for maintaining " +
      "long-running autonomous operations.",
    schema: z.object({
      deep: z
        .boolean()
        .optional()
        .describe("Perform deep health check"),
      fix: z
        .boolean()
        .optional()
        .describe("Attempt to fix issues found"),
      components: z
        .array(z.string())
        .optional()
        .describe("Specific components to check, or omit for all"),
    }),
  },
);

export const faultTolerance = tool(
  async ({ agentId, feedback, performanceScore, suggestions }) => {
    return callMcpTool("daa_agent_adapt", {
      agentId,
      ...optionalParams({ feedback, performanceScore, suggestions }),
    });
  },
  {
    name: "fault_tolerance",
    description:
      "Trigger agent adaptation based on failure feedback. Provides feedback " +
      "to the agent's learning system so it can adjust behavior. Use after " +
      "failures to help agents self-correct.",
    schema: z.object({
      agentId: z.string().describe("Agent to apply adaptation to"),
      feedback: z
        .string()
        .optional()
        .describe("Feedback message about the failure or issue"),
      performanceScore: z
        .number()
        .optional()
        .describe("Performance score 0-1"),
      suggestions: z
        .array(z.string())
        .optional()
        .describe("Improvement suggestions"),
    }),
  },
);

export const workflowTools = [
  workflowExecute,
  workflowCreate,
  performanceReport,
  bottleneckAnalyze,
  healthCheck,
  faultTolerance,
];
