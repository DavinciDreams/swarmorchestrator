/**
 * Base agent class with pluggable execution backend
 *
 * Supports both Agent SDK (Claude-native) and LangChain (any provider) backends.
 * Backend is selected via EXECUTION_BACKEND env var or config.
 */

import { getProjectRoot, isWithinProject } from "../utils/project-context.js";
import { getDefaultPersistenceManager } from "../utils/persistence.js";
import { getGlobalLogger, type ToolUsageLog } from "../utils/logger.js";
import { createExecutionBackend, type BackendConfig } from "./backends/index.js";
import type { ExecutionBackend, ExecutionMetadata } from "./execution-backend.js";

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
  /** Inject a specific execution backend */
  backend?: ExecutionBackend;
  /** Backend configuration (used if backend not provided) */
  backendConfig?: BackendConfig;
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

/** Extended result from execute() that includes backend metadata. */
export interface AgentExecutionResult {
  result: string;
  metadata: ExecutionMetadata | null;
  toolsUsed: ToolUsageLog[];
  errors: Array<{ timestamp: string; message: string; recoverable: boolean }>;
  durationMs: number;
  startTime: string;
  endTime: string;
}

export class BaseAgent {
  protected config: AgentConfig;
  protected name: string;
  protected logger = getGlobalLogger();
  protected backend: ExecutionBackend;

  constructor(name: string, config: AgentConfig = {}) {
    this.name = name;
    this.config = {
      model: config.model || "haiku",
      maxTokens: config.maxTokens || 4096,
      allowedTools: config.allowedTools,
      permissionMode: config.permissionMode || "bypassPermissions",
      systemPromptPrefix: config.systemPromptPrefix,
    };

    // Initialize execution backend
    this.backend = config.backend ?? createExecutionBackend(config.backendConfig);

    // Log agent configuration
    this.logAgentConfig();
  }

  /**
   * Execute a prompt and return the result string.
   * For full execution metadata use executeDetailed().
   */
  async execute(prompt: string, options?: Partial<QueryOptions>): Promise<string> {
    const detailed = await this.executeDetailed(prompt, options);
    return detailed.result;
  }

  /**
   * Execute a prompt and return the full execution result including
   * backend metadata (tokens, model, provider, cost), tool logs, errors,
   * and timing.
   */
  async executeDetailed(prompt: string, options?: Partial<QueryOptions>): Promise<AgentExecutionResult> {
    let result = "";
    const executionId = `${this.name}-${Date.now()}`;
    const startTime = new Date().toISOString();

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
    const errors: Array<{ timestamp: string; message: string; recoverable: boolean }> = [];
    let currentToolUsageId: string | null = null;
    let currentToolName: string | null = null;
    let executionMetadata: ExecutionMetadata | null = null;

    try {
      for await (const message of this.backend.execute(prompt, {
        allowedTools: queryOptions.allowedTools as string[] | undefined,
        permissionMode: queryOptions.permissionMode as "ask" | "bypassPermissions" | undefined,
        ...queryOptions,
      })) {
        if (message.type === "tool_use") {
          // Log tool usage start
          const toolContent = message.content as any;
          const toolName = toolContent?.name || "unknown";
          const toolUsageId = this.logger.logToolStart(toolName, toolContent?.input as Record<string, unknown>);

          // Track current tool for when result arrives
          currentToolUsageId = toolUsageId;
          currentToolName = toolName;
        } else if (message.type === "tool_result") {
          // Log tool usage end
          if (currentToolUsageId && currentToolName) {
            await this.logger.logToolEnd(
              currentToolUsageId,
              message.content,
              true
            );

            toolsUsed.push({
              toolName: currentToolName,
              startTime: "", // Will be filled by logger
              endTime: new Date().toISOString(),
              duration: 0, // Will be calculated by logger
              parameters: undefined,
              result: message.content,
              success: true,
            });

            // Clear current tool
            currentToolUsageId = null;
            currentToolName = null;
          }
        } else if (message.type === "result") {
          result = message.content as string;
        } else if (message.type === "metadata") {
          executionMetadata = message.content as ExecutionMetadata;
        } else if (message.type === "error") {
          throw new Error(message.content as string);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const endTime = new Date().toISOString();

      errors.push({
        timestamp: endTime,
        message: errorMessage,
        recoverable: false,
      });

      // Log execution end with error
      await this.logger.logExecutionEnd(
        executionId,
        false,
        0,
        "",
        0,
        toolsUsed,
        errorMessage,
        executionMetadata ?? undefined
      );

      throw new Error(`[${this.name}] Agent execution failed: ${errorMessage}`);
    }

    const endTime = new Date().toISOString();
    const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

    // Log execution end with success
    await this.logger.logExecutionEnd(
      executionId,
      true,
      0.7, // Default quality for base agent
      result,
      1,
      toolsUsed,
      undefined,
      executionMetadata ?? undefined
    );

    return {
      result,
      metadata: executionMetadata,
      toolsUsed,
      errors,
      durationMs,
      startTime,
      endTime,
    };
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
   * Get the execution backend name
   */
  getBackendName(): string {
    return this.backend.name;
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
      console.log(`[${this.name}] Persisted state to local file`);
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
