# SDK Swarm Logging Documentation

## Overview

The SDK Swarm Logging System provides comprehensive logging and tracking for all Agent SDK operations. It captures execution metrics, tool usage, agent configurations, and topology changes to enable detailed analysis and debugging of swarm behavior.

## Features

- **Execution Time Tracking**: Automatic measurement of task execution duration
- **Tools Usage Logging**: Detailed tracking of all tool invocations with timing and results
- **Agent Configuration Logging**: Capture of agent setup and configuration details
- **Topology Tracking**: Monitoring of swarm topology changes and agent dynamics
- **Performance Metrics**: Aggregated statistics on execution quality, success rates, and resource usage
- **Log Export/Query**: Ability to filter, search, and export log data

## Architecture

### Core Components

```
src/utils/logger.ts          # SDKLogger class and interfaces
src/agents/base-agent.ts     # Base agent with integrated logging
src/agents/agent-coordinator.ts  # Coordinator with topology logging
src/agents/worker-agent.ts   # Worker agent with execution logging
```

### Data Flow

```
Agent Execution
    ↓
SDKLogger logs start
    ↓
Tool invocations tracked
    ↓
SDKLogger logs completion
    ↓
Persisted to storage (MCP or local file)
```

## Log Schemas

### ExecutionLog

```typescript
interface ExecutionLog {
  executionId: string;           // Unique execution identifier
  taskType: string;              // Type of task executed
  description: string;           // Task description
  startTime: string;            // ISO timestamp
  endTime: string;              // ISO timestamp
  duration: number;              // Duration in milliseconds
  agentName: string;             // Name of executing agent
  agentType: string;             // Type/class of agent
  toolsUsed: ToolUsageLog[];    // Tools used during execution
  iterations: number;            // Number of iterations
  quality: number;               // Quality score (0-1)
  success: boolean;             // Execution success status
  error?: string;                // Error message if failed
  outputSize: number;            // Output size in bytes
}
```

### ToolUsageLog

```typescript
interface ToolUsageLog {
  toolName: string;              // Name of tool invoked
  startTime: string;            // ISO timestamp
  endTime: string;              // ISO timestamp
  duration: number;              // Duration in milliseconds
  parameters?: Record<string, unknown>;  // Tool parameters
  result?: unknown;             // Tool result
  success: boolean;             // Tool success status
  error?: string;                // Error message if failed
}
```

### AgentConfigLog

```typescript
interface AgentConfigLog {
  agentName: string;             // Agent name
  agentType: string;             // Agent type/class
  model: string;                 // Model used (haiku/sonnet/opus)
  maxTokens: number;             // Maximum tokens
  allowedTools: string[];        // Allowed tools list
  permissionMode: string;        // Permission mode
  systemPromptPrefix?: string;  // Custom system prompt
  customConfig?: Record<string, unknown>;  // Additional config
}
```

### TopologyLog

```typescript
interface TopologyLog {
  swarmId: string;               // Swarm identifier
  topology: string;              // Topology type
  maxAgents: number;             // Maximum agents
  agentsActive: number;          // Currently active agents
  timestamp: string;             // ISO timestamp
  changes: TopologyChange[];     // Array of changes
}
```

### TopologyChange

```typescript
interface TopologyChange {
  type: "agent_added" | "agent_removed" | "topology_changed" | "configuration_changed";
  timestamp: string;             // ISO timestamp
  details: Record<string, unknown>;  // Change details
}
```

### PerformanceMetrics

```typescript
interface PerformanceMetrics {
  totalExecutions: number;       // Total executions
  successfulExecutions: number;  // Successful executions
  failedExecutions: number;      // Failed executions
  averageDuration: number;       // Average execution duration
  averageQuality: number;        // Average quality score
  totalTokensUsed: number;       // Total tokens consumed
  toolsUsageCount: Record<string, number>;  // Tool usage counts
  agentExecutionCount: Record<string, number>;  // Agent execution counts
}
```

## Usage

### Basic Usage

The SDKLogger is automatically integrated into all agents. No manual setup required for basic logging.

```typescript
import { getGlobalLogger } from "./utils/logger.js";

// Get the global logger instance
const logger = getGlobalLogger();

// Log custom messages
await logger.log("info", "Custom log message", {
  customData: "value"
});

// Generate execution report
const report = logger.generateExecutionReport();
console.log(report);

// Export logs
await logger.exportLogs("/path/to/export.json");
```

### Querying Logs

