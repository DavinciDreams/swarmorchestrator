/**
 * Agent Lifecycle Tools
 *
 * LangChain tool wrappers for spawning, listing, communicating with,
 * and managing the lifecycle of individual agents within swarms.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { callMcpTool } from "../mcp/client.js";
import { optionalParams } from "../utils/params.js";

export const agentSpawn = tool(
  async ({ agentType, agentId, task, model, domain, config }) => {
    return callMcpTool("agent_spawn", {
      agentType,
      ...optionalParams({ agentId, task, model, domain, config }),
    });
  },
  {
    name: "agent_spawn",
    description:
      "Spawn a new specialized agent into a swarm. Agent types include: " +
      "worker, coder, reviewer, tester, planner, researcher, and more. " +
      "Optionally specify a model (haiku=fast/cheap, sonnet=balanced, opus=most capable).",
    schema: z.object({
      agentType: z.string().describe("Agent type (e.g. worker, coder, reviewer, planner, researcher)"),
      agentId: z.string().optional().describe("Custom unique ID for this agent"),
      task: z.string().optional().describe("Task description for intelligent model routing"),
      model: z
        .enum(["haiku", "sonnet", "opus", "inherit"])
        .optional()
        .describe("Claude model to use"),
      domain: z.string().optional().describe("Agent domain"),
      config: z.record(z.unknown()).optional().describe("Additional agent configuration"),
    }),
  },
);

export const agentList = tool(
  async ({ status, domain, includeTerminated }) => {
    return callMcpTool("agent_list", {
      ...optionalParams({ status, domain, includeTerminated }),
    });
  },
  {
    name: "agent_list",
    description:
      "List all active agents and their current state, assigned tasks, " +
      "and capabilities. Optionally filter by status or domain.",
    schema: z.object({
      status: z
        .string()
        .optional()
        .describe("Filter by agent status"),
      domain: z
        .string()
        .optional()
        .describe("Filter by agent domain"),
      includeTerminated: z
        .boolean()
        .optional()
        .describe("Include terminated agents in the listing"),
    }),
  },
);

export const agentHealth = tool(
  async ({ agentId, threshold }) => {
    return callMcpTool("agent_health", {
      ...optionalParams({ agentId, threshold }),
    });
  },
  {
    name: "agent_health",
    description:
      "Check health status of agents. Returns health scores, " +
      "responsiveness, and any issues detected.",
    schema: z.object({
      agentId: z
        .string()
        .optional()
        .describe("Specific agent, or omit for all"),
      threshold: z
        .number()
        .optional()
        .describe("Health threshold (0-1) to flag unhealthy agents"),
    }),
  },
);

export const agentBroadcast = tool(
  async ({ message, fromId, priority }) => {
    return callMcpTool("hive-mind_broadcast", {
      message,
      ...optionalParams({ fromId, priority }),
    });
  },
  {
    name: "agent_broadcast",
    description:
      "Broadcast a message to all agents in the hive-mind. Use this for " +
      "system-wide announcements, coordination signals, and status updates.",
    schema: z.object({
      message: z.string().describe("Message content to broadcast"),
      fromId: z.string().optional().describe("Sending agent ID"),
      priority: z
        .enum(["low", "normal", "high", "critical"])
        .optional()
        .describe("Message priority"),
    }),
  },
);

export const agentTerminate = tool(
  async ({ agentId, force }) => {
    return callMcpTool("agent_terminate", {
      agentId,
      ...optionalParams({ force }),
    });
  },
  {
    name: "agent_terminate",
    description:
      "Terminate an agent. Use force=true for immediate termination " +
      "without waiting for tasks to complete.",
    schema: z.object({
      agentId: z.string().describe("Agent to terminate"),
      force: z
        .boolean()
        .optional()
        .describe("Force immediate termination"),
    }),
  },
);

export const agentUpdate = tool(
  async ({ agentId, status, health, config }) => {
    return callMcpTool("agent_update", {
      agentId,
      ...optionalParams({ status, health, config }),
    });
  },
  {
    name: "agent_update",
    description:
      "Update an agent's status or configuration. Use this to pause, " +
      "resume, or reconfigure agents without terminating them.",
    schema: z.object({
      agentId: z.string().describe("Target agent"),
      status: z.string().optional().describe("New agent status"),
      health: z.number().optional().describe("Health value (0-1)"),
      config: z.record(z.unknown()).optional().describe("Config updates"),
    }),
  },
);

export const capabilityMatch = tool(
  async ({ task, context }) => {
    return callMcpTool("hooks_route", {
      task,
      ...optionalParams({ context }),
    });
  },
  {
    name: "capability_match",
    description:
      "Given a task description, find the best-matched agent type " +
      "using semantic routing. Returns the optimal agent for the task.",
    schema: z.object({
      task: z.string().describe("Task description to match against agent capabilities"),
      context: z.string().optional().describe("Additional context for routing"),
    }),
  },
);

export const agentTools = [
  agentSpawn,
  agentList,
  agentHealth,
  agentBroadcast,
  agentTerminate,
  agentUpdate,
  capabilityMatch,
];
