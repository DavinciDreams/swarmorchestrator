# Decision Matrix: When to Use MCP vs SDK

## Quick Reference

| **Task Type** | **Use** | **Why** | **Example Tools** |
|---------------|---------|---------|-------------------|
| Initialize swarm | **MCP** | Infrastructure setup | `mcp_swarm_init` |
| Spawn/terminate agents | **MCP** | Agent lifecycle | `mcp_agent_spawn`, `mcp_agent_terminate` |
| Check health | **MCP** | Infrastructure monitoring | `mcp_health_check` |
| Load balancing | **MCP** | Resource optimization | `mcp_load_balance` |
| Generate code | **SDK** | File creation | `sdk_code_task` |
| Modify files | **SDK** | File operations | `sdk_execute_task` |
| Run security audit | **SDK** | Execution with tools | `sdk_audit_task` |
| Evaluate quality | **SDK** | Quality assessment | Built into SDK coordinator |
| Build codebase map | **SDK** | File reading + processing | `sdk_run_worker` (map) |
| Store memory | **MCP** | Persistent storage backend | `mcp_memory_store` |
| Learn from patterns | **SDK** | Historical learning | Built into SDK coordinator |
| Consensus voting | **MCP** | Distributed coordination | `mcp_consensus` |

---

## Decision Tree

```
┌─────────────────────────────────────────────────────────┐
│ New Task Arrives                                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│ Question 1: Does this involve agent/swarm lifecycle?   │
│ (spawn, terminate, scale, health, status)              │
└────────┬───────────────────────────────────┬───────────┘
         │ YES                                │ NO
         ▼                                    ▼
    ┌────────┐                    ┌────────────────────────────┐
    │  MCP   │                    │ Question 2: Does this need │
    │ Layer  │                    │ file I/O or code changes?  │
    └────────┘                    └────┬───────────────┬───────┘
                                       │ YES           │ NO
                                       ▼               ▼
                                  ┌────────┐    ┌──────────────┐
                                  │  SDK   │    │ Question 3:  │
                                  │ Layer  │    │ Quality eval?│
                                  └────────┘    └──┬───────┬───┘
                                                   │ YES   │ NO
                                                   ▼       ▼
                                              ┌────────┐ ┌─────────────┐
                                              │  SDK   │ │Orchestrator │
                                              │ Layer  │ │   Layer     │
                                              └────────┘ └─────────────┘
```

---

## Scenario-Based Examples

### Scenario 1: "Build a REST API"

**Decision:** Use **SDK Layer**

**Why:**
- Involves code generation ✓
- Requires file operations ✓
- Needs quality evaluation ✓

**Implementation:**
```typescript
const result = await sdkExecuteTask({
  taskType: "feature",
  description: "Create a REST API with CRUD operations for users",
  requirements: [
    "Use Express.js framework",
    "Include input validation",
    "Add error handling",
    "Write unit tests"
  ],
  targetPath: "/home/ubuntu/Dev/project/src/api/users.ts"
});
```

---

### Scenario 2: "Scale the swarm to 15 agents"

**Decision:** Use **MCP Layer**

**Why:**
- Involves agent lifecycle ✓
- Infrastructure change ✓
- No code generation needed ✓

**Implementation:**
```typescript
const result = await callMcpTool("mcp_swarm_scale", {
  swarmId: currentSwarmId,
  targetAgents: 15,
  scaleStrategy: "gradual"
});
```

---

### Scenario 3: "Run a security audit"

**Decision:** Use **SDK Layer**

**Why:**
- Requires file reading ✓
- Needs code analysis ✓
- Should generate report ✓

**Implementation:**
```typescript
const result = await sdkAuditTask({
  files: ["src/**/*.ts", "src/**/*.js"],
  checks: [
    "sql-injection",
    "xss",
    "secrets-in-code",
    "insecure-dependencies"
  ],
  reportPath: "./security-audit-report.md"
});
```

---

### Scenario 4: "Check if any agents are unhealthy"

**Decision:** Use **MCP Layer**

**Why:**
- Monitoring infrastructure ✓
- Checking agent status ✓
- No file operations needed ✓

**Implementation:**
```typescript
const health = await callMcpTool("mcp_health_check", {
  swarmId: currentSwarmId,
  includeMetrics: true
});

console.log(`Healthy agents: ${health.healthy}`);
console.log(`Unhealthy agents: ${health.unhealthy}`);
```

---

## Anti-Patterns (What NOT to Do)

### ❌ Anti-Pattern 1: Using MCP for Code Generation

```typescript
// WRONG - MCP doesn't have code generation tools
await callMcpTool("mcp_generate_code", {
  description: "Create a REST API"
});
```

**Correct approach:**
```typescript
// RIGHT - SDK handles code
await sdkCodeTask({
  description: "Create a REST API",
  targetPath: "./src/api.ts"
});
```

---

### ❌ Anti-Pattern 2: Using SDK for Agent Management

```typescript
// WRONG - SDK doesn't manage MCP infrastructure
const coordinator = new AgentCoordinator();
await coordinator.spawnAgent({
  type: "researcher"
});
```

**Correct approach:**
```typescript
// RIGHT - MCP handles agents
await callMcpTool("mcp_agent_spawn", {
  swarmId: swarmId,
  agentType: "researcher"
});
```

---

## Decision Checklist

Before calling a tool, ask yourself:

### For MCP Layer ✅
- [ ] Am I setting up or tearing down infrastructure?
- [ ] Am I managing agent lifecycle?
- [ ] Am I monitoring health or performance?
- [ ] Am I optimizing topology or load balancing?
- [ ] Do I need persistent storage backend?

**If YES to any** → Use MCP Layer (`mcp_*` tools)

### For SDK Layer ✅
- [ ] Am I generating or modifying code?
- [ ] Am I reading or writing files?
- [ ] Am I running bash commands?
- [ ] Am I executing a task with quality checks?
- [ ] Am I running an audit or analysis?
- [ ] Do I need iterative refinement?

**If YES to any** → Use SDK Layer (`sdk_*` tools)

---

## Environment Configuration

Configure each layer independently:

```bash
# .env

# ============================================
# MCP Infrastructure Layer
# ============================================
CLAUDE_FLOW_MODE=v3
CLAUDE_FLOW_TOPOLOGY=hierarchical-mesh
CLAUDE_FLOW_MAX_AGENTS=8
CLAUDE_FLOW_MEMORY_BACKEND=hybrid

# ============================================
# SDK Execution Layer
# ============================================
ITERATIVE_REFINEMENT_ENABLED=true
MAX_ITERATIONS=1
QUALITY_THRESHOLD=0.8
SWARM_MAX_AGENTS=8

# ============================================
# Shared Configuration
# ============================================
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Further Reading

- [ARCHITECTURE_TWO_LAYER.md](./ARCHITECTURE_TWO_LAYER.md) - Two-layer design explanation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Complete system architecture
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - Extending each layer
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Debugging layer issues

---

**Last Updated:** 2026-02-06
**Decision Matrix Version:** 1.0