```typescript
// Get all execution logs
const allExecutions = logger.getExecutionLogs();

// Filter execution logs
const successfulTasks = logger.getFilteredExecutionLogs({
  success: true,
  minQuality: 0.8,
  maxDuration: 10000
});

// Get agent configurations
const agentConfigs = logger.getAgentConfigs();

// Get topology logs
const topologyLogs = logger.getTopologyLogs();

// Get performance metrics
const metrics = logger.getPerformanceMetrics();
```

### Advanced Filtering

Filter logs by multiple criteria:

```typescript
const filteredLogs = logger.getFilteredExecutionLogs({
  agentName: "task-worker",
  agentType: "TaskAgent",
  taskType: "feature",
  minQuality: 0.7,
  success: true,
  maxDuration: 5000  // Max 5 seconds
});
```

## Log Levels

The SDKLogger supports four log levels:

- **debug**: Detailed information for debugging
- **info**: General informational messages
- **warn**: Warning messages for potential issues
- **error**: Error messages for failures

## Storage

Logs are automatically persisted to storage with automatic fallback:

1. **MCP Memory** (preferred): Uses MCP memory_store if available
2. **Local File** (fallback): Uses `.memory/` directory if MCP unavailable

### Namespaces

Logs are organized into namespaces:

- `general_logs`: General log messages
- `executions`: Execution logs
- `tool_usage`: Tool usage logs
- `agent_configs`: Agent configuration logs
- `topology`: Topology and swarm configuration logs
- `exports`: Exported log data

## Execution Report

The `generateExecutionReport()` method creates a comprehensive report:

```
=== SDK Swarm Execution Report ===
Session ID: session-1234567890-abc123
Swarm ID: swarm-9876543210

--- Performance Metrics ---
Total Executions: 42
Successful: 38
Failed: 4
Success Rate: 90.48%
Average Duration: 2345ms
Average Quality: 0.85
Total Tokens Used: 156789

--- Tools Usage ---
  Read: 156
  Write: 42
  Glob: 23
  Grep: 18
  Bash: 12

--- Agent Execution Counts ---
  task-worker: 38
  map-worker: 2
  audit-worker: 2

--- Topology ---
  Current: hierarchical-mesh
  Max Agents: 8
  Changes: 3

--- Recent Executions ---
  [exec-12345678] feature
    Agent: task-worker
    Duration: 1234ms
    Quality: 0.92
    Success: true
    Tools: 5
  ...
```

## Integration with Agent SDK

### BaseAgent Integration

The `BaseAgent` class automatically logs:

- Agent configuration on initialization
- Execution start/end with duration
- Tool usage with timing
- Errors and failures

### AgentCoordinator Integration

The `AgentCoordinator` automatically logs:

- Coordinator initialization
- Topology configuration and changes
- Task execution lifecycle
- Pattern learning events
- Performance metrics updates

### WorkerAgent Integration

The `WorkerAgent` automatically logs:

- Worker start/completion
- Files processed
- Findings count
- Execution duration

## Performance Considerations

### Logging Overhead

- **Minimal**: Logging adds < 1% overhead to execution time
- **Async**: Log persistence is non-blocking
- **Batched**: Multiple logs are batched for storage

### Storage Management

- **Automatic cleanup**: Old logs are cleaned up periodically
- **Configurable retention**: Log retention can be configured
- **Efficient storage**: Logs are compressed for long-term storage

## Debugging

### Enable Debug Logging

```typescript
import { getGlobalLogger } from "./utils/logger.js";

// Enable debug logging for detailed output
await logger.log("debug", "Debug message", {
  detailedInfo: "value"
});
```

### Check Log Storage

```typescript
import { getDefaultPersistenceManager } from "./utils/persistence.js";

const persistence = getDefaultPersistenceManager();
const result = await persistence.list("executions");

console.log("Execution logs:", result.keys);
```

## Best Practices

1. **Use structured logging**: Always pass relevant data objects
2. **Log at appropriate levels**: Use info for normal operations, debug for detailed info
3. **Filter queries**: Use specific filters to avoid loading all logs
4. **Export regularly**: Export logs for long-term analysis
5. **Monitor metrics**: Check performance metrics regularly for trends

## Troubleshooting

### Logs Not Appearing

**Problem**: Logs not being recorded

**Solutions**:
- Check MCP connection: `memory_store` must be available
- Verify logger initialization: `getGlobalLogger()` should be called
- Check console for error messages

### High Memory Usage

**Problem**: Logs consuming too much memory

**Solutions**:
- Call `logger.clearLogs()` periodically
- Export and delete old logs
- Adjust log retention settings

