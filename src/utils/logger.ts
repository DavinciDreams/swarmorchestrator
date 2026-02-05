/**
 * SDK Swarm Logging System
 *
 * Comprehensive logging for Agent SDK swarms including:
 * - Execution time tracking
 * - Tools usage logging
 * - Agent configuration logging
 * - Topology tracking
 * - Performance metrics
 */

import { getDefaultPersistenceManager } from "./persistence.js";

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
  toolsUsageCount: Record<string, number>;
  agentExecutionCount: Record<string, number>;
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
      toolsUsageCount: {},
      agentExecutionCount: {},
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
    error?: string
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

    // Update performance metrics
    this.updatePerformanceMetrics(executionLog);

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

    const report = `
=== SDK Swarm Execution Report ===
Session ID: ${this.sessionId}
Swarm ID: ${this.swarmId || "N/A"}

--- Performance Metrics ---
Total Executions: ${metrics.totalExecutions}
Successful: ${metrics.successfulExecutions}
Failed: ${metrics.failedExecutions}
Success Rate: ${successRate.toFixed(2)}%
Average Duration: ${metrics.averageDuration.toFixed(0)}ms
Average Quality: ${metrics.averageQuality.toFixed(2)}
Total Tokens Used: ${metrics.totalTokensUsed}

--- Tools Usage ---
${Object.entries(metrics.toolsUsageCount)
  .sort(([, a], [, b]) => b - a)
  .map(([tool, count]) => `  ${tool}: ${count}`)
  .join("\n")}

--- Agent Execution Counts ---
${Object.entries(metrics.agentExecutionCount)
  .sort(([, a], [, b]) => b - a)
  .map(([agent, count]) => `  ${agent}: ${count}`)
  .join("\n")}

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

  private updatePerformanceMetrics(log: ExecutionLog): void {
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
