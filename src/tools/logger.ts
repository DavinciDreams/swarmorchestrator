/**
 * Logger Tools
 *
 * LangChain tools for accessing and managing SDK swarm logs
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getGlobalLogger } from "../utils/logger.js";

/**
 * Get SDK swarm logs with optional filtering
 */
export const sdkGetLogs = tool(
  async ({ type, agentName, taskType, minQuality, maxDuration, limit }) => {
    try {
      const logger = getGlobalLogger();

      let logs: unknown[] = [];

      if (!type || type === "executions") {
        const executionLogs = logger.getFilteredExecutionLogs({
          agentName,
          taskType,
          minQuality,
          maxDuration,
        });

        logs = executionLogs.slice(0, limit);
      } else if (type === "agent-configs") {
        const agentConfigs = logger.getAgentConfigs();
        logs = agentConfigs.slice(0, limit);
      } else if (type === "topology") {
        const topologyLogs = logger.getTopologyLogs();
        logs = topologyLogs.slice(0, limit);
      } else if (type === "metrics") {
        logs = [logger.getPerformanceMetrics()];
      }

      return JSON.stringify({
        success: true,
        type,
        count: logs.length,
        logs,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: "LOG_RETRIEVAL_FAILED",
        message: errorMessage,
      });
    }
  },
  {
    name: "sdk_get_logs",
    description: `Get SDK swarm logs with optional filtering.

Use this to:
- View execution history and performance
- Analyze tool usage patterns
- Monitor agent configurations
- Track topology changes
- Review performance metrics

Log types:
- executions: Task execution logs (default)
- agent-configs: Agent configuration logs
- topology: Topology and swarm configuration logs
- metrics: Performance metrics summary`,
    schema: z.object({
      type: z
        .enum(["executions", "agent-configs", "topology", "metrics"])
        .optional()
        .describe("Type of logs to retrieve (default: executions)"),
      agentName: z.string().optional().describe("Filter by agent name"),
      taskType: z.string().optional().describe("Filter by task type"),
      minQuality: z.number().optional().describe("Filter by minimum quality score (0-1)"),
      maxDuration: z.number().optional().describe("Filter by maximum duration in milliseconds"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of logs to return (default: 50)"),
    }),
  }
);

/**
 * Generate execution report
 */
export const sdkGenerateReport = tool(
  async () => {
    try {
      const logger = getGlobalLogger();
      const report = logger.generateExecutionReport();
      const metrics = logger.getPerformanceMetrics();

      return JSON.stringify({
        success: true,
        report,
        metrics,
        sessionId: logger.getSessionId(),
        swarmId: logger.getSwarmId(),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: "REPORT_GENERATION_FAILED",
        message: errorMessage,
      });
    }
  },
  {
    name: "sdk_generate_report",
    description: `Generate a comprehensive execution report for the SDK swarm.

The report includes:
- Session and swarm information
- Performance metrics (success rate, average duration, quality)
- Tools usage statistics
- Agent execution counts
- Topology information
- Recent execution history

Use this for:
- Quick performance overview
- Identifying bottlenecks
- Monitoring swarm health
- Debugging issues`,
    schema: z.object({}),
  }
);

/**
 * Export logs to storage
 */
export const sdkExportLogs = tool(
  async ({ exportPath, includeTypes }) => {
    try {
      const logger = getGlobalLogger();

      // Collect logs by type
      const exportData: Record<string, unknown> = {
        sessionId: logger.getSessionId(),
        swarmId: logger.getSwarmId(),
        exportTime: new Date().toISOString(),
      };

      if (includeTypes.includes("executions")) {
        exportData.executions = logger.getExecutionLogs();
      }

      if (includeTypes.includes("agent-configs")) {
        exportData.agentConfigs = logger.getAgentConfigs();
      }

      if (includeTypes.includes("topology")) {
        exportData.topologyLogs = logger.getTopologyLogs();
      }

      if (includeTypes.includes("metrics")) {
        exportData.metrics = logger.getPerformanceMetrics();
      }

      // Export using logger's export method
      await logger.exportLogs(exportPath);

      return JSON.stringify({
        success: true,
        exportPath,
        typesIncluded: includeTypes,
        executionCount: Array.isArray(exportData.executions) ? exportData.executions.length : 0,
        agentConfigCount: Array.isArray(exportData.agentConfigs) ? exportData.agentConfigs.length : 0,
        topologyLogCount: Array.isArray(exportData.topologyLogs) ? exportData.topologyLogs.length : 0,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: "EXPORT_FAILED",
        message: errorMessage,
      });
    }
  },
  {
    name: "sdk_export_logs",
    description: `Export SDK swarm logs to storage for archiving or analysis.

Export types:
- executions: Task execution logs
- agent-configs: Agent configuration logs
- topology: Topology and swarm configuration logs
- metrics: Performance metrics

Use this for:
- Archiving logs for long-term storage
- Sharing logs with team members
- Offline analysis
- Backup purposes`,
    schema: z.object({
      exportPath: z.string().describe("Path for exported logs (e.g., 'sdk-logs-export.json')"),
      includeTypes: z
        .array(z.enum(["executions", "agent-configs", "topology", "metrics"]))
        .default(["executions", "metrics"])
        .describe("Types of logs to include in export"),
    }),
  }
);

/**
 * Clear in-memory logs
 */
export const sdkClearLogs = tool(
  async ({ confirm }) => {
    try {
      if (!confirm) {
        return JSON.stringify({
          success: false,
          error: "CONFIRMATION_REQUIRED",
          message: "You must confirm with confirm=true to clear logs",
        });
      }

      const logger = getGlobalLogger();
      logger.clearLogs();

      return JSON.stringify({
        success: true,
        message: "In-memory logs cleared successfully",
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: "CLEAR_FAILED",
        message: errorMessage,
      });
    }
  },
  {
    name: "sdk_clear_logs",
    description: `Clear all in-memory logs from the SDK logger.

WARNING: This action cannot be undone. Only in-memory logs are cleared;
logs persisted to storage (MCP or local files) remain intact.

Use this for:
- Freeing memory after exporting logs
- Starting fresh logging session
- Testing purposes

Requires explicit confirmation (confirm=true).`,
    schema: z.object({
      confirm: z
        .boolean()
        .describe("Confirm log clearing (must be true to proceed)"),
    }),
  }
);

// =============================================================================
// Export all logger tools
// =============================================================================

export const loggerTools = [
  sdkGetLogs,
  sdkGenerateReport,
  sdkExportLogs,
  sdkClearLogs,
];