### Missing Tool Logs

**Problem**: Tool usage not being logged

**Solutions**:
- Ensure tools are called through BaseAgent
- Check tool name is being captured correctly
- Verify `tool_use` and `tool_result` events are flowing

## API Reference

### SDKLogger

#### Methods

- `log(level, message, data?)`: Log a message
- `logExecutionStart(executionId, taskType, description, agentName, agentType)`: Start execution tracking
- `logExecutionEnd(executionId, success, quality, output, iterations, toolsUsed, error?)`: End execution tracking
- `logToolStart(toolName, parameters?)`: Start tool tracking
- `logToolEnd(toolUsageId, result, success, error?)`: End tool tracking
- `logAgentConfig(agentName, agentType, config)`: Log agent configuration
- `logTopology(swarmId, topology, maxAgents, agentsActive, changes?)`: Log topology
- `logTopologyChange(type, details)`: Log topology change
- `getExecutionLogs()`: Get all execution logs
- `getFilteredExecutionLogs(filters)`: Filter execution logs
- `getAgentConfigs()`: Get agent configurations
- `getTopologyLogs()`: Get topology logs
- `getPerformanceMetrics()`: Get performance metrics
- `generateExecutionReport()`: Generate execution report
- `exportLogs(filePath)`: Export logs to file
- `clearLogs()`: Clear in-memory logs
- `getSessionId()`: Get session ID
- `getSwarmId()`: Get swarm ID

#### Properties

- `sessionId`: Current session ID
- `swarmId`: Current swarm ID (if initialized)

## Examples

### Example 1: Track Task Performance

```typescript
import { getGlobalLogger } from "./utils/logger.js";

const logger = getGlobalLogger();

// Execute a task
const result = await coordinator.executeWithImprovement(taskConfig);

// Get performance metrics
const metrics = logger.getPerformanceMetrics();

console.log(`Success Rate: ${(metrics.successfulExecutions / metrics.totalExecutions * 100).toFixed(2)}%`);
console.log(`Average Quality: ${metrics.averageQuality.toFixed(2)}`);
console.log(`Average Duration: ${metrics.averageDuration.toFixed(0)}ms`);
```

### Example 2: Analyze Tool Usage

```typescript
import { getGlobalLogger } from "./utils/logger.js";

const logger = getGlobalLogger();

// Get execution logs
const executions = logger.getExecutionLogs();

// Aggregate tool usage
const toolUsage = new Map<string, { count: number; totalTime: number }>();

for (const exec of executions) {
  for (const tool of exec.toolsUsed) {
    const current = toolUsage.get(tool.toolName) || { count: 0, totalTime: 0 };
    current.count++;
    current.totalTime += tool.duration;
    toolUsage.set(tool.toolName, current);
  }
}

// Print statistics
for (const [tool, stats] of toolUsage.entries()) {
  console.log(`${tool}: ${stats.count} calls, avg ${(stats.totalTime / stats.count).toFixed(2)}ms`);
}
```

### Example 3: Monitor Topology Changes

```typescript
import { getGlobalLogger } from "./utils/logger.js";

const logger = getGlobalLogger();

// Get topology logs
const topologyLogs = logger.getTopologyLogs();

// Analyze changes
for (const log of topologyLogs) {
  console.log(`\nSwarm: ${log.swarmId}`);
  console.log(`Topology: ${log.topology}`);
  console.log(`Active Agents: ${log.agentsActive}/${log.maxAgents}`);
  console.log(`Changes: ${log.changes.length}`);

  for (const change of log.changes) {
    console.log(`  - ${change.type}: ${JSON.stringify(change.details)}`);
  }
}
```

## Future Enhancements

Planned improvements to the logging system:

1. **Real-time monitoring**: WebSocket-based log streaming
2. **Log aggregation**: Cross-session log aggregation
3. **Visualization**: Dashboard for log visualization
4. **Alerting**: Automated alerts based on log patterns
5. **Machine learning**: Anomaly detection in execution patterns
6. **Export formats**: Support for CSV, Parquet, and other formats

## Contributing

When extending the logging system:

1. Follow existing log schema patterns
2. Add comprehensive documentation
3. Include unit tests
4. Update this documentation
5. Consider backward compatibility

## Support

For issues or questions about the SDK Swarm Logging System:

1. Check this documentation
2. Review log files in `.memory/` directory
3. Enable debug logging for detailed output
4. Check console for error messages

---

**Last Updated**: January 2025
**Version**: 1.0.0
