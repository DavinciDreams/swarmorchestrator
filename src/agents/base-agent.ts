/**
 * Base agent class wrapping Claude Agent SDK
 * Mirrors the SunBurpBot agent architecture for consistent SDK usage
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { getProjectRoot, isWithinProject } from "../utils/project-context.js";
import { getDefaultPersistenceManager } from "../utils/persistence.js";
import { getGlobalLogger, type ToolUsageLog } from "../utils/logger.js";

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
  protected logger = getGlobalLogger();

  constructor(name: string, config: AgentConfig = {}) {
    this.name = name;
    this.config = {
      model: config.model || "haiku",
      maxTokens: config.maxTokens || 4096,
      allowedTools: config.allowedTools,
      permissionMode: config.permissionMode || "bypassPermissions",
      systemPromptPrefix: config.systemPromptPrefix,
    };

    // Log agent configuration
    this.logAgentConfig();
  }

  /**
   * Execute a prompt using the Claude Agent SDK
   */
  async execute(prompt: string, options?: Partial<QueryOptions>): Promise<string> {
    let result = "";
    const executionId = `${this.name}-${Date.now()}`;

    // Log execution start
    this.logger.logExecutionStart(
      executionId,
      "general",
      prompt.substring(0, 200),
      this.name,
      this.constructor.name
    );

    const queryOptions: Record<string, unknown> = {
      allowedTools: this.config.allowedTools,
      permissionMode: this.config.permissionMode,
      ...options,
    };

    const toolsUsed: ToolUsageLog[] = [];
    let currentToolUsageId: string | null = null;
    let currentToolName: string | null = null;

    try {
      for await (const message of query({ prompt, options: queryOptions })) {
        if ("tool_use" in message) {
          // Log tool usage start
          const toolName = (message.tool_use as any)?.name || "unknown";
          const toolUsageId = this.logger.logToolStart(toolName, (message.tool_use as any)?.input as Record<string, unknown>);

          // Track current tool for when result arrives
          currentToolUsageId = toolUsageId;
          currentToolName = toolName;
        } else if ("tool_result" in message) {
          // Log tool usage end
          if (currentToolUsageId && currentToolName) {
            await this.logger.logToolEnd(
              currentToolUsageId,
              message.tool_result,
              true
            );

            toolsUsed.push({
              toolName: currentToolName,
              startTime: "", // Will be filled by logger
              endTime: new Date().toISOString(),
              duration: 0, // Will be calculated by logger
              parameters: undefined,
              result: message.tool_result,
              success: true,
            });

            // Clear current tool
            currentToolUsageId = null;
            currentToolName = null;
          }
        } else if ("result" in message) {
          result = message.result as string;
        } else if ("error" in message) {
          throw new Error(message.error as string);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log execution end with error
      await this.logger.logExecutionEnd(
        executionId,
        false,
        0,
        "",
        0,
        toolsUsed,
        errorMessage
      );

      throw new Error(`[${this.name}] Agent execution failed: ${errorMessage}`);
    }

    // Log execution end with success
    await this.logger.logExecutionEnd(
      executionId,
      true,
      0.7, // Default quality for base agent
      result,
      1,
      toolsUsed
    );

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

  /**
   * Log agent configuration
   */
  private async logAgentConfig(): Promise<void> {
    await this.logger.logAgentConfig(
      this.name,
      this.constructor.name,
      {
        agentName: this.name,
        agentType: this.constructor.name,
        model: this.config.model || "haiku",
        maxTokens: this.config.maxTokens || 4096,
        allowedTools: this.config.allowedTools || [],
        permissionMode: this.config.permissionMode || "bypassPermissions",
        systemPromptPrefix: this.config.systemPromptPrefix,
      }
    );
  }

  // ===========================================================================
  // Memory Persistence Hooks
  // ===========================================================================

  /**
   * Persist agent state with automatic fallback to local file
   */
  async persistState(sessionId: string, state: Record<string, unknown>): Promise<void> {
    const persistence = getDefaultPersistenceManager();
    const result = await persistence.store("agent_sessions", `${this.name}-${sessionId}`, {
      agentName: this.name,
      sessionId,
      state,
      timestamp: new Date().toISOString(),
    });

    if (!result.success) {
      console.warn(`[${this.name}] Failed to persist state: ${result.error}`);
    } else if (result.backend === "local") {
      console.log(`[${this.name}] Persisted state to local file (MCP unavailable)`);
    }
  }

  /**
   * Retrieve agent state with automatic fallback to local file
   */
  async retrieveState(sessionId: string): Promise<Record<string, unknown> | null> {
    const persistence = getDefaultPersistenceManager();
    const result = await persistence.retrieve("agent_sessions", `${this.name}-${sessionId}`);

    if (result.success && result.data) {
      return (result.data.state as Record<string, unknown>) ?? null;
    }
    return null;
  }

  /**
   * Store execution history for learning with automatic fallback
   */
  async storeExecution(
    sessionId: string,
    input: string,
    output: string,
    success: boolean,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const persistence = getDefaultPersistenceManager();
    const result = await persistence.store(
      "agent_executions",
      `${this.name}-${sessionId}-${Date.now()}`,
      {
        agentName: this.name,
        sessionId,
        input,
        output,
        success,
        metadata,
        timestamp: new Date().toISOString(),
      }
    );

    if (!result.success) {
      console.warn(`[${this.name}] Failed to store execution: ${result.error}`);
    }
  }

  /**
   * Search memory for relevant context with automatic fallback
   * Note: Local file search is basic text matching, not semantic search
   */
  async searchMemory(query: string, namespace = "agent_executions", limit = 5): Promise<string[]> {
    const persistence = getDefaultPersistenceManager();

    // Get all keys in namespace
    const { keys } = await persistence.list(namespace);

    const results: Array<{ key: string; relevance: number; data: string }> = [];

    // Search through each entry
    for (const key of keys) {
      const result = await persistence.retrieve(namespace, key);
      if (result.success && result.data) {
        const dataStr = JSON.stringify(result.data);
        const queryLower = query.toLowerCase();
        const dataLower = dataStr.toLowerCase();

        // Simple relevance scoring based on keyword matching
        if (dataLower.includes(queryLower)) {
          const relevance = (dataLower.match(new RegExp(queryLower, "g")) || []).length;
          results.push({ key, relevance, data: dataStr });
        }
      }
    }

    // Sort by relevance and limit
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, limit).map((r) => r.data);
  }
}
