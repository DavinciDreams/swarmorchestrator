# Swarm Orchestrato

Deep Agent orchestrator for coordinating agent swarms via Claude Flow MCP.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              SWARM ORCHESTRATO                   │
│         (DeepAgents.js Deep Agent)               │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │  Planner  │  │  Todos   │  │  Subagents    │ │
│  │ (builtin) │  │ (builtin)│  │               │ │
│  └──────────┘  └──────────┘  │ - architect    │ │
│                               │ - dispatcher   │ │
│  ┌─────────────────────────┐ │ - tracker      │ │
│  │    MCP Tool Bridge      │ │ - recovery     │ │
│  │ (32 LangChain tools)    │ └───────────────┘ │
│  └────────────┬────────────┘                    │
└───────────────┼─────────────────────────────────┘
                │ stdio
┌───────────────┼─────────────────────────────────┐
│  CLAUDE FLOW MCP SERVER (87 tools)              │
│                                                  │
│  Swarms ─── Agents ─── Tasks ─── Memory         │
│  Neural ─── Workflows ─── Consensus             │
│  HNSW  ─── Fault Tolerance ─── Performance      │
└─────────────────────────────────────────────────┘
```

## Project Rules

- The orchestrator NEVER does work directly — it coordinates swarm agents
- All actual execution happens via Claude Flow MCP agent swarms
- The todo list is the execution contract — treat it as sacred
- Persist all important state to memory namespaces
- Take state snapshots before risky operations
- Every dispatched task needs clear acceptance criteria

## Running

```bash
# Install
pnpm install

# Run interactive mode
pnpm start

# Run with custom workdir
ORCHESTRATOR_WORKDIR=./my-workspace pnpm start
```

## Memory Namespaces

| Namespace | Purpose |
|-----------|---------|
| tasks | Task definitions, dependencies, task graph |
| progress | Completion status, timelines, rollups |
| decisions | Architecture/strategy decisions with rationale |
| patterns | Learned patterns about what works |
| failures | Failure logs with root causes |
| recovery | Recovery actions and outcomes |
| context | Project context, goals, acceptance criteria |

## References

- **Claude Flow Documentation**: https://claude-flow.ruv.io/
- **DeepAgents.js**: https://github.com/langchain-ai/deepagentsjs
