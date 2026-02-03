/**
 * Swarm Management Tools
 *
 * LangChain tool wrappers around Claude Flow MCP swarm operations.
 * These give the orchestrator the ability to initialize, monitor,
 * scale, and destroy agent swarms.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { callMcpTool } from "../mcp/client.js";

export const swarmInit = tool(
  async ({ topology, maxAgents, config }) => {
    return callMcpTool("swarm_init", {
      ...(topology ? { topology } : {}),
      ...(maxAgents ? { maxAgents } : {}),
      ...(config ? { config } : {}),
    });
  },
  {
    name: "swarm_init",
    description:
      "Initialize a new agent swarm with a specific topology. " +
      "Topologies: hierarchical (queen-led, anti-drift), mesh (peer-to-peer), " +
      "ring (sequential), star (central hub), adaptive (dynamic).",
    schema: z.object({
      topology: z
        .enum(["mesh", "hierarchical", "ring", "star", "adaptive"])
        .optional()
        .describe("Swarm topology pattern"),
      maxAgents: z
        .number()
        .min(2)
        .max(15)
        .optional()
        .describe("Maximum number of agents in the swarm"),
      config: z
        .record(z.unknown())
        .optional()
        .describe("Additional swarm configuration"),
    }),
  },
);

export const swarmStatus = tool(
  async ({ swarmId }) => {
    return callMcpTool("swarm_status", {
      ...(swarmId ? { swarmId } : {}),
    });
  },
  {
    name: "swarm_status",
    description:
      "Get the current health, topology, agent count, and performance metrics of a swarm. " +
      "Use this to monitor swarm progress and detect issues. " +
      "Omit swarmId to get status of all active swarms.",
    schema: z.object({
      swarmId: z
        .string()
        .optional()
        .describe("Swarm ID to check, or omit for all swarms"),
    }),
  },
);

export const swarmHealth = tool(
  async ({ swarmId }) => {
    return callMcpTool("swarm_health", {
      ...(swarmId ? { swarmId } : {}),
    });
  },
  {
    name: "swarm_health",
    description:
      "Get real-time health data for a swarm including agent activity, " +
      "task throughput, error rates, and coordination metrics.",
    schema: z.object({
      swarmId: z
        .string()
        .optional()
        .describe("Swarm ID to check health"),
    }),
  },
);

export const swarmScale = tool(
  async ({ targetSize, agentType }) => {
    return callMcpTool("agent_pool", {
      action: "scale",
      ...(targetSize ? { targetSize } : {}),
      ...(agentType ? { agentType } : {}),
    });
  },
  {
    name: "swarm_scale",
    description:
      "Scale the agent pool up or down by adjusting the target size. " +
      "Use this when workload increases or decreases demand more/fewer agents.",
    schema: z.object({
      targetSize: z.number().min(1).max(15).optional().describe("Desired agent count"),
      agentType: z.string().optional().describe("Filter by agent type"),
    }),
  },
);

export const swarmShutdown = tool(
  async ({ swarmId, graceful }) => {
    return callMcpTool("swarm_shutdown", {
      ...(swarmId ? { swarmId } : {}),
      graceful: graceful ?? true,
    });
  },
  {
    name: "swarm_shutdown",
    description:
      "Shut down a swarm. By default performs a graceful shutdown that " +
      "waits for in-progress tasks to complete, persists memory, and deallocates agents.",
    schema: z.object({
      swarmId: z.string().optional().describe("Swarm to shut down"),
      graceful: z
        .boolean()
        .default(true)
        .describe("Wait for tasks to finish before shutting down"),
    }),
  },
);

export const topologyOptimize = tool(
  async ({ type }) => {
    return callMcpTool("coordination_topology", {
      action: "optimize",
      ...(type ? { type } : {}),
    });
  },
  {
    name: "topology_optimize",
    description:
      "Analyze current swarm workload and auto-optimize the topology. " +
      "May switch from hierarchical to mesh if peer coordination would be more efficient, " +
      "or vice versa.",
    schema: z.object({
      type: z
        .enum(["mesh", "hierarchical", "ring", "star", "hybrid", "hierarchical-mesh", "adaptive"])
        .optional()
        .describe("Suggest a target topology, or omit for auto-optimization"),
    }),
  },
);

export const swarmTools = [
  swarmInit,
  swarmStatus,
  swarmHealth,
  swarmScale,
  swarmShutdown,
  topologyOptimize,
];
