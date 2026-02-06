/**
 * Local Memory Tools
 *
 * LangChain tools wrapping PersistenceManager for local file-based storage.
 * Replaces MCP memory tools with working local implementations.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getDefaultPersistenceManager } from "../utils/persistence.js";

export const localMemoryStore = tool(
  async ({ key, value, namespace, tags }): Promise<string> => {
    try {
      const persistence = getDefaultPersistenceManager();
      const data = typeof value === "string" ? JSON.parse(value) : value;
      const result = await persistence.store(namespace, key, data, tags);
      return JSON.stringify({
        success: result.success,
        backend: result.backend,
        key,
        namespace,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
  {
    name: "memory_store",
    description:
      "Store a value in persistent local memory with an optional namespace and tags. " +
      "Use namespaces to organize: 'tasks' for task state, 'patterns' for " +
      "learned patterns, 'context' for project context, 'decisions' for " +
      "architecture decisions. Values are stored as JSON files and survive across sessions.",
    schema: z.object({
      key: z.string().describe("Storage key (unique within namespace)"),
      value: z.string().describe("JSON string value to store"),
      namespace: z
        .string()
        .default("orchestrator")
        .describe("Memory namespace for organization"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags for filtering"),
    }),
  }
);

export const localMemoryRetrieve = tool(
  async ({ key, namespace }): Promise<string> => {
    try {
      const persistence = getDefaultPersistenceManager();
      const result = await persistence.retrieve(namespace, key);
      if (result.success && result.data) {
        return JSON.stringify({
          success: true,
          data: result.data,
          key,
          namespace,
        });
      }
      return JSON.stringify({
        success: false,
        error: result.error || "Key not found",
        key,
        namespace,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
  {
    name: "memory_retrieve",
    description:
      "Retrieve a previously stored value by key and namespace from local storage.",
    schema: z.object({
      key: z.string().describe("Storage key to retrieve"),
      namespace: z
        .string()
        .default("orchestrator")
        .describe("Memory namespace"),
    }),
  }
);

export const localMemorySearch = tool(
  async ({ query, namespace, limit }): Promise<string> => {
    try {
      const persistence = getDefaultPersistenceManager();
      const { keys } = await persistence.list(namespace);

      const results: Array<{ key: string; relevance: number; data: unknown }> = [];
      const queryLower = query.toLowerCase();

      for (const key of keys) {
        const result = await persistence.retrieve(namespace, key);
        if (result.success && result.data) {
          const dataStr = JSON.stringify(result.data).toLowerCase();
          if (dataStr.includes(queryLower)) {
            const relevance = (dataStr.match(new RegExp(queryLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
            results.push({ key, relevance, data: result.data });
          }
        }
      }

      results.sort((a, b) => b.relevance - a.relevance);
      const limited = results.slice(0, limit);

      return JSON.stringify({
        success: true,
        count: limited.length,
        totalMatches: results.length,
        results: limited,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
  },
  {
    name: "memory_search",
    description:
      "Search local memory using keyword matching. Finds relevant stored " +
      "patterns, context, and decisions. Use this to recall past task outcomes, " +
      "learned patterns, and architectural decisions.",
    schema: z.object({
      query: z.string().describe("Search query (keyword matching)"),
      namespace: z
        .string()
        .default("orchestrator")
        .describe("Limit search to a namespace"),
      limit: z
        .number()
        .default(10)
        .describe("Maximum results to return"),
    }),
  }
);

export const localMemoryList = tool(
  async ({ namespace }): Promise<string> => {
    try {
      const persistence = getDefaultPersistenceManager();
      const result = await persistence.list(namespace);
      return JSON.stringify({
        success: true,
        namespace,
        keys: result.keys,
        count: result.keys.length,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ success: false, error: msg });
    }
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
    }),
  }
);

export const localMemoryTools = [
  localMemoryStore,
  localMemoryRetrieve,
  localMemorySearch,
  localMemoryList,
];
