# Swarm Orchestrato

A [DeepAgents.js](https://github.com/langchain-ai/deepagentsjs) deep agent that orchestrates multi-agent swarms via [Claude Flow](https://github.com/ruvnet/claude-flow) MCP. It never does work itself — it plans, dispatches, tracks, and course-corrects across a fleet of 60+ specialized AI agents.

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

## Documentation

- **Claude Flow Official Docs**: https://claude-flow.ruv.io/
- **Claude Flow GitHub**: https://github.com/ruvnet/claude-flow

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API key(s)

# Run
npm start
```

The interactive CLI accepts missions in natural language:

```
mission> Build a REST API with authentication, database models, and tests
```

The orchestrator will spin up the appropriate swarm, decompose the work, dispatch to agents, and track progress autonomously.

## Providers

Set `LLM_PROVIDER` in your `.env` to choose the backing model:

| Provider | Env Vars | Default Model |
|----------|----------|---------------|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5-20250929` |
| `zai` | `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_MODEL` | `glm-4.7` |
| `openai` | `OPENAI_API_KEY`, `OPENAI_BASE_URL` | `gpt-4o` |

z.ai and OpenAI use the OpenAI-compatible `ChatOpenAI` adapter, so any endpoint that speaks the OpenAI API format will work.

## How It Works

The orchestrator runs a strict **ORIENT → PLAN → DISPATCH → TRACK → ADAPT** loop on every turn:

1. **Orient** — Queries swarm status, active tasks, and persistent memory to understand the current state.
2. **Plan** — Decomposes the goal into subtasks with clear acceptance criteria. The built-in `write_todos` tool serves as the master execution ledger.
3. **Dispatch** — Assigns work to swarm agents via Claude Flow MCP. Can run tasks in parallel, sequentially, or through a coordinator hierarchy.
4. **Track** — Monitors task status, agent metrics, and system health. Persists progress to memory for cross-session continuity.
5. **Adapt** — Detects drift, handles failures with fault tolerance (retry/failover/checkpoint), and optimizes topology on the fly.

## Tools (32)

### Swarm Management (6)
`swarm_init` · `swarm_status` · `swarm_monitor` · `swarm_scale` · `swarm_destroy` · `topology_optimize`

### Agent Lifecycle (6)
`agent_spawn` · `agent_list` · `agent_metrics` · `agent_communicate` · `agent_lifecycle` · `capability_match`

### Task Orchestration (7)
`task_orchestrate` · `task_status` · `task_results` · `parallel_execute` · `load_balance` · `coordination_sync` · `consensus_vote`

### Memory & Persistence (7)
`memory_store` · `memory_retrieve` · `memory_search` · `memory_list` · `memory_delete` · `state_snapshot` · `context_restore`

### Workflows & Health (6)
`workflow_execute` · `workflow_create` · `performance_report` · `bottleneck_analyze` · `health_check` · `fault_tolerance`

## Subagents

The orchestrator delegates specialized coordination to 4 subagents, each running in an isolated context:

| Subagent | Role |
|----------|------|
| **swarm_architect** | Designs optimal swarm topologies — selects topology, agent composition, and consensus mechanism for a given task |
| **task_dispatcher** | Decomposes complex tasks into subtasks, resolves dependencies, and distributes work to agents |
| **progress_tracker** | Monitors all active work, maintains the master task ledger, detects stalls and drift |
| **recovery_coordinator** | Handles agent failures, task retries, state snapshots, and rollback |

## Persistence

All state survives process restarts:

| Layer | Backend | Storage |
|-------|---------|---------|
| Conversation state | SQLite via `@langchain/langgraph-checkpoint-sqlite` | `{workDir}/checkpoints.db` |
| Agent filesystem | `FilesystemBackend` | `{workDir}/` on disk |
| Orchestration memory | Claude Flow MCP hybrid backend + HNSW | `.claude-flow/data/` |
| State snapshots | Claude Flow MCP `state_snapshot` | Managed by MCP server |

## Memory Namespaces

The orchestrator organizes persistent state across these namespaces:

| Namespace | Purpose |
|-----------|---------|
| `tasks` | Task definitions, dependencies, task graph |
| `progress` | Completion status, timelines, rollups |
| `decisions` | Architecture/strategy decisions with rationale |
| `patterns` | Learned patterns about what works |
| `failures` | Failure logs with root causes |
| `recovery` | Recovery actions and outcomes |
| `context` | Project context, goals, acceptance criteria |

## Programmatic Usage

```typescript
import { createOrchestrator } from "./src/lib.js";
import { HumanMessage } from "@langchain/core/messages";

const { agent, recursionLimit } = await createOrchestrator({
  provider: "zai",
  workDir: "./my-workspace",
});

const result = await agent.invoke(
  { messages: [new HumanMessage("Build a REST API with auth")] },
  { recursionLimit, configurable: { thread_id: "session-1" } },
);
```

## Project Structure

```
src/
├── index.ts              # Interactive CLI entrypoint
├── lib.ts                # Library exports
├── orchestrator.ts       # Core DeepAgent definition + system prompt
├── mcp/
│   └── client.ts         # MCP client bridge to Claude Flow
├── tools/
│   ├── index.ts          # Barrel export (32 tools)
│   ├── swarm.ts          # Swarm init/status/scale/destroy
│   ├── agents.ts         # Agent spawn/list/communicate/lifecycle
│   ├── tasks.ts          # Task dispatch/status/parallel/consensus
│   ├── memory.ts         # HNSW search/store/snapshot/restore
│   └── workflows.ts      # Workflow exec/performance/health
└── subagents/
    └── index.ts          # 4 specialized coordination subagents
```

## License

MIT
