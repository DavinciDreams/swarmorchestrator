# 🔍 Swarm Progress Monitoring Guide

## Quick Status Check

### 1. **Current Swarm Status**
```bash
# Check MCP swarm status
mcp swarm_status --swarmId swarm-1770320889147

# Or use Node.js
npx tsx test-logging.ts  # Run the test to see logging working
```

### 2. **Live Log Locations**

All swarm activity is logged to `.memory/` in real-time:

```
.memory/
├── executions/           ← Task execution logs
│   ├── _index.json       ← Index of all executions
│   └── {executionId}.json ← Individual execution details
│
├── tool_usage/           ← Tool call logs
│   ├── _index.json
│   └── tool-{id}.json    ← Tool parameters, results, duration
│
├── agent_configs/        ← Agent configurations
├── topology/             ← Swarm topology changes
├── sdk_coordinator/      ← Coordinator state & metrics
│   ├── coordinator_state.json    ← Current swarm config
│   └── coordinator_metrics.json  ← Performance metrics
│
└── general_logs/         ← General system logs
```

### 3. **Real-Time Monitoring**

**Watch logs continuously:**
```bash
# Monitor all logs
./watch-logs.sh

# Or watch in real-time (updates every 2 seconds)
watch -n 2 ./watch-logs.sh

# Monitor specific execution
watch -n 1 'ls -lt .memory/executions/*.json | head -5'

# Monitor tool usage
watch -n 1 'ls -lt .memory/tool_usage/*.json | head -5'
```

### 4. **Check Specific Logs**

**View recent execution:**
```bash
# Latest execution
cat $(ls -t .memory/executions/*.json | head -1) | jq '.'

# Specific execution by ID
cat .memory/executions/{executionId}.json | jq '.'
```

**View coordinator state:**
```bash
cat .memory/sdk_coordinator/coordinator_state.json | jq '.'
```

**View metrics:**
```bash
cat .memory/sdk_coordinator/coordinator_metrics.json | jq '.'
```

### 5. **Background Workers Status**

**Check daemon state:**
```bash
cat .claude-flow/daemon-state.json | jq '.workers'
```

**Monitor specific worker:**
```bash
# Map worker (codebase mapping)
cat .claude-flow/daemon-state.json | jq '.workers.map'

# Audit worker (security analysis)
cat .claude-flow/daemon-state.json | jq '.workers.audit'
```

### 6. **MCP Agent Status**

**Check all agents:**
```bash
# List all agents
npx @claude-flow/cli agent list

# Check specific agent
npx @claude-flow/cli agent status --agentId {agentId}

# Check swarm health
npx @claude-flow/cli swarm health --swarmId swarm-1770320889147
```

## Log Entry Examples

### Execution Log Structure
```json
{
  "executionId": "researcher-1-1770320889147",
  "taskType": "research",
  "description": "Generate babesia research report",
  "startTime": "2026-02-05T19:49:11.084Z",
  "endTime": "2026-02-05T19:54:16.230Z",
  "duration": 305146,
  "agentName": "researcher-1",
  "agentType": "Researcher",
  "toolsUsed": [
    {
      "toolName": "web_search",
      "duration": 2340,
      "success": true
    }
  ],
  "iterations": 2,
  "quality": 0.85,
  "success": true,
  "outputSize": 52315
}
```

### Tool Usage Log
```json
{
  "toolName": "web_search",
  "startTime": "2026-02-05T19:49:15.123Z",
  "endTime": "2026-02-05T19:49:17.463Z",
  "duration": 2340,
  "parameters": {
    "query": "babesia herbal treatments clinical studies"
  },
  "result": {
    "sources": 15,
    "quality": 0.9
  },
  "success": true
}
```

## Performance Metrics

**View current metrics:**
```bash
cat .memory/sdk_coordinator/coordinator_metrics.json | jq '.'
```

**Metrics tracked:**
- Total tasks executed
- Success/failure rates
- Average duration
- Average quality score
- Patterns learned
- Tools usage counts
- Agent execution counts

## Troubleshooting

### No logs appearing?
1. Check if swarm is actually running: `ps aux | grep orchestrator`
2. Verify logging is enabled in the current session
3. Check file permissions on `.memory/` directory

### Old logs?
1. Logs persist across sessions
2. Clear old logs: `rm -rf .memory/executions/*.json`
3. Or use the SDK: `logger.clearLogs()`

### Want more detail?
1. Enable debug logging in `src/utils/logger.ts`
2. Change `console.debug` to `console.log` for verbose output
3. Check `.claude-flow/logs/mcp-stderr.log` for MCP errors

## Quick Commands Reference

```bash
# Watch progress
./watch-logs.sh

# Check latest execution
cat $(ls -t .memory/executions/*.json | head -1) | jq '.'

# Count executions
ls .memory/executions/*.json | wc -l

# Check if swarm is running
ps aux | grep "tsx.*src/index.ts"

# View MCP logs
tail -f .claude-flow/logs/mcp-stderr.log

# Check daemon status
cat .claude-flow/daemon-state.json | jq '.workers'
```

## Pro Tips

1. **Continuous monitoring**: Use `watch -n 2 ./watch-logs.sh` for live updates
2. **Log rotation**: Old logs are kept for historical analysis
3. **Performance tracking**: Check `.memory/sdk_coordinator/coordinator_metrics.json` regularly
4. **Error debugging**: Failed executions are logged with error details
5. **Tool analysis**: Review `.memory/tool_usage/` to optimize tool selection

---

**For more information:**
- SDK Logging System: `src/utils/logger.ts`
- Test Suite: `test-logging.ts`
- LangChain Tools: `src/tools/logger.ts`
