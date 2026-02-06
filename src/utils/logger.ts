/**
 * SDK Swarm Logging System
 *
 * Comprehensive logging for Agent SDK swarms including:
 * - Execution time tracking
 * - Tools usage logging
 * - Agent configuration logging
 * - Topology tracking
 * - Performance metrics
 * - Full task execution records (cost, tokens, model, QA, evaluation)
 */

import { getDefaultPersistenceManager } from "./persistence.js";
import { estimateTokens } from "./context-manager.js";
import type { ExecutionMetadata } from "../agents/execution-backend.js";
import type { EvaluationResult } from "../agents/evaluator-agent.js";
import type { CoordinationContext } from "../agents/evaluator-agent.js";

// =============================================================================
// Log Entry Schemas
// =============================================================================

export interface LogMetadata {
  sessionId: string;
  swarmId?: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
}

export interface AgentConfigLog {
  agentName: string;
  agentType: string;
  model: string;
  maxTokens: number;
  allowedTools: string[];
  permissionMode: string;
  systemPromptPrefix?: string;
  customConfig?: Record<string, unknown>;
}

export interface ToolUsageLog {
  toolName: string;
  startTime: string;
  endTime: string;
  duration: number; // in milliseconds
  parameters?: Record<string, unknown>;
  result?: unknown;
  success: boolean;
  error?: string;
}

export interface ExecutionLog {
  executionId: string;
  taskType: string;
  description: string;
  startTime: string;
  endTime: string;
  duration: number; // in milliseconds
  agentName: string;
  agentType: string;
  toolsUsed: ToolUsageLog[];
  iterations: number;
  quality: number;
  success: boolean;
  error?: string;
  outputSize: number; // in bytes
}

export interface TopologyLog {
  swarmId: string;
  topology: string;
  maxAgents: number;
  agentsActive: number;
  timestamp: string;
  changes: TopologyChange[];
}

export interface TopologyChange {
  type: "agent_added" | "agent_removed" | "topology_changed" | "configuration_changed";
  timestamp: string;
  details: Record<string, unknown>;
}

export interface PerformanceMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  averageQuality: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  totalRetries: number;
  toolsUsageCount: Record<string, number>;
  agentExecutionCount: Record<string, number>;
  modelUsageCount: Record<string, number>;
  providerUsageCount: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Comprehensive Task Execution Record
// ---------------------------------------------------------------------------

/** QA report attached to a task execution record. */
export interface QAReport {
  /** Evaluation criteria used (dynamically inferred or explicit) */
  criteriaUsed: Array<{ name: string; weight: number }>;
  /** Per-criterion results */
  evaluation: EvaluationResult | null;
  /** Coordination context that shaped the evaluation */
  coordinationContext: CoordinationContext | null;
  /** Whether the task met the quality threshold */
  passedQualityGate: boolean;
  /** Quality threshold that was applied */
  qualityThreshold: number;
}

/**
 * Comprehensive record of a single task execution.
 *
 * Captures everything needed for automated metrics and validators:
 * timing, cost, tokens, errors, retries, tool usage, model/provider,
 * QA reports, evaluation feedback, and coordination context.
 */
export interface TaskExecutionRecord {
  // --- Identity ---
  recordId: string;
  taskId: string;
  sessionId: string;
  swarmId: string | null;

  // --- Timing ---
  startTime: string;
  endTime: string;
  durationMs: number;

  // --- Task info ---
  taskType: string;
  taskDescription: string;
  requirements: string[];

  // --- Agent info ---
  agentName: string;
  agentType: string;
  agentReputationScore: number | null;

  // --- Model & Provider ---
  model: string;
  provider: string;
  backendName: string;

  // --- Tokens & Cost ---
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedContextSize: number;
  costUsd: number;

  // --- Execution details ---
  toolExecutions: ToolUsageLog[];
  toolExecutionCount: number;
  retries: number;
  errors: Array<{ timestamp: string; message: string; recoverable: boolean }>;
  errorCount: number;

