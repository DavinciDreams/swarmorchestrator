# Swarm Orchestrato

A [DeepAgents.js](https://github.com/langchain-ai/deepagentsjs) deep agent that orchestrates multi-agent swarms via [Claude Flow](https://github.com/ruvnet/claude-flow) MCP. It never does work itself — it plans, dispatches, tracks, and course-corrects across a fleet of 60+ specialized AI agents.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  SWARM ORCHESTRATO                       │
│              (DeepAgents.js Deep Agent)                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              BACKGROUND DAEMON                    │   │
│  │  ┌────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐ │   │
│  │  │  Map   │ │ Audit  │ │ Optimize │ │TestGaps │ │   │
│  │  │ Worker │ │ Worker │ │  Worker  │ │ Worker  │ │   │
│  │  └───┬────┘ └───┬────┘ └────┬─────┘ └────┬────┘ │   │
│  │      │          │           │            │       │   │
│  │      └──────────┴───────────┴────────────┘       │   │
│  │                    ↓                              │   │
│  │        ┌──────────────────────┐                  │   │
│  │        │   Dynamic Scaling    │                  │   │
│  │        │  2-8 agents/task     │                  │   │
│  │        └──────────────────────┘                  │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                               │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐          │
│  │  Planner  │  │  Todos   │  │  Subagents    │          │
│  │ (builtin) │  │ (builtin)│  │               │          │
│  └──────────┘  └──────────┘  │ - architect    │          │
│                               │ - dispatcher   │          │
│  ┌─────────────────────────┐ │ - tracker      │          │
│  │    MCP Tool Bridge      │ │ - recovery     │          │
│  │ (32 LangChain tools)    │ └───────────────┘          │
│  └────────────┬────────────┘                             │
└───────────────┼──────────────────────────────────────────┘
                │ stdio
┌───────────────┼──────────────────────────────────────────┐
│           CLAUDE FLOW MCP SERVER (87 tools)              │
│                                                          │
│   Swarms ─── Agents ─── Tasks ─── Memory ─── Workflows   │
│   Neural ─── HNSW ─── Consensus ─── Fault Tolerance      │
└──────────────────────────────────────────────────────────┘
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

# Run interactive mode (binds to current directory)
npm start

# Run bound to a specific project
ORCHESTRATOR_PROJECT_ROOT=/path/to/project npm start

# Run background daemon (schedules all workers)
npm run daemon

# Run individual workers
npm run worker:map       # Build codebase map
npm run worker:audit     # Run security/quality audit
npm run worker:optimize  # Analyze optimizations
npm run worker:testgaps  # Find missing test coverage
```

The interactive CLI accepts missions in natural language:

```
mission> Build a REST API with authentication, database models, and tests
```

The orchestrator will spin up the appropriate swarm, decompose the work, dispatch to agents, and track progress autonomously.

## Swarm Workers

Workers use swarm-based chunking instead of single-agent processing. Each worker spawns multiple agents that process file chunks in parallel:

| Worker | Purpose | Command |
|--------|---------|---------|
| **Map** | Builds comprehensive codebase maps | `npm run worker:map` |
| **Audit** | Security and quality audits | `npm run worker:audit` |
| **Optimize** | Performance optimization analysis | `npm run worker:optimize` |
| **TestGaps** | Identifies missing test coverage | `npm run worker:testgaps` |

### Worker Files

```
src/workers/
├── base.ts      # Base class for all swarm workers
├── map.ts       # Codebase mapping worker
├── audit.ts     # Security/quality audit worker
└── optimize.ts  # Optimization analysis worker
```

## Dynamic Agent Scaling

Workers automatically scale the number of agents based on task size:

| Task Size | File Count | Agents Spawned |
|-----------|------------|----------------|
| Small | < 10 files | 2 agents |
| Medium | 10-50 files | 4 agents |
| Large | > 50 files | 8 agents |

This ensures efficient resource usage for small tasks while providing maximum parallelism for large codebases.

## Background Daemon

The daemon (`src/daemon.ts`) runs workers on a schedule or continuously:

```bash
# Start daemon
npm run daemon

# Daemon state is persisted to:
# .claude-flow/daemon-state.json
```

The daemon coordinates worker execution, handles failures, and persists state across restarts.

## Providers

Set `LLM_PROVIDER` in your `.env` to choose the backing model:

| Provider | Env Vars | Default Model |
|----------|----------|---------------|
| `anthropic` (default) | `ANTHROPIC_API_KEY` | `claude-opus-4-5-20251101` |
| `zai` (fallback) | `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_MODEL` | `glm-4.7` |
| `openrouter` | `OPENROUTER_API_KEY` | `anthropic/claude-sonnet-4` |
| `openai` | `OPENAI_API_KEY`, `OPENAI_BASE_URL` | `gpt-4o` |

**Default behavior:** Anthropic (Claude Agent SDK) is the primary provider. If no Anthropic API key is found, automatically falls back to z.ai.

z.ai, OpenRouter, and OpenAI use the OpenAI-compatible `ChatOpenAI` adapter, so any endpoint that speaks the OpenAI API format will work.

## How It Works

The orchestrator runs a strict **ORIENT - PLAN - DISPATCH - TRACK - ADAPT** loop on every turn:

1. **Orient** — Queries swarm status, active tasks, and persistent memory to understand the current state.
2. **Plan** — Decomposes the goal into subtasks with clear acceptance criteria. The built-in `write_todos` tool serves as the master execution ledger.
3. **Dispatch** — Assigns work to swarm agents via Claude Flow MCP. Can run tasks in parallel, sequentially, or through a coordinator hierarchy.
4. **Track** — Monitors task status, agent metrics, and system health. Persists progress to memory for cross-session continuity.
5. **Adapt** — Detects drift, handles failures with fault tolerance (retry/failover/checkpoint), and optimizes topology on the fly.

## Project Scoping

The orchestrator enforces strict project boundaries to prevent cross-project confusion and scope drift. When started, it binds to a specific project directory and ensures all tasks operate only within that boundary.

### Configuration

```bash
# Bind to current working directory (default)
npm start

# Bind to specific project
ORCHESTRATOR_PROJECT_ROOT=/home/user/my-project npm start
```

### How It Works

1. **Required Project Root** — The `projectRoot` config is mandatory. The orchestrator will not start without it.
2. **Path Validation** — Before dispatching any task, all file paths in the task description are validated against the project boundary.
3. **Scope Violations** — If a task references files outside the project, it returns a `SCOPE_VIOLATION` error instead of executing.
4. **Context Injection** — All dispatched tasks automatically include project context so agents know their boundaries.

### Utility Functions

The `project-context.ts` utility provides:

| Function | Purpose |
|----------|---------|
| `setProjectRoot(path)` | Set the global project root |
| `getProjectRoot()` | Get the current project root |
| `isWithinProject(path)` | Check if a path is within project bounds |
| `validatePath(path)` | Validate and return resolved path (throws on violation) |
| `extractAndValidatePaths(text)` | Scan text for paths and validate them |

### Example

```typescript
import { createOrchestrator } from "./src/lib.js";

// projectRoot is REQUIRED
const { agent } = await createOrchestrator({
  projectRoot: "/home/user/my-project",  // All tasks constrained to this directory
  provider: "anthropic",
});
```

## Tools (32)

### Swarm Management (6)
`swarm_init` - `swarm_status` - `swarm_monitor` - `swarm_scale` - `swarm_destroy` - `topology_optimize`

### Agent Lifecycle (6)
`agent_spawn` - `agent_list` - `agent_metrics` - `agent_communicate` - `agent_lifecycle` - `capability_match`

### Task Orchestration (7)
`task_orchestrate` - `task_status` - `task_results` - `parallel_execute` - `load_balance` - `coordination_sync` - `consensus_vote`

### Memory & Persistence (7)
`memory_store` - `memory_retrieve` - `memory_search` - `memory_list` - `memory_delete` - `state_snapshot` - `context_restore`

### Workflows & Health (6)
`workflow_execute` - `workflow_create` - `performance_report` - `bottleneck_analyze` - `health_check` - `fault_tolerance`

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
| Daemon state | JSON file | `.claude-flow/daemon-state.json` |

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
| `workers` | Worker execution state and results |

## Project Structure

```
src/
├── index.ts              # Interactive CLI entrypoint
├── lib.ts                # Library exports
├── orchestrator.ts       # Core DeepAgent definition + system prompt
├── daemon.ts             # Background daemon for worker scheduling
├── mcp/
│   └── client.ts         # MCP client bridge to Claude Flow
├── tools/
│   ├── index.ts          # Barrel export (32 tools)
│   ├── swarm.ts          # Swarm init/status/scale/destroy
│   ├── agents.ts         # Agent spawn/list/communicate/lifecycle
│   ├── tasks.ts          # Task dispatch/status/parallel/consensus
│   ├── memory.ts         # HNSW search/store/snapshot/restore
│   └── workflows.ts      # Workflow exec/performance/health
├── workers/
│   ├── base.ts           # Base class for swarm workers
│   ├── map.ts            # Codebase mapping worker
│   ├── audit.ts          # Security/quality audit worker
│   └── optimize.ts       # Optimization analysis worker
├── utils/
│   ├── params.ts         # Optional parameter handling
│   └── project-context.ts # Project scoping and path validation
└── subagents/
    └── index.ts          # 4 specialized coordination subagents
```

## Programmatic Usage

```typescript
import { createOrchestrator } from "./src/lib.js";
import { HumanMessage } from "@langchain/core/messages";

const { agent, recursionLimit, projectRoot } = await createOrchestrator({
  projectRoot: "/path/to/my-project",  // REQUIRED: constrains all tasks to this directory
  provider: "anthropic",
  workDir: "./my-workspace",
});

console.log(`Orchestrator bound to: ${projectRoot}`);

const result = await agent.invoke(
  { messages: [new HumanMessage("Build a REST API with auth")] },
  { recursionLimit, configurable: { thread_id: "session-1" } },
);
```

## License

MIT
