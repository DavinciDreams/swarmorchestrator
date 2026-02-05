# Swarm Orchestrato

Deep Agent orchestrator for coordinating agent swarms via Claude Flow MCP.

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

## Swarm Workers

The orchestrator includes background workers that use swarm-based chunking for parallel processing:

| Worker | Purpose | Script |
|--------|---------|--------|
| **Map** | Builds codebase maps by chunking files across agents | `pnpm worker:map` |
| **Audit** | Runs security/quality audits on code chunks | `pnpm worker:audit` |
| **Optimize** | Analyzes and suggests optimizations | `pnpm worker:optimize` |
| **TestGaps** | Identifies missing test coverage | `pnpm worker:testgaps` |

Workers are defined in `src/workers/` and share a common base class (`base.ts`) for consistent swarm coordination.

## Dynamic Agent Scaling

Workers automatically scale agent count based on task size:

| Task Size | File Count | Agent Count |
|-----------|------------|-------------|
| Small | < 10 files | 2 agents |
| Medium | 10-50 files | 4 agents |
| Large | > 50 files | 8 agents |

This ensures efficient resource usage while maintaining parallelism for larger tasks.

## Background Daemon

The daemon (`src/daemon.ts`) runs workers on a schedule or continuously in the background:

```bash
# Start the background daemon
pnpm daemon

# Or run directly
npx ts-node src/daemon.ts
```

The daemon coordinates all workers and persists state to `.claude-flow/daemon-state.json`.

## Project Rules

- The orchestrator NEVER does work directly — it coordinates swarm agents
- All actual execution happens via Claude Flow MCP agent swarms
- The todo list is the execution contract — treat it as sacred
- Persist all important state to memory namespaces
- Take state snapshots before risky operations
- Every dispatched task needs clear acceptance criteria
- Workers use swarm-based chunking — never single-agent processing
- **All tasks must stay within the project root** — cross-project operations are blocked
- **Permission skipping**: If granted dangerously-skip-permissions, you may skip routine prompts for reads, writes, and safe commands. You must STILL confirm before: deleting files, overwriting without backup, force-pushing, running destructive commands, or any action that cannot be undone with `git checkout`. Commit early. Use `git stash` or branches before large refactors. "Skip permissions" means "trust your judgment" — not "disable your judgment."

## Project Scoping

The orchestrator enforces strict project boundaries to prevent cross-project confusion:

1. **Required projectRoot** — The orchestrator will not start without a project root
2. **Automatic validation** — All task descriptions are scanned for external paths
3. **Scope violations** — Tasks referencing external files return errors, not results
4. **Context injection** — All dispatched tasks include project boundary context

```bash
# Run bound to current directory (default)
pnpm start

# Run bound to specific project
ORCHESTRATOR_PROJECT_ROOT=/path/to/project pnpm start
```

## Running

```bash
# Install
pnpm install

# Run interactive mode
pnpm start

# Run with custom workdir
ORCHESTRATOR_WORKDIR=./my-workspace pnpm start

# Run background daemon
pnpm daemon

# Run individual workers
pnpm worker:map
pnpm worker:audit
pnpm worker:optimize
pnpm worker:testgaps
```

## Key Files

| File | Purpose |
|------|---------|
| `src/orchestrator.ts` | Core orchestrator with project binding |
| `src/daemon.ts` | Background daemon that schedules workers |
| `src/workers/base.ts` | Base class for all swarm workers |
| `src/workers/map.ts` | Codebase mapping worker |
| `src/workers/audit.ts` | Security/quality audit worker |
| `src/workers/optimize.ts` | Optimization analysis worker |
| `src/utils/params.ts` | Optional parameter handling utility |
| `src/utils/project-context.ts` | Project scoping and path validation |

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
| workers | Worker execution state and results |

## References

- **Claude Flow Documentation**: https://claude-flow.ruv.io/
- **DeepAgents.js**: https://github.com/langchain-ai/deepagentsjs
