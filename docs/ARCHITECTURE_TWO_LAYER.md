# Architecture: Two-Layer Design

## Overview

Swarm Orchestrator uses a **two-layer architecture** to separate infrastructure management from task execution. This design prevents confusion, reduces resource conflicts, and provides clear boundaries for when to use each system.

```
┌─────────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR LAYER                         │
│            (DeepAgents.js - Coordination Only)               │
│   - Receives user missions                                   │
│   - Maintains todos and task graph                           │
│   - Decides MCP vs SDK routing                               │
│   - Never executes work directly                             │
└───────────┬─────────────────────────────────┬───────────────┘
            │                                 │
            │                                 │
    ┌───────▼────────┐               ┌───────▼────────┐
    │   MCP LAYER    │               │   SDK LAYER    │
    │ (Infrastructure)│               │  (Execution)   │
    └────────────────┘               └────────────────┘
```

---

## Layer 1: MCP Infrastructure

### Purpose
Manages the **infrastructure** of agent swarms — agent lifecycle, topology, health monitoring, consensus, and resource allocation.

### Responsibilities

**Agent Lifecycle Management**
- Spawn new agents with specific roles
- Terminate idle or failed agents
- Update agent configurations
- Track agent health and status

**Swarm Topology**
- Initialize swarms with specific topologies (mesh, hierarchical, star, etc.)
- Optimize topology based on task characteristics
- Scale swarms up/down based on load
- Monitor network communication patterns

**Resource Management**
- Load balance tasks across available agents
- Prevent resource conflicts
- Monitor memory and CPU usage
- Implement fault tolerance mechanisms

**Persistence & State**
- Store task history and execution logs
- Maintain agent registry
- Persist swarm configurations
- Handle consensus voting for distributed decisions

### Technology Stack
- **Transport:** stdio (Claude Flow MCP server)
- **Tools:** 87 MCP tools (prefixed with `mcp_*`)
- **State Storage:** `.claude-flow/` directory
- **Agent Registry:** `.claude-flow/agents/store.json`
- **Max Agents:** 8 (configurable via `CLAUDE_FLOW_MAX_AGENTS`)

### When to Use MCP Layer
Use MCP when you need to:
- ✅ Initialize a new swarm
- ✅ Spawn or terminate agents
- ✅ Check agent health or status
- ✅ Load balance tasks
- ✅ Store persistent state
- ✅ Run consensus voting
- ✅ Optimize swarm topology

---

## Layer 2: SDK Execution

### Purpose
Handles **task execution** — code generation, file operations, security audits, quality evaluation, and iterative refinement.

### Responsibilities

**Code Operations**
- Generate new code files
- Modify existing code
- Refactor and optimize code
- Apply code patterns

**File Operations**
- Read and write files
- Create directory structures
- Execute bash commands
- Search and replace across files

**Quality Assurance**
- Evaluate task outputs against criteria
- Run iterative refinement loops
- Generate improvement suggestions
- Track quality metrics

**Background Workers**
- Security audits (scan for vulnerabilities)
- Codebase mapping (generate structure maps)
- Optimization analysis (identify bottlenecks)
- Test gap detection (find missing tests)

**Learning & Adaptation**
- Learn from past executions
- Store and retrieve patterns
- Apply historical knowledge
- Improve over time

### Technology Stack
- **Framework:** Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- **Tools:** Claude's native tools (Read, Write, Bash, Edit) + custom SDK tools (prefixed with `sdk_*`)
- **State Storage:** `.memory/` directory
- **Execution Logs:** `.memory/executions/`
- **Max Agents:** 8 (configurable via `SWARM_MAX_AGENTS`)

### When to Use SDK Layer
Use SDK when you need to:
- ✅ Generate or modify code
- ✅ Read or write files
- ✅ Execute bash commands
- ✅ Run security audits
- ✅ Evaluate task quality
- ✅ Iterate until quality threshold met
- ✅ Build codebase maps
- ✅ Learn from execution history

---

## Further Reading

- [DECISION_MATRIX.md](./DECISION_MATRIX.md) - When to use MCP vs SDK (with examples)
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Complete system architecture with diagrams
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - Extending each layer
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - Upgrading to two-layer architecture

---

**Last Updated:** 2026-02-06
**Architecture Version:** 2.0 (Two-Layer Design)
