/**
 * Memory & Persistence Tools
 *
 * LangChain tool wrappers for the Claude Flow memory subsystem.
 * Provides HNSW-backed vector search, namespaced key-value storage,
 * and cross-session persistence for long-term autonomous execution.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { callMcpTool } from "../mcp/client.js";

export const memoryStore = tool(
  async ({ key, value, namespace, tags, ttl }) => {
    return callMcpTool("memory_store", {
      key,
      value,
      ...(namespace ? { namespace } : {}),
      ...(tags ? { tags } : {}),
      ...(ttl ? { ttl } : {}),
    });
  },
  {
    name: "memory_store",
    description:
      "Store a value in persistent memory with an optional TTL and namespace. " +
      "Use namespaces to organize: 'tasks' for task state, 'patterns' for " +
      "learned patterns, 'context' for project context, 'decisions' for " +
      "architecture decisions. Stored values survive across sessions.",
    schema: z.object({
      key: z.string().describe("Storage key (unique within namespace)"),
      value: z.string().describe("Value to store"),
      namespace: z
        .string()
        .default("orchestrator")
        .describe("Memory namespace for organization"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags for filtering"),
      ttl: z
        .number()
        .optional()
        .describe("Time-to-live in seconds, or omit for permanent"),
    }),
  },
);

export const memoryRetrieve = tool(
  async ({ key, namespace }) => {
    return callMcpTool("memory_retrieve", {
      key,
      ...(namespace ? { namespace } : {}),
    });
  },
  {
    name: "memory_retrieve",
    description:
      "Retrieve a previously stored value by key and namespace.",
    schema: z.object({
      key: z.string().describe("Storage key to retrieve"),
      namespace: z
        .string()
        .default("orchestrator")
        .describe("Memory namespace"),
    }),
  },
);

export const memorySearch = tool(
  async ({ query, namespace, limit, threshold }) => {
    return callMcpTool("memory_search", {
      query,
      ...(namespace ? { namespace } : {}),
      ...(limit ? { limit } : {}),
      ...(threshold ? { threshold } : {}),
    });
  },
  {
    name: "memory_search",
    description:
      "Search memory using HNSW vector similarity. Finds relevant stored " +
      "patterns, context, and decisions even with approximate queries. " +
      "Use this to recall past task outcomes, learned patterns, and " +
      "architectural decisions to maintain consistency across long executions.",
    schema: z.object({
      query: z.string().describe("Search query (supports semantic similarity)"),
      namespace: z
        .string()
        .optional()
        .describe("Limit search to a namespace"),
      limit: z
        .number()
        .default(10)
        .describe("Maximum results to return"),
      threshold: z
        .number()
        .optional()
        .describe("Minimum similarity threshold 0-1"),
    }),
  },
);

export const memoryList = tool(
  async ({ namespace, limit, offset }) => {
    return callMcpTool("memory_list", {
      ...(namespace ? { namespace } : {}),
      ...(limit ? { limit } : {}),
      ...(offset ? { offset } : {}),
    });
  },
  {
    name: "memory_list",
    description:
      "List all keys stored in a memory namespace. Use this to audit " +
      "stored state, check what context is available, and identify stale entries.",
    schema: z.object({
      namespace: z
        .string()
        .default("orchestrator")
        .describe("Namespace to list"),
      limit: z.number().default(50).describe("Maximum entries to return"),
      offset: z.number().optional().describe("Offset for pagination"),
    }),
  },
);

export const memoryDelete = tool(
  async ({ key, namespace }) => {
    return callMcpTool("memory_delete", {
      key,
      ...(namespace ? { namespace } : {}),
    });
  },
  {
    name: "memory_delete",
    description:
      "Delete a specific key from memory. Use for cleaning up completed " +
      "task state or removing outdated context.",
    schema: z.object({
      key: z.string().describe("Key to delete"),
      namespace: z
        .string()
        .default("orchestrator")
        .describe("Namespace"),
    }),
  },
);

export const stateSnapshot = tool(
  async ({ name, description }) => {
    return callMcpTool("session_save", {
      name,
      ...(description ? { description } : {}),
      includeAgents: true,
      includeMemory: true,
      includeTasks: true,
    });
  },
  {
    name: "state_snapshot",
    description:
      "Create a full state snapshot of the current orchestration state. " +
      "Captures all active swarms, agents, tasks, and memory. " +
      "Use this before major operations as a recovery point.",
    schema: z.object({
      name: z.string().describe("Snapshot label"),
      description: z
        .string()
        .optional()
        .describe("Description of why the snapshot was taken"),
    }),
  },
);

export const contextRestore = tool(
  async ({ sessionId, name }) => {
    return callMcpTool("session_restore", {
      ...(sessionId ? { sessionId } : {}),
      ...(name ? { name } : {}),
    });
  },
  {
    name: "context_restore",
    description:
      "Restore orchestration state from a previous snapshot. " +
      "Recovers swarm configurations, agent assignments, and task state.",
    schema: z.object({
      sessionId: z.string().optional().describe("Session ID to restore from"),
      name: z.string().optional().describe("Session name to restore"),
    }),
  },
);

export const memoryTools = [
  memoryStore,
  memoryRetrieve,
  memorySearch,
  memoryList,
  memoryDelete,
  stateSnapshot,
  contextRestore,
];