  // --- Outcome ---
  success: boolean;
  outputSize: number;
  qualityScore: number;

  // --- QA & Evaluation ---
  qaReport: QAReport | null;

  // --- Patterns ---
  patternsApplied: string[];
  patternLearned: boolean;
}

// =============================================================================
// Logger Class
// =============================================================================

export class SDKLogger {
  private sessionId: string;
  private swarmId: string | null = null;
  private executionLogs: ExecutionLog[] = [];
  private agentConfigs: Map<string, AgentConfigLog> = new Map();
  private topologyLogs: TopologyLog[] = [];
  private performanceMetrics: PerformanceMetrics;

  constructor() {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.performanceMetrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageDuration: 0,
      averageQuality: 0,
      totalTokensUsed: 0,
      totalCostUsd: 0,
      totalRetries: 0,
      toolsUsageCount: {},
      agentExecutionCount: {},
      modelUsageCount: {},
      providerUsageCount: {},
    };

    this.log("info", "SDK Logger initialized", { sessionId: this.sessionId });
  }

  // ===========================================================================
  // Core Logging Methods
  // ===========================================================================

  /**
   * Log a message with metadata
   */
  async log(
    level: LogMetadata["level"],
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const entry = {
      ...this.getMetadata(level),
      message,
      data: data || {},
    };

    // Console output
    this.consoleLog(entry);

    // Persist to storage
    await this.persistLog("general_logs", `${Date.now()}-${level}`, entry);
  }

  /**
   * Log execution start
   */
  logExecutionStart(
    executionId: string,
    taskType: string,
    description: string,
    agentName: string,
    agentType: string
  ): void {
    const log: Partial<ExecutionLog> = {
      executionId,
      taskType,
      description,
      startTime: new Date().toISOString(),
      agentName,
      agentType,
      toolsUsed: [],
      iterations: 0,
      quality: 0,
      success: false,
      outputSize: 0,
    };

    // Store temporary log (will be completed on end)
    (this as any)[`temp_exec_${executionId}`] = log;

    this.consoleLog({
      ...this.getMetadata("info"),
      type: "execution_start",
      executionId,
      taskType,
      description: description.substring(0, 100),
      agentName,
    });
  }

  /**
   * Log execution end
   */
  async logExecutionEnd(
    executionId: string,
    success: boolean,
    quality: number,
    output: string,
    iterations: number,
    toolsUsed: ToolUsageLog[],
    error?: string,
    metadata?: ExecutionMetadata
  ): Promise<void> {
    const tempLog = (this as any)[`temp_exec_${executionId}`] as Partial<ExecutionLog>;

    if (!tempLog) {
      console.warn(`[SDKLogger] No start log found for execution: ${executionId}`);
      return;
    }

    const endTime = new Date().toISOString();
    const startTime = tempLog.startTime || new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

    const executionLog: ExecutionLog = {
      executionId,
      taskType: tempLog.taskType || "unknown",
      description: tempLog.description || "",
      startTime,
      endTime,
      duration,
      agentName: tempLog.agentName || "unknown",
      agentType: tempLog.agentType || "unknown",
      toolsUsed: toolsUsed || [],
      iterations,
      quality,
      success,
      error,
      outputSize: output.length,
    };

    this.executionLogs.push(executionLog);
    delete (this as any)[`temp_exec_${executionId}`];

    // Update performance metrics (with metadata when available)
    this.updatePerformanceMetrics(executionLog, metadata);

    // Console output
    this.consoleLog({
      ...this.getMetadata("info"),
      type: "execution_end",
      executionId,
      duration,
      success,
      quality,
      iterations,
      toolsUsedCount: toolsUsed.length,
      tokens: metadata?.totalTokens,
      costUsd: metadata?.costUsd,
    });

    // Persist
    await this.persistLog("executions", executionId, executionLog);
  }

  /**
   * Log tool usage
   */
  logToolStart(toolName: string, parameters?: Record<string, unknown>): string {
    const toolUsageId = `tool-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    (this as any)[`temp_tool_${toolUsageId}`] = {
      toolName,
      startTime: new Date().toISOString(),
      parameters,
    };

    return toolUsageId;
  }

  async logToolEnd(
    toolUsageId: string,
    result: unknown,
    success: boolean,
    error?: string
  ): Promise<void> {
    const tempTool = (this as any)[`temp_tool_${toolUsageId}`] as {
      toolName: string;
      startTime: string;
      parameters?: Record<string, unknown>;
    };

    if (!tempTool) {
      console.warn(`[SDKLogger] No start log found for tool: ${toolUsageId}`);
      return;
    }

    const endTime = new Date().toISOString();
    const startTime = tempTool.startTime;
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();

    const toolLog: ToolUsageLog = {
      toolName: tempTool.toolName,
      startTime,
      endTime,
      duration,
      parameters: tempTool.parameters,
      result: success ? result : undefined,
      success,
      error,
    };

    // Update metrics
    this.performanceMetrics.toolsUsageCount[tempTool.toolName] =
      (this.performanceMetrics.toolsUsageCount[tempTool.toolName] || 0) + 1;

    // Console output
    this.consoleLog({
      ...this.getMetadata("debug"),
      type: "tool_usage",
      toolName: tempTool.toolName,
      duration,
      success,
    });

    // Persist
    await this.persistLog("tool_usage", toolUsageId, toolLog);
  }

  /**
   * Log agent configuration
   */
  async logAgentConfig(agentName: string, agentType: string, config: AgentConfigLog): Promise<void> {
    this.agentConfigs.set(agentName, config);

    this.consoleLog({
      ...this.getMetadata("info"),
      type: "agent_config",
      agentName,
      agentType,
      model: config.model,
      allowedTools: config.allowedTools.length,
    });

    await this.persistLog("agent_configs", agentName, config);
  }

  /**
   * Log topology configuration and changes
   */
  async logTopology(
    swarmId: string,
    topology: string,
    maxAgents: number,
    agentsActive: number,
    changes?: TopologyChange[]
  ): Promise<void> {
    this.swarmId = swarmId;

    const topologyLog: TopologyLog = {
      swarmId,
      topology,
      maxAgents,
      agentsActive,
      timestamp: new Date().toISOString(),
      changes: changes || [],
    };

    this.topologyLogs.push(topologyLog);

    this.consoleLog({
      ...this.getMetadata("info"),
      type: "topology",
      swarmId,
      topology,
      maxAgents,
      agentsActive,
      changes: changes?.length || 0,
    });

    await this.persistLog("topology", `${swarmId}-${Date.now()}`, topologyLog);
  }

  /**
   * Log topology change
   */
  async logTopologyChange(
    type: TopologyChange["type"],
    details: Record<string, unknown>
  ): Promise<void> {
    if (!this.swarmId) {
      console.warn("[SDKLogger] Cannot log topology change: no swarm ID set");
      return;
    }

    const change: TopologyChange = {
      type,
      timestamp: new Date().toISOString(),
      details,
    };

    // Update latest topology log
    const latestLog = this.topologyLogs[this.topologyLogs.length - 1];
    if (latestLog) {
      latestLog.changes.push(change);
      await this.persistLog("topology", `${this.swarmId}-${latestLog.timestamp}`, latestLog);
    }

    this.consoleLog({
      ...this.getMetadata("info"),
      type: "topology_change",
      swarmId: this.swarmId,
      changeType: type,
      details,
    });
  }

  // ===========================================================================
  // Query and Export Methods
  // ===========================================================================

  /**
   * Get all execution logs
   */
  getExecutionLogs(): ExecutionLog[] {
    return [...this.executionLogs];
  }

  /**
   * Get execution logs filtered by criteria
   */
  getFilteredExecutionLogs(filters: {
    agentName?: string;
    agentType?: string;
    taskType?: string;
    minQuality?: number;
    success?: boolean;
    maxDuration?: number;
  }): ExecutionLog[] {
    return this.executionLogs.filter((log) => {
      if (filters.agentName && log.agentName !== filters.agentName) return false;
      if (filters.agentType && log.agentType !== filters.agentType) return false;
      if (filters.taskType && log.taskType !== filters.taskType) return false;
      if (filters.minQuality && log.quality < filters.minQuality) return false;
      if (filters.success !== undefined && log.success !== filters.success) return false;
      if (filters.maxDuration && log.duration > filters.maxDuration) return false;
      return true;
    });
  }

  /**
   * Get agent configurations
   */
  getAgentConfigs(): AgentConfigLog[] {
    return Array.from(this.agentConfigs.values());
  }

  /**
   * Get topology logs
   */
  getTopologyLogs(): TopologyLog[] {
    return [...this.topologyLogs];
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Generate execution report
   */
  generateExecutionReport(): string {
    const metrics = this.performanceMetrics;
    const successRate = metrics.totalExecutions > 0
      ? (metrics.successfulExecutions / metrics.totalExecutions) * 100
      : 0;
    const failureRate = metrics.totalExecutions > 0
      ? (metrics.failedExecutions / metrics.totalExecutions) * 100
      : 0;

    const report = `
=== SDK Swarm Execution Report ===
Session ID: ${this.sessionId}
Swarm ID: ${this.swarmId || "N/A"}

--- Performance Metrics ---
Total Executions: ${metrics.totalExecutions}
Successful: ${metrics.successfulExecutions}
Failed: ${metrics.failedExecutions}
Success Rate: ${successRate.toFixed(2)}%
Failure Rate: ${failureRate.toFixed(2)}%
Average Duration: ${metrics.averageDuration.toFixed(0)}ms
Average Quality: ${metrics.averageQuality.toFixed(2)}

--- Token & Cost Metrics ---
Total Tokens Used: ${metrics.totalTokensUsed}
Total Cost (USD): $${metrics.totalCostUsd.toFixed(4)}
Total Retries: ${metrics.totalRetries}

--- Model Usage ---
${Object.entries(metrics.modelUsageCount)
  .sort(([, a], [, b]) => b - a)
  .map(([model, count]) => `  ${model}: ${count}`)
  .join("\n") || "  No model data"}

--- Provider Usage ---
${Object.entries(metrics.providerUsageCount)
  .sort(([, a], [, b]) => b - a)
  .map(([provider, count]) => `  ${provider}: ${count}`)
  .join("\n") || "  No provider data"}

--- Tools Usage ---
${Object.entries(metrics.toolsUsageCount)
  .sort(([, a], [, b]) => b - a)
  .map(([tool, count]) => `  ${tool}: ${count}`)
  .join("\n") || "  No tool data"}

--- Agent Execution Counts ---
${Object.entries(metrics.agentExecutionCount)
  .sort(([, a], [, b]) => b - a)
  .map(([agent, count]) => `  ${agent}: ${count}`)
  .join("\n") || "  No agent data"}

--- Topology ---
${this.topologyLogs.length > 0
  ? `  Current: ${this.topologyLogs[this.topologyLogs.length - 1].topology}\n  Max Agents: ${this.topologyLogs[this.topologyLogs.length - 1].maxAgents}\n  Changes: ${this.topologyLogs.reduce((sum, log) => sum + log.changes.length, 0)}`
  : "  No topology data"}

--- Recent Executions ---
${this.executionLogs.slice(-5).map((log) => `
  [${log.executionId.substring(0, 8)}] ${log.taskType}
    Agent: ${log.agentName}
    Duration: ${log.duration}ms
    Quality: ${log.quality.toFixed(2)}
    Success: ${log.success}
    Tools: ${log.toolsUsed.length}
`).join("")}
`.trim();

    return report;
  }

  /**
   * Export logs to JSON file
   */
  async exportLogs(filePath: string): Promise<void> {
    const exportData = {
      sessionId: this.sessionId,
      swarmId: this.swarmId,
      exportTime: new Date().toISOString(),
      executionLogs: this.executionLogs,
      agentConfigs: Array.from(this.agentConfigs.values()),
      topologyLogs: this.topologyLogs,
      performanceMetrics: this.performanceMetrics,
    };

    await this.persistLog("exports", `${Date.now()}`, exportData);
    console.log(`[SDKLogger] Logs exported to: ${filePath}`);
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  private getMetadata(level: LogMetadata["level"]): LogMetadata {
    return {
      sessionId: this.sessionId,
      swarmId: this.swarmId || undefined,
      timestamp: new Date().toISOString(),
      level,
    };
  }

  private consoleLog(entry: Record<string, unknown>): void {
    const logLevel = entry.level as string;
    const prefix = `[SDKLogger:${logLevel.toUpperCase()}]`;

    switch (logLevel) {
      case "error":
        console.error(prefix, JSON.stringify(entry, null, 2));
        break;
      case "warn":
        console.warn(prefix, JSON.stringify(entry, null, 2));
        break;
      case "debug":
        console.debug(prefix, JSON.stringify(entry, null, 2));
        break;
      default:
        console.log(prefix, JSON.stringify(entry, null, 2));
    }
  }

  private async persistLog(
    namespace: string,
    key: string,
    data: Record<string, unknown> | ExecutionLog | ToolUsageLog | AgentConfigLog | TopologyLog
  ): Promise<void> {
    try {
      const persistence = getDefaultPersistenceManager();
      const result = await persistence.store(namespace, key, data as Record<string, unknown>);

      if (!result.success) {
        console.warn(`[SDKLogger] Failed to persist log: ${result.error}`);
      }
    } catch (error) {
      console.error(`[SDKLogger] Error persisting log: ${error}`);
    }
  }

  private updatePerformanceMetrics(log: ExecutionLog, metadata?: ExecutionMetadata): void {
    const metrics = this.performanceMetrics;

    metrics.totalExecutions++;
    if (log.success) {
      metrics.successfulExecutions++;
    } else {
      metrics.failedExecutions++;
    }

    // Update averages
    metrics.averageDuration =
      (metrics.averageDuration * (metrics.totalExecutions - 1) + log.duration) / metrics.totalExecutions;
    metrics.averageQuality =
      (metrics.averageQuality * (metrics.totalExecutions - 1) + log.quality) / metrics.totalExecutions;

    // Update agent execution count
    metrics.agentExecutionCount[log.agentName] =
      (metrics.agentExecutionCount[log.agentName] || 0) + 1;

    // Update token, cost, retry, model, and provider metrics from metadata
    if (metadata) {
      const tokens = metadata.totalTokens ?? (metadata.inputTokens ?? 0) + (metadata.outputTokens ?? 0);
      metrics.totalTokensUsed += tokens;
      metrics.totalCostUsd += metadata.costUsd ?? 0;
      metrics.totalRetries += metadata.retries ?? 0;

      if (metadata.model) {
        metrics.modelUsageCount[metadata.model] =
          (metrics.modelUsageCount[metadata.model] || 0) + 1;
      }
      if (metadata.provider) {
        metrics.providerUsageCount[metadata.provider] =
          (metrics.providerUsageCount[metadata.provider] || 0) + 1;
      }
    }
  }

  // ===========================================================================
  // Comprehensive Task Execution Recording
  // ===========================================================================

  /**
   * Record a complete task execution with all available metrics.
   *
   * This is the primary entry point for the coordinator to persist a full
   * execution record that automated validators and metrics pipelines can
   * consume.
   */
  async recordTaskExecution(record: TaskExecutionRecord): Promise<void> {
    // Persist the full record
    await this.persistLog("task_executions", record.recordId, record as unknown as Record<string, unknown>);

    // Also persist a lightweight summary for quick queries
    await this.persistLog("task_summaries", record.recordId, {
      recordId: record.recordId,
      taskId: record.taskId,
      taskType: record.taskType,
      agentName: record.agentName,
      model: record.model,
      provider: record.provider,
      durationMs: record.durationMs,
      totalTokens: record.totalTokens,
      costUsd: record.costUsd,
      toolExecutionCount: record.toolExecutionCount,
      retries: record.retries,
      errorCount: record.errorCount,
      success: record.success,
      qualityScore: record.qualityScore,
      passedQualityGate: record.qaReport?.passedQualityGate ?? null,
      patternLearned: record.patternLearned,
      timestamp: record.startTime,
    });

    this.consoleLog({
      ...this.getMetadata("info"),
      type: "task_execution_recorded",
      recordId: record.recordId,
      taskId: record.taskId,
      durationMs: record.durationMs,
      tokens: record.totalTokens,
      cost: record.costUsd,
      quality: record.qualityScore,
      success: record.success,
    });
  }

  /**
   * Build a TaskExecutionRecord from component parts.
   *
   * Utility that merges timing, backend metadata, tool logs, evaluation
   * results, and coordination context into a single record.  The
   * coordinator calls this so it doesn't have to assemble the record
   * manually.
   */
  buildTaskExecutionRecord(parts: {
    taskId: string;
    taskType: string;
    taskDescription: string;
    requirements: string[];
    agentName: string;
    agentType: string;
    agentReputationScore: number | null;
    startTime: string;
    endTime: string;
    output: string;
    success: boolean;
    qualityScore: number;
    toolsUsed: ToolUsageLog[];
    metadata: ExecutionMetadata | null;
    errors: Array<{ timestamp: string; message: string; recoverable: boolean }>;
    qaReport: QAReport | null;
    patternsApplied: string[];
    patternLearned: boolean;
    backendName: string;
  }): TaskExecutionRecord {
    const durationMs = new Date(parts.endTime).getTime() - new Date(parts.startTime).getTime();
    const meta = parts.metadata;

    // Estimate tokens from prompt + output if backend didn't report them
    const inputTokens = meta?.inputTokens ?? estimateTokens(parts.taskDescription);
    const outputTokens = meta?.outputTokens ?? estimateTokens(parts.output);
    const totalTokens = meta?.totalTokens ?? inputTokens + outputTokens;

    return {
      recordId: `ter-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      taskId: parts.taskId,
      sessionId: this.sessionId,
      swarmId: this.swarmId,

      startTime: parts.startTime,
      endTime: parts.endTime,
      durationMs,

      taskType: parts.taskType,
      taskDescription: parts.taskDescription,
      requirements: parts.requirements,

      agentName: parts.agentName,
      agentType: parts.agentType,
      agentReputationScore: parts.agentReputationScore,

      model: meta?.model ?? "unknown",
      provider: meta?.provider ?? "unknown",
      backendName: parts.backendName,

      inputTokens,
      outputTokens,
      totalTokens,
      cacheReadTokens: meta?.cacheReadTokens ?? 0,
      cacheCreationTokens: meta?.cacheCreationTokens ?? 0,
      estimatedContextSize: meta?.contextWindow ?? 0,
      costUsd: meta?.costUsd ?? 0,

      toolExecutions: parts.toolsUsed,
      toolExecutionCount: parts.toolsUsed.length,
      retries: meta?.retries ?? 0,
      errors: parts.errors,
      errorCount: parts.errors.length,

      success: parts.success,
      outputSize: parts.output.length,
      qualityScore: parts.qualityScore,

      qaReport: parts.qaReport,

      patternsApplied: parts.patternsApplied,
      patternLearned: parts.patternLearned,
    };
  }

  /**
   * Clear all in-memory logs
   */
  clearLogs(): void {
    this.executionLogs = [];
    this.agentConfigs.clear();
    this.topologyLogs = [];
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get swarm ID
   */
  getSwarmId(): string | null {
    return this.swarmId;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalLogger: SDKLogger | null = null;

export function getGlobalLogger(): SDKLogger {
  if (!globalLogger) {
    globalLogger = new SDKLogger();
  }
  return globalLogger;
}

export function resetGlobalLogger(): void {
  globalLogger = null;
}
