/**
 * Base agent class wrapping Claude Agent SDK
 * Mirrors the SunBurpBot agent architecture for consistent SDK usage
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { getProjectRoot, isWithinProject } from "../utils/project-context.js";
import { callMcpTool } from "../mcp/client.js";

export interface AgentConfig {
  /** Model to use: 'haiku', 'sonnet', or 'opus' */
  model?: "haiku" | "sonnet" | "opus";
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Allowed tools for this agent */
  allowedTools?: string[];
  /** Permission mode: 'ask' prompts user, 'bypassPermissions' runs autonomously */
  permissionMode?: "ask" | "bypassPermissions";
  /** Optional system prompt prefix */
  systemPromptPrefix?: string;
}

export interface QueryOptions {
  allowedTools?: string[];
  permissionMode?: "ask" | "bypassPermissions";
  [key: string]: unknown;
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentResult {
  result: string;
  success: boolean;
  error?: string;
}

export class BaseAgent {
  protected config: AgentConfig;
  protected name: string;

  constructor(name: string, config: AgentConfig = {}) {
    this.name = name;
    this.config = {
      model: config.model || "haiku",
      maxTokens: config.maxTokens || 4096,
      allowedTools: config.allowedTools,
      permissionMode: config.permissionMode || "bypassPermissions",
      systemPromptPrefix: config.systemPromptPrefix,
    };
  }

  /**
   * Execute a prompt using the Claude Agent SDK
   */
  async execute(prompt: string, options?: Partial<QueryOptions>): Promise<string> {
    let result = "";

    const queryOptions: Record<string, unknown> = {
      allowedTools: this.config.allowedTools,
      permissionMode: this.config.permissionMode,
      ...options,
    };

    try {
      for await (const message of query({ prompt, options: queryOptions })) {
        if ("result" in message) {
          result = message.result as string;
        } else if ("error" in message) {
          throw new Error(message.error as string);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`[${this.name}] Agent execution failed: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Execute with a system prompt and user prompt combined
   */
  async executeWithContext(
    systemPrompt: string,
    userPrompt: string,
    options?: Partial<QueryOptions>
  ): Promise<string> {
    // Inject project context if available
    let projectContext = "";
    try {
      const projectRoot = getProjectRoot();
      projectContext = `\n\n[Project Context: All operations must stay within ${projectRoot}]\n\n`;
    } catch {
      // Project root not set, proceed without context
    }

    const fullSystemPrompt = this.config.systemPromptPrefix
      ? `${this.config.systemPromptPrefix}\n\n${systemPrompt}`
      : systemPrompt;

    const combinedPrompt = `${fullSystemPrompt}${projectContext}${userPrompt}`;
    return this.execute(combinedPrompt, options);
  }

  /**
   * Validate that a path is within project boundaries
   */
  protected validateProjectPath(path: string): boolean {
    try {
      return isWithinProject(path);
    } catch {
      // If project root not set, allow all paths
      return true;
    }
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  // ===========================================================================
  // Memory Persistence Hooks
  // ===========================================================================

  /**
   * Persist agent state to MCP memory
   */
  async persistState(sessionId: string, state: Record<string, unknown>): Promise<void> {
    try {
      await callMcpTool("memory_store", {
        namespace: "agent_sessions",
        key: `${this.name}-${sessionId}`,
        value: JSON.stringify({
          agentName: this.name,
          sessionId,
          state,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[${this.name}] Failed to persist state: ${errorMessage}`);
    }
  }

  /**
   * Retrieve agent state from MCP memory
   */
  async retrieveState(sessionId: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await callMcpTool("memory_retrieve", {
        namespace: "agent_sessions",
        key: `${this.name}-${sessionId}`,
      });

      const parsed = JSON.parse(result);
      return parsed?.state ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Store execution history for learning
   */
  async storeExecution(
    sessionId: string,
    input: string,
    output: string,
    success: boolean,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await callMcpTool("memory_store", {
        namespace: "agent_executions",
        key: `${this.name}-${sessionId}-${Date.now()}`,
        value: JSON.stringify({
          agentName: this.name,
          sessionId,
          input,
          output,
          success,
          metadata,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[${this.name}] Failed to store execution: ${errorMessage}`);
    }
  }

  /**
   * Search memory for relevant context
   */
  async searchMemory(query: string, namespace = "agent_executions", limit = 5): Promise<string[]> {
    try {
      const result = await callMcpTool("memory_search", {
        namespace,
        query,
        limit,
      });

      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
      }
      return [];
    } catch {
      return [];
    }
  }
}
