# Swarm Orchestrato User Guide

**Version 1.0.0** | A DeepAgents.js orchestrator for coordinating multi-agent swarms via Claude Flow MCP

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Quick Start](#2-quick-start)
3. [Core Concepts](#3-core-concepts)
4. [Architecture Overview](#4-architecture-overview)
5. [Subagents](#5-subagents)
6. [Swarm Workers](#6-swarm-workers)
7. [MCP Tools](#7-mcp-tools)
8. [SDK Tools](#8-sdk-tools)
9. [Configuration](#9-configuration)
10. [Usage Patterns](#10-usage-patterns)
11. [Troubleshooting](#11-troubleshooting)
12. [Advanced Features](#12-advanced-features)
13. [FAQ](#13-faq)

---

## 1. Introduction

### What is Swarm Orchestrato?

Swarm Orchestrato is a **command-and-control deep agent** built on [DeepAgents.js](https://github.com/langchain-ai/deepagentsjs) that orchestrates multi-agent swarms via the [Claude Flow MCP](https://github.com/ruvnet/claude-flow) server. Unlike traditional AI agents that execute tasks directly, Swarm Orchestrato **never does work itself** — it plans, dispatches, tracks, and course-corrects across a fleet of 60+ specialized AI agents.

### Who is it for?

Swarm Orchestrato is designed for:

- **Developers** building complex applications that require coordinated AI agent workflows
- **DevOps teams** needing autonomous code analysis, auditing, and optimization
- **Research teams** requiring distributed, parallel processing of large-scale tasks
- **Anyone** seeking to leverage multi-agent AI systems for production workloads

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Zero Manual Execution** | The orchestrator delegates all work — you define goals, it handles everything else |
| **Autonomous Operation** | Runs ORIENT → PLAN → DISPATCH → TRACK → ADAPT loops continuously |
| **Project-Scoped** | Strict boundary enforcement prevents cross-project contamination |
| **Fault Tolerant** | Built-in recovery coordination, state snapshots, and failure handling |
| **Persistent Memory** | Hybrid memory backend with HNSW vector search for long-term context |
| **Dynamic Scaling** | Automatically scales from 2-8 agents based on task complexity |
| **60+ Specialized Agents** | Access to Claude Flow's full toolkit via MCP integration |

---

## 2. Quick Start

### Prerequisites

- **Node.js** 18+ or compatible runtime
- **npm** or **pnpm** package manager
- **API Key** for one of the supported LLM providers (Anthropic, OpenAI, OpenRouter, or z.ai)
- **Claude Flow MCP** server configured (see [Configuration](#9-configuration))

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/swarmorchestrato.git
cd swarmorchestrato

# Install dependencies
npm install
# or
pnpm install
```

### Setup

1. **Configure environment variables:**

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your preferred editor
nano .env
```

2. **Add your API key:**

```env
# For Anthropic (recommended)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here

# OR for z.ai (free tier available)
LLM_PROVIDER=zai
ZAI_API_KEY=your-zai-key
ZAI_BASE_URL=https://api.z.ai/v1
ZAI_MODEL=glm-4.7
```

3. **Configure Claude Flow MCP:**

Ensure your `.mcp.json` or MCP configuration includes the Claude Flow server. Example:

```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "npx",
      "args": ["claude-flow-mcp"]
    }
  }
}
```

### Basic Usage

#### Interactive Mode

Start the orchestrator in interactive mode (binds to current directory):

```bash
npm start
```

You'll see a prompt where you can enter missions:

```
Swarm Orchestrato v1.0.0
Project Root: /home/user/my-project

mission> Build a REST API with authentication, database models, and tests
```

The orchestrator will:
1. **Orient** — Understand the goal and check current state
2. **Plan** — Decompose into subtasks with acceptance criteria
3. **Dispatch** — Assign work to specialized agents
4. **Track** — Monitor progress and update task ledger
5. **Adapt** — Handle failures and optimize topology

#### Bound to Specific Project

```bash
# Run with explicit project binding
ORCHESTRATOR_PROJECT_ROOT=/path/to/my-project npm start
```

#### Background Daemon

Run workers continuously in the background:

```bash
# Start the daemon (schedules all workers)
npm run daemon

# Check daemon status
npm run daemon:status
```

#### Individual Workers

Run specific workers on-demand:

```bash
# Build codebase map
npm run worker:map

# Run security/quality audit
npm run worker:audit

# Analyze performance optimizations
npm run worker:optimize

# Find missing test coverage
npm run worker:testgaps
```

### Example: First Mission

```bash
npm start
```

```
mission> Create a new Express.js API endpoint at src/api/users.ts that handles GET /users with pagination
```

**What happens:**

1. Orchestrator creates a todo list with subtasks
2. Spawns a swarm with appropriate topology (likely `hierarchical`)
3. Dispatches code generation task to specialized agents
4. Monitors progress via `task_status`
5. Validates output against acceptance criteria
6. Updates persistent memory with results

**Output:**

```
✓ Initialized swarm (swarm-abc123) with hierarchical topology
✓ Spawned 3 agents: code-gen, reviewer, tester
✓ Task dispatched: Create Express endpoint
✓ Code generated at src/api/users.ts
✓ Tests created at src/api/users.test.ts
✓ All acceptance criteria met

Mission complete!
```

---

## 3. Core Concepts

### Swarms

A **swarm** is a coordinated group of AI agents working together under a specific topology. Swarms are ephemeral — they're created for a mission, execute tasks, and can be destroyed when complete.

**Key Properties:**
- **Topology**: The communication structure (hierarchical, mesh, hybrid, etc.)
- **Max Agents**: Upper limit on swarm size (default: 15)
- **Coordination Strategy**: How work is distributed (specialized, balanced, consensus, adaptive)

### Agents

**Agents** are individual AI workers spawned within a swarm. Each agent has:
- **Role**: Specialized function (code-gen, reviewer, researcher, etc.)
- **Tools**: Access to Claude's native tools (Read, Write, Edit, Bash, etc.)
- **Context**: Project boundaries, task requirements, swarm coordination info

**Agent Lifecycle:**
```
spawn → assign task → execute → report → terminate
```

### Tasks

**Tasks** represent discrete units of work with clear acceptance criteria. Tasks can be:
- **Parallel**: Independent execution across multiple agents
- **Sequential**: Ordered dependencies, one after another
- **Pipeline**: Output of one feeds input of next
- **Broadcast**: Same task sent to all agents simultaneously

**Task Structure:**
```typescript
{
  type: "feature" | "bugfix" | "research" | "refactor" | "documentation" | "testing" | "security" | "performance",
  description: "What needs to be done",
  requirements: ["Acceptance criterion 1", "Acceptance criterion 2"],
  targetPath: "/path/within/project"
}
```

### Memory

Swarm Orchestrato uses a **hybrid memory backend** with:
- **SQLite checkpoints**: Conversation state persistence
- **HNSW vector search**: Semantic retrieval of past decisions, patterns, failures
- **Namespaced storage**: Organized by concern (tasks, progress, decisions, etc.)

**Memory Namespaces:**

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

### Topologies

**Topology** determines how agents communicate and coordinate:

| Topology | Structure | Best For | Coordination |
|----------|-----------|----------|--------------|
| **hierarchical** | Queen + workers | Coding, audits, tight control | Top-down, anti-drift |
| **mesh** | Peer-to-peer | Research, brainstorming | Consensus-driven |
| **hierarchical-mesh** | Queen + peer mesh | Large teams (10+) | Hybrid: control + collaboration |
| **ring** | Sequential chain | Pipelines, staged handoffs | Linear, ordered |
| **star** | Central hub | GitHub ops, simple dispatch | Hub-and-spoke |
| **adaptive** | Dynamic routing | Unpredictable workloads | Load-based |

### The Operating Loop

Swarm Orchestrato runs a strict 5-phase cycle on every turn:

```
┌─────────────────────────────────────────┐
│         1. ORIENT                       │
│  Query state, recall context            │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│         2. PLAN                         │
│  Decompose, sequence, write todos       │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│         3. DISPATCH                     │
│  Assign work to swarms/agents           │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│         4. TRACK                        │
│  Monitor status, update ledger          │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│         5. ADAPT                        │
│  Handle drift, failures, optimize       │
└─────────────────────────────────────────┘
```

**1. ORIENT** — Understand the situation
- What is the current goal?
- What tasks are in progress, completed, or blocked?
- Use `memory_search`, `swarm_status`, `task_status`

**2. PLAN** — Decompose and sequence
- Break goal into smallest independently-completable subtasks
- Identify dependencies: parallel vs sequential
- Use `write_todos` aggressively — the todo list IS the master plan
- Store task graph in memory (namespace: `tasks`)

**3. DISPATCH** — Assign work to swarms
- Delegate to subagents for specialized coordination
- Use MCP tools: `swarm_init`, `agent_spawn`, `task_orchestrate`
- Use SDK tools: `sdk_execute_task`, `sdk_code_task`, `sdk_audit_task`

**4. TRACK** — Monitor and course-correct
- Check `task_status` on active tasks
- Update todo list as tasks complete/fail
- Persist progress to memory (namespace: `progress`)
- Run `performance_report`, `health_check` periodically

**5. ADAPT** — Handle drift and failures
- Compare outputs against acceptance criteria
- Re-dispatch drifted tasks with tighter constraints
- Use `fault_tolerance` for agent failures
- Use `topology_optimize` or `swarm_scale` for underperformance
- Take `state_snapshot` before destructive recovery

---

## 4. Architecture Overview

### Three-Layer Architecture

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

### Component Responsibilities

#### Layer 1: Orchestrator Core

**Location:** `src/orchestrator.ts`

**Responsibilities:**
- Runs the ORIENT → PLAN → DISPATCH → TRACK → ADAPT loop
- Maintains the master execution plan (todo list)
- Enforces project boundaries (scope validation)
- Manages conversation state and checkpointing

**Key Features:**
- **Project Binding**: All operations constrained to `projectRoot`
- **Built-in Tools**: Planner, TodoList, Read, Write, Edit, Bash
- **Subagent Delegation**: Spawns specialized coordinators
- **Persistence**: SQLite checkpoints + filesystem backend

#### Layer 2: Tool Bridge (MCP + SDK)

**Location:** `src/tools/`, `src/mcp/client.ts`

**Responsibilities:**
- Wraps Claude Flow MCP tools as LangChain tools
- Provides SDK-based execution tools (hybrid architecture)
- Validates paths before dispatching tasks
- Injects project context into task descriptions

**Tool Categories:**
1. **Swarm Management** (6 tools): init, status, scale, destroy, etc.
2. **Agent Lifecycle** (6 tools): spawn, list, communicate, metrics, etc.
3. **Task Orchestration** (7 tools): orchestrate, status, parallel, consensus, etc.
4. **Memory & Persistence** (7 tools): store, retrieve, search, snapshot, etc.
5. **Workflows & Health** (6 tools): execute, performance, health, fault tolerance, etc.
6. **SDK Execution** (5 tools): execute_task, code_task, audit_task, run_worker, get_metrics

#### Layer 3: Claude Flow MCP Server

**External Service** (87 tools)

**Responsibilities:**
- Manages agent swarms and topologies
- Executes tasks with consensus mechanisms
- Provides hybrid memory backend (HNSW + persistence)
- Handles fault tolerance and recovery

**Key Capabilities:**
- Neural topology optimization
- Byzantine fault tolerance
- CRDT-based state merging
- Gossip-based consensus

### Subagent System

**Location:** `src/subagents/index.ts`

Specialized coordination agents running in isolated contexts:

| Subagent | Purpose | Tools |
|----------|---------|-------|
| `swarm_architect` | Designs swarm topologies | Swarm, Agent |
| `task_dispatcher` | Decomposes and distributes tasks | Task, Agent, Memory |
| `progress_tracker` | Monitors execution state | Task, Memory, Workflow |
| `recovery_coordinator` | Handles failures and recovery | Workflow, Memory, Agent, Swarm |

### Worker System

**Location:** `src/workers/`

Background workers for autonomous operations:

| Worker | Purpose | Scaling |
|--------|---------|---------|
| `map` | Build codebase structure maps | 2-8 agents |
| `audit` | Security/quality audits | 2-8 agents |
| `optimize` | Performance analysis | 2-8 agents |
| `testgaps` | Test coverage identification | 2-8 agents |

**Worker Architecture:**
- **Base Class**: `src/workers/base.ts` (swarm chunking, dynamic scaling)
- **Chunk Processing**: Parallel execution across multiple agents
- **Result Aggregation**: Combines outputs from all chunks
- **Failure Handling**: Graceful degradation with partial results

---

## 5. Subagents

Subagents are specialized coordinators that the orchestrator delegates to for complex, context-isolated tasks. Each runs in its own context window with tailored tools.

### Swarm Architect

**Name:** `swarm_architect`

**Purpose:** Designs optimal swarm configurations based on task requirements.

**When to Use:**
- Planning a new swarm before initialization
- Selecting topology for a complex task
- Determining agent composition and sizing
- Configuring consensus mechanisms

**Decision Framework:**

#### Topology Selection

| Topology | Best For | Characteristics |
|----------|----------|-----------------|
| `hierarchical` | Coding, audits | Tight control, anti-drift, clear authority |
| `mesh` | Research, brainstorming | Peer collaboration, consensus-driven |
| `hierarchical-mesh` | Large teams (10+) | Hybrid: top-down + peer communication |
| `ring` | Sequential pipelines | Staged handoffs, output → input |
| `star` | GitHub ops | Hub-and-spoke, simple dispatch |
| `adaptive` | Unpredictable workloads | Dynamic routing based on load |

#### Strategy Selection

| Strategy | Distribution | Best For |
|----------|--------------|----------|
| `specialized` | Clear role boundaries | Anti-drift, no task overlap |
| `balanced` | Even work distribution | Homogeneous agent pools |
| `consensus` | Gossip-based decisions | Research and analysis |
| `adaptive` | Dynamic task routing | Variable workloads |

#### Consensus Mechanism

| Mechanism | Type | Use Case |
|-----------|------|----------|
| `raft` | Leader-based, fast | Coding/development swarms |
| `byzantine` | Fault-tolerant | Adversarial/security contexts |
| `gossip` | Eventually consistent | Large-scale research |
| `quorum` | Configurable majority | Voting and approval flows |
| `crdt` | Conflict-free | Distributed state merging |

#### Agent Sizing

| Task Complexity | Agent Count |
|-----------------|-------------|
| Simple | 3-4 agents |
| Medium | 5-8 agents |
| Large-scale | 8-15 agents |

> **Note:** Never exceed 15 agents — coordination overhead outweighs benefits.

**Example Usage:**

```
mission> Design a swarm for a security audit of a 50-file codebase

Orchestrator → swarm_architect:
  "Analyze task: security audit, 50 files, high criticality"

swarm_architect responds:
  - Topology: hierarchical-mesh (queen for coordination, peer review mesh)
  - Agent Count: 8 (scaling for 50 files)
  - Consensus: raft (fast decision-making)
  - Strategy: specialized (clear audit boundaries)
  - Rationale: Security requires tight control + peer validation
```

---

### Task Dispatcher

**Name:** `task_dispatcher`

**Purpose:** Decomposes complex tasks into subtasks and distributes them to agents.

**When to Use:**
- Breaking down large missions into actionable work
- Resolving task dependencies
- Load balancing across agents
- Prioritizing critical path items

**Decomposition Principles:**

1. **Independence**: Each subtask must be completable by a single agent
2. **Minimal Dependencies**: Parallelize wherever possible
3. **Critical Path**: Identify and prioritize longest dependency chain
4. **Clear Criteria**: Every subtask has acceptance criteria

**Dispatch Strategy:**

```
1. Check available agents (agent_list)
2. Match subtasks to capabilities (capability_match)
3. For independent batches: task_orchestrate with 'parallel'
4. For dependency chains: task_orchestrate with 'sequential'
5. For homogeneous work: load_balance
6. For individual tracking: task_create
```

**Tracking Protocol:**

- Store task graph in memory (namespace: `tasks`)
- Record dependencies for critical path tracking
- Include task IDs for status checking
- Update orchestrator's todo list

**Anti-Drift Rules:**

- Never let subtask scope creep beyond original definition
- If output doesn't match criteria, re-dispatch (don't expand scope)
- Flag subtasks taking significantly longer than peers

**Example Usage:**

```
mission> Build a REST API with auth, DB models, and tests

Orchestrator → task_dispatcher:
  "Decompose: REST API + auth + DB + tests"

task_dispatcher creates:
  1. [parallel] Setup Express.js project structure
  2. [parallel] Define DB models (User, Session)
  3. [sequential after 1,2] Implement auth middleware
  4. [parallel after 3] Create API endpoints (GET/POST/PUT/DELETE)
  5. [parallel after 4] Write integration tests
  6. [sequential after all] Documentation

Dispatches:
  - Tasks 1,2 → parallel execution (2 agents)
  - Task 3 → waits for 1,2 completion
  - Tasks 4 → parallel execution (4 agents, one per endpoint)
  - Task 5 → parallel execution (4 agents, one per endpoint)
  - Task 6 → sequential (1 agent)
```

---

### Progress Tracker

**Name:** `progress_tracker`

**Purpose:** Monitors execution state and maintains the master task ledger.

**When to Use:**
- Status checks across all active work
- Detecting stalls, failures, drift
- Progress reports for the user
- Alerting on anomalies

**Monitoring Protocol:**

```
1. swarm_status → Overall swarm health
2. task_status → Each dispatched task
3. agent_health → Individual performance
4. health_check → If anomalies detected
5. bottleneck_analyze → If throughput is low
```

**State Management:**

- **Master Ledger**: Stored in memory (namespace: `progress`)
- **Key Format**: `task:{taskId}` with status, assignee, timestamps
- **Updates**: Real-time as tasks progress/complete/fail
- **Rollup**: `summary:latest` with aggregate status

**Alerting Criteria:**

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Task stuck | >10 min no progress | Escalate to orchestrator |
| Agent error rate | >20% | Trigger fault_tolerance |
| Swarm health | <80% | Run health_check |
| Memory pressure | >90% | Optimize/scale down |
| Task failed | Immediate | Escalate to recovery_coordinator |

**Drift Detection:**

- Compare actual progress vs original task graph
- Flag scope expansion beyond acceptance criteria
- Flag agents deviating from assigned roles
- Report severity: low (cosmetic), medium (functional), high (architectural)

**Example Usage:**

```
mission> Status check

Orchestrator → progress_tracker:
  "Provide status update on all active work"

progress_tracker responds:
  Overall Progress: 67%

  Completed: 4 tasks
    ✓ Setup Express project
    ✓ Define DB models
    ✓ Implement auth middleware
    ✓ Create GET /users endpoint

  In Progress: 2 tasks
    ⟳ Create POST /users endpoint (Agent: code-gen-2, 45% done)
    ⟳ Write integration tests (Agent: test-writer-1, 30% done)

  Blocked: 0 tasks
  Failed: 0 tasks

  Active Agents: 3/8 (37% utilization)
  Swarm Health: 95%

  Alerts: None
  Drift: None detected

  Estimated Remaining Work: ~15 minutes
```

---

### Recovery Coordinator

**Name:** `recovery_coordinator`

**Purpose:** Handles failures and maintains system resilience.

**When to Use:**
- Agent or task failures
- Before risky operations (take snapshots)
- System-level recovery after crashes
- Learning from failure patterns

**Recovery Strategies:**

#### Agent Failure

```
1. Confirm failure (agent_health)
2. Trigger adaptation (fault_tolerance)
3. If unresponsive: agent_terminate + agent_spawn replacement
4. If no agents available: state_snapshot + escalate
5. If erratic behavior: agent_update to reconfigure
```

#### Task Failure

```
1. Check error details (task_status)
2. If transient error: re-dispatch (task_orchestrate)
3. If persistent error: validate subtask definition
4. Store failure context (memory namespace: 'failures')
5. If 3+ failures on same task: escalate to orchestrator
```

#### System-Level Recovery

```
1. Identify scope (health_check)
2. Take snapshot (state_snapshot)
3. If coordination broken: coordination_sync
4. Last resort: context_restore to known good state
```

**Prevention Protocol:**

- **Before major operations**: Always take `state_snapshot`
- **After recovery**: Always run `health_check` to verify
- **Learning**: Store recovery actions in memory (namespace: `recovery`)
- **Pattern Analysis**: Track failures to suggest swarm reconfiguration

**Example Usage:**

```
mission> [Agent code-gen-2 failed with timeout error]

Orchestrator → recovery_coordinator:
  "Handle agent failure: code-gen-2"

recovery_coordinator:
  1. Checking agent health... TIMEOUT (no response for 120s)
  2. Taking state snapshot... ✓ snapshot-abc123
  3. Terminating unresponsive agent... ✓
  4. Spawning replacement... ✓ code-gen-2-replacement
  5. Re-dispatching task "Create POST /users"... ✓
  6. Storing failure context... ✓ (memory: failures/agent-timeout-20240205)
  7. Running health check... ✓ System stable

  Recovery complete. Task re-dispatched to healthy agent.
```

---

## 6. Swarm Workers

Workers are background processes that use swarm-based chunking to process large codebases in parallel. Each worker automatically scales agent count based on task size.

### Map Worker

**Purpose:** Builds comprehensive codebase structure maps.

**Command:**
```bash
npm run worker:map
```

**What it Does:**
- Scans project directory for source files
- Chunks files by directory or complexity
- Spawns agents (2-8) to analyze chunks in parallel
- Aggregates results into a unified codebase map
- Stores map in memory (namespace: `worker-map`)

**Output:**
```json
{
  "success": true,
  "totalChunks": 12,
  "completedChunks": 12,
  "failedChunks": 0,
  "aggregated": {
    "files": 47,
    "directories": 8,
    "structure": {
      "src/": ["agents/", "tools/", "workers/", "utils/"],
      "src/agents/": ["base-agent.ts", "swarm-agent.ts", ...],
      ...
    }
  },
  "durationMs": 8432
}
```

**Use Cases:**
- Understanding codebase structure
- Finding files by pattern
- Generating architecture diagrams
- Onboarding new developers

**Scaling:**
- <10 files: 2 agents
- 10-50 files: 4 agents
- >50 files: 8 agents

---

### Audit Worker

**Purpose:** Runs security and quality audits on code.

**Command:**
```bash
npm run worker:audit
```

**What it Does:**
- Scans for security vulnerabilities
- Checks code quality and maintainability
- Identifies dependency vulnerabilities
- Flags anti-patterns and code smells
- Generates detailed findings with severity levels

**Output:**
```json
{
  "success": true,
  "findings": [
    {
      "severity": "high",
      "type": "security",
      "file": "src/api/auth.ts",
      "line": 42,
      "issue": "Hardcoded API key in source code",
      "recommendation": "Move to environment variable"
    },
    {
      "severity": "medium",
      "type": "quality",
      "file": "src/utils/helpers.ts",
      "line": 15,
      "issue": "Function complexity too high (cyclomatic: 12)",
      "recommendation": "Refactor into smaller functions"
    }
  ],
  "summary": {
    "high": 1,
    "medium": 3,
    "low": 5
  }
}
```

**Use Cases:**
- Pre-commit security checks
- Code review automation
- Compliance auditing
- Refactoring prioritization

**Audit Types:**
- **Security**: Vulnerabilities, secrets, auth issues
- **Performance**: Bottlenecks, inefficiencies
- **Quality**: Maintainability, complexity, duplication
- **Dependencies**: Outdated packages, CVEs

---

### Optimize Worker

**Purpose:** Analyzes code for performance optimizations.

**Command:**
```bash
npm run worker:optimize
```

**What it Does:**
- Identifies performance bottlenecks
- Suggests algorithmic improvements
- Detects unnecessary re-renders (React/Vue)
- Analyzes bundle size and tree-shaking opportunities
- Recommends caching strategies

**Output:**
```json
{
  "success": true,
  "optimizations": [
    {
      "file": "src/components/DataTable.tsx",
      "line": 78,
      "issue": "Expensive calculation in render",
      "impact": "high",
      "suggestion": "Use useMemo to cache result",
      "estimatedImprovement": "60% render time reduction"
    },
    {
      "file": "src/api/client.ts",
      "line": 23,
      "issue": "Missing request caching",
      "impact": "medium",
      "suggestion": "Implement Redis cache layer",
      "estimatedImprovement": "80% latency reduction on repeated calls"
    }
  ],
  "summary": {
    "high": 2,
    "medium": 5,
    "low": 8
  }
}
```

**Use Cases:**
- Performance tuning
- Pre-deployment optimization
- User experience improvements
- Cost reduction (fewer server resources)

**Analysis Areas:**
- Algorithm complexity
- Memory usage
- Network requests
- Database queries
- Render performance

---

### TestGaps Worker

**Purpose:** Identifies missing test coverage.

**Command:**
```bash
npm run worker:testgaps
```

**What it Does:**
- Maps existing test files to source files
- Identifies untested functions/components
- Calculates coverage gaps
- Suggests test cases for uncovered code
- Prioritizes by criticality (public APIs, security)

**Output:**
```json
{
  "success": true,
  "gaps": [
    {
      "file": "src/api/users.ts",
      "function": "createUser",
      "coverage": "0%",
      "criticality": "high",
      "suggestedTests": [
        "Should create user with valid data",
        "Should reject invalid email format",
        "Should handle duplicate username error",
        "Should hash password before storage"
      ]
    },
    {
      "file": "src/utils/validators.ts",
      "function": "validatePhoneNumber",
      "coverage": "45%",
      "criticality": "medium",
      "suggestedTests": [
        "Should handle international formats",
        "Should reject invalid country codes"
      ]
    }
  ],
  "summary": {
    "totalFiles": 47,
    "testedFiles": 31,
    "coverage": "66%",
    "highPriorityGaps": 5
  }
}
```

**Use Cases:**
- Improving test coverage
- Pre-release quality checks
- Continuous integration gates
- Regression prevention

**Coverage Types:**
- Unit tests
- Integration tests
- E2E tests
- Edge cases

---

### Dynamic Scaling

All workers use the base class from `src/workers/base.ts` which implements dynamic scaling:

| Task Size | File Count | Agents Spawned | Rationale |
|-----------|------------|----------------|-----------|
| Small | < 5 files | 2 agents | Minimize overhead |
| Medium | 5-20 files | 4-6 agents | Proportional scaling |
| Large | > 20 files | 8 agents | Maximum parallelism |

**Scaling Algorithm:**

```typescript
if (taskSize < thresholds.small) {
  concurrency = minAgents; // 2
} else if (taskSize >= thresholds.medium) {
  concurrency = maxAgents; // 8
} else {
  // Linear interpolation for medium tasks
  ratio = (taskSize - small) / (medium - small);
  concurrency = minAgents + ratio * (maxAgents - minAgents);
}
```

**Example:**
- 3 files → 2 agents
- 12 files → 5 agents (mid-range scaling)
- 50 files → 8 agents

---

## 7. MCP Tools

The orchestrator exposes 32 LangChain tools that wrap Claude Flow MCP operations. These tools are organized into 5 categories.

### Swarm Management (6 tools)

#### `swarm_init`

**Purpose:** Initialize a new agent swarm.

**Parameters:**
```typescript
{
  topology?: "mesh" | "hierarchical" | "hierarchical-mesh" | "ring" | "star" | "adaptive" | "hybrid",
  maxAgents?: number, // 2-15, default: 8
  config?: Record<string, unknown> // Additional swarm config
}
```

**Example:**
```typescript
await tools.swarm_init({
  topology: "hierarchical-mesh",
  maxAgents: 10,
  config: { name: "api-builder-swarm" }
});
```

**Returns:**
```json
{
  "swarmId": "swarm-abc123",
  "topology": "hierarchical-mesh",
  "maxAgents": 10,
  "status": "initialized"
}
```

---

#### `swarm_status`

**Purpose:** Get health and metrics of a swarm.

**Parameters:**
```typescript
{
  swarmId?: string // Omit for all swarms
}
```

**Example:**
```typescript
await tools.swarm_status({ swarmId: "swarm-abc123" });
```

**Returns:**
```json
{
  "swarmId": "swarm-abc123",
  "health": 95,
  "activeAgents": 7,
  "maxAgents": 10,
  "tasksCompleted": 23,
  "tasksFailed": 1,
  "topology": "hierarchical-mesh",
  "uptime": 3600000
}
```

---

#### `swarm_monitor`

**Purpose:** Real-time monitoring stream for swarm activity.

**Parameters:**
```typescript
{
  swarmId: string,
  interval?: number // Polling interval in ms
}
```

---

#### `swarm_scale`

**Purpose:** Dynamically scale swarm size.

**Parameters:**
```typescript
{
  swarmId: string,
  targetAgents: number, // New agent count
  strategy?: "gradual" | "immediate"
}
```

**Example:**
```typescript
await tools.swarm_scale({
  swarmId: "swarm-abc123",
  targetAgents: 12,
  strategy: "gradual"
});
```

---

#### `swarm_destroy`

**Purpose:** Shutdown a swarm gracefully.

**Parameters:**
```typescript
{
  swarmId: string,
  graceful?: boolean // Wait for tasks to complete
}
```

---

#### `topology_optimize`

**Purpose:** Optimize swarm topology based on performance data.

**Parameters:**
```typescript
{
  swarmId: string
}
```

**Returns:**
```json
{
  "originalTopology": "hierarchical",
  "optimizedTopology": "hierarchical-mesh",
  "rationale": "Detected high peer communication, mesh improves throughput by 30%",
  "applied": true
}
```

---

### Agent Lifecycle (6 tools)

#### `agent_spawn`

**Purpose:** Spawn a new agent in a swarm.

**Parameters:**
```typescript
{
  agentType: "worker" | "coordinator" | "specialist",
  agentId?: string, // Auto-generated if omitted
  task: string, // Role description
  model?: "haiku" | "sonnet" | "opus",
  config?: Record<string, unknown>
}
```

**Example:**
```typescript
await tools.agent_spawn({
  agentType: "worker",
  agentId: "code-gen-1",
  task: "Generate TypeScript API endpoints",
  model: "sonnet",
  config: { swarmId: "swarm-abc123" }
});
```

---

#### `agent_list`

**Purpose:** List all agents in a swarm.

**Parameters:**
```typescript
{
  swarmId?: string, // Omit for all swarms
  status?: "active" | "idle" | "failed" | "terminated"
}
```

**Returns:**
```json
{
  "agents": [
    {
      "agentId": "code-gen-1",
      "type": "worker",
      "status": "active",
      "currentTask": "Generate POST /users endpoint",
      "uptime": 120000
    },
    ...
  ]
}
```

---

#### `agent_metrics`

**Purpose:** Get performance metrics for an agent.

**Parameters:**
```typescript
{
  agentId: string
}
```

**Returns:**
```json
{
  "agentId": "code-gen-1",
  "tasksCompleted": 5,
  "tasksFailed": 0,
  "averageTaskTime": 45000,
  "errorRate": 0.0,
  "utilization": 0.85
}
```

---

#### `agent_communicate`

**Purpose:** Send a message to a specific agent.

**Parameters:**
```typescript
{
  agentId: string,
  message: string
}
```

---

#### `agent_lifecycle`

**Purpose:** Manage agent state transitions.

**Parameters:**
```typescript
{
  agentId: string,
  action: "pause" | "resume" | "terminate" | "update",
  config?: Record<string, unknown>
}
```

---

#### `capability_match`

**Purpose:** Match task requirements to agent capabilities.

**Parameters:**
```typescript
{
  requirements: string[], // Task requirements
  swarmId?: string // Limit search to swarm
}
```

**Returns:**
```json
{
  "matches": [
    {
      "agentId": "code-gen-1",
      "score": 0.95,
      "capabilities": ["TypeScript", "REST API", "Testing"],
      "availability": "idle"
    }
  ]
}
```

---

### Task Orchestration (7 tools)

#### `task_orchestrate`

**Purpose:** Dispatch a complex task to the swarm.

**Parameters:**
```typescript
{
  task: string, // Full task description
  strategy: "parallel" | "sequential" | "pipeline" | "broadcast",
  agents?: string[], // Specific agents, or auto-select
  timeout?: number // Timeout in ms
}
```

**Example:**
```typescript
await tools.task_orchestrate({
  task: "Create CRUD endpoints for User resource at src/api/users.ts",
  strategy: "parallel",
  timeout: 300000
});
```

**Returns:**
```json
{
  "taskId": "task-xyz789",
  "status": "dispatched",
  "assignedAgents": ["code-gen-1", "code-gen-2"],
  "estimatedCompletion": 180000
}
```

---

#### `task_status`

**Purpose:** Check status of a task.

**Parameters:**
```typescript
{
  taskId: string
}
```

**Returns:**
```json
{
  "taskId": "task-xyz789",
  "status": "in_progress",
  "progress": 0.67,
  "assignedAgents": ["code-gen-1", "code-gen-2"],
  "startedAt": 1707123456000,
  "estimatedCompletion": 1707123636000
}
```

---

#### `task_results`

**Purpose:** Retrieve results from a completed task.

**Parameters:**
```typescript
{
  taskId: string
}
```

**Returns:**
```json
{
  "taskId": "task-xyz789",
  "status": "completed",
  "results": {
    "filesCreated": ["src/api/users.ts", "src/api/users.test.ts"],
    "summary": "Created 4 CRUD endpoints with full test coverage"
  },
  "durationMs": 178432
}
```

---

#### `parallel_execute`

**Purpose:** Execute multiple independent tasks in parallel.

**Parameters:**
```typescript
{
  tasks: Array<{
    description: string,
    agentId?: string
  }>
}
```

---

#### `load_balance`

**Purpose:** Distribute work evenly across agents.

**Parameters:**
```typescript
{
  tasks: string[],
  swarmId?: string
}
```

---

#### `coordination_sync`

**Purpose:** Synchronize state across all agents in a swarm.

**Parameters:**
```typescript
{
  swarmId: string
}
```

---

#### `consensus_vote`

**Purpose:** Trigger a consensus vote on a decision.

**Parameters:**
```typescript
{
  swarmId: string,
  proposal: string,
  mechanism?: "raft" | "byzantine" | "gossip" | "quorum" | "crdt"
}
```

**Returns:**
```json
{
  "proposal": "Should we refactor auth module?",
  "result": "approved",
  "votes": {
    "approve": 7,
    "reject": 1,
    "abstain": 0
  },
  "mechanism": "quorum"
}
```

---

### Memory & Persistence (7 tools)

#### `memory_store`

**Purpose:** Store data in persistent memory.

**Parameters:**
```typescript
{
  namespace: string, // e.g., "tasks", "progress", "decisions"
  key: string,
  value: string, // JSON stringified
  tags?: string[] // For filtering
}
```

**Example:**
```typescript
await tools.memory_store({
  namespace: "tasks",
  key: "task-graph-2024-02-05",
  value: JSON.stringify({ nodes: [...], edges: [...] }),
  tags: ["task-graph", "active"]
});
```

---

#### `memory_retrieve`

**Purpose:** Retrieve data from memory by key.

**Parameters:**
```typescript
{
  namespace: string,
  key: string
}
```

**Returns:**
```json
{
  "namespace": "tasks",
  "key": "task-graph-2024-02-05",
  "value": "{\"nodes\":[...],\"edges\":[...]}",
  "tags": ["task-graph", "active"],
  "timestamp": 1707123456000
}
```

---

#### `memory_search`

**Purpose:** Semantic search across memory using HNSW.

**Parameters:**
```typescript
{
  query: string, // Natural language query
  namespace?: string, // Limit to namespace
  limit?: number, // Max results (default: 5)
  tags?: string[] // Filter by tags
}
```

**Example:**
```typescript
await tools.memory_search({
  query: "What were the reasons for choosing hierarchical topology?",
  namespace: "decisions",
  limit: 3
});
```

**Returns:**
```json
{
  "results": [
    {
      "key": "decision-topology-2024-02-04",
      "value": "Chose hierarchical for tight control...",
      "score": 0.92,
      "namespace": "decisions"
    }
  ]
}
```

---

#### `memory_list`

**Purpose:** List all keys in a namespace.

**Parameters:**
```typescript
{
  namespace: string,
  tags?: string[]
}
```

---

#### `memory_delete`

**Purpose:** Delete data from memory.

**Parameters:**
```typescript
{
  namespace: string,
  key: string
}
```

---

#### `state_snapshot`

**Purpose:** Take a snapshot of current system state.

**Parameters:**
```typescript
{
  snapshotId?: string, // Auto-generated if omitted
  include?: string[] // Specific namespaces to snapshot
}
```

**Returns:**
```json
{
  "snapshotId": "snapshot-abc123",
  "timestamp": 1707123456000,
  "namespaces": ["tasks", "progress", "swarms", "agents"],
  "size": 1024000
}
```

---

#### `context_restore`

**Purpose:** Restore system state from a snapshot.

**Parameters:**
```typescript
{
  snapshotId: string
}
```

---

### Workflows & Health (6 tools)

#### `workflow_execute`

**Purpose:** Execute a pre-defined workflow.

**Parameters:**
```typescript
{
  workflowId: string,
  inputs?: Record<string, unknown>
}
```

---

#### `workflow_create`

**Purpose:** Define a new reusable workflow.

**Parameters:**
```typescript
{
  workflowId: string,
  steps: Array<{
    action: string,
    params: Record<string, unknown>
  }>
}
```

---

#### `performance_report`

**Purpose:** Generate performance metrics report.

**Parameters:**
```typescript
{
  swarmId?: string, // Omit for all swarms
  timeRange?: number // Last N ms
}
```

**Returns:**
```json
{
  "period": "last 1 hour",
  "tasksCompleted": 45,
  "tasksFailed": 2,
  "averageTaskTime": 67000,
  "agentUtilization": 0.78,
  "throughput": 0.75 // tasks per minute
}
```

---

#### `bottleneck_analyze`

**Purpose:** Identify performance bottlenecks.

**Parameters:**
```typescript
{
  swarmId: string
}
```

**Returns:**
```json
{
  "bottlenecks": [
    {
      "type": "agent_saturation",
      "severity": "high",
      "description": "3 agents at 100% utilization, 5 idle",
      "recommendation": "Redistribute tasks or scale down idle agents"
    }
  ]
}
```

---

#### `health_check`

**Purpose:** Comprehensive health check.

**Parameters:**
```typescript
{
  swarmId?: string // Omit for all swarms
}
```

**Returns:**
```json
{
  "overall": "healthy",
  "swarms": [
    {
      "swarmId": "swarm-abc123",
      "health": 95,
      "issues": []
    }
  ],
  "memory": {
    "usage": 0.67,
    "pressure": "normal"
  },
  "timestamp": 1707123456000
}
```

---

#### `fault_tolerance`

**Purpose:** Provide failure feedback and trigger adaptation.

**Parameters:**
```typescript
{
  failureType: "agent" | "task" | "swarm",
  failureId: string,
  context?: string
}
```

**Returns:**
```json
{
  "failureType": "agent",
  "failureId": "code-gen-1",
  "adaptation": "spawned_replacement",
  "newAgentId": "code-gen-1-replacement",
  "taskReassigned": true
}
```

---

## 8. SDK Tools

SDK tools provide a hybrid architecture where the orchestrator delegates complex tasks to the Claude Agent SDK for execution. These tools use Claude's native tools (Read, Write, Edit, Bash) with iterative refinement.

### `sdk_execute_task`

**Purpose:** Execute a complex task with iterative refinement and quality evaluation.

**Parameters:**
```typescript
{
  taskType: "feature" | "bugfix" | "research" | "refactor" | "documentation" | "testing" | "security" | "performance",
  description: string, // Detailed task description
  requirements?: string[], // Acceptance criteria
  targetPath?: string // Must be within project root
}
```

**Example:**
```typescript
await tools.sdk_execute_task({
  taskType: "feature",
  description: "Implement user authentication with JWT tokens",
  requirements: [
    "Support login and registration",
    "Store tokens securely",
    "Include refresh token logic",
    "Add middleware for protected routes"
  ],
  targetPath: "src/auth/"
});
```

**What Happens:**
1. Task delegated to Agent SDK coordinator
2. Coordinator spawns specialized agent (Task Agent)
3. Agent executes with Claude's native tools
4. Evaluator assesses quality (0-1 score)
5. If quality < threshold (0.8), iteratively refines (max 3 iterations)
6. Returns final result with quality metrics

**Returns:**
```json
{
  "success": true,
  "taskId": "sdk-task-123",
  "result": {
    "filesCreated": ["src/auth/jwt.ts", "src/auth/middleware.ts"],
    "summary": "Implemented JWT auth with refresh tokens"
  },
  "quality": 0.92,
  "iterations": 2,
  "durationMs": 145000
}
```

**Use Cases:**
- Complex code generation
- Multi-step refactorings
- Tasks requiring quality thresholds
- Historical pattern learning

---

### `sdk_code_task`

**Purpose:** Execute code-specific tasks (generate, modify, fix, document, test).

**Parameters:**
```typescript
{
  action: "generate" | "modify" | "fix" | "document" | "test",
  targetPath: string, // File or directory
  description: string, // What to do
  context?: string // Additional context
}
```

**Example:**
```typescript
await tools.sdk_code_task({
  action: "generate",
  targetPath: "src/api/products.ts",
  description: "Create CRUD endpoints for Product resource",
  context: "Product has fields: id, name, price, category"
});
```

**Returns:**
```json
{
  "success": true,
  "filesModified": ["src/api/products.ts"],
  "summary": "Generated 4 CRUD endpoints with validation",
  "quality": 0.88
}
```

**Action Types:**

| Action | Purpose | Example |
|--------|---------|---------|
| `generate` | Create new code | "Generate Express router for products" |
| `modify` | Update existing code | "Add pagination to getProducts endpoint" |
| `fix` | Fix bugs | "Fix null pointer error in updateProduct" |
| `document` | Add documentation | "Add JSDoc comments to all functions" |
| `test` | Write tests | "Write unit tests for products API" |

---

### `sdk_audit_task`

**Purpose:** Run audits with swarm-based worker agents.

**Parameters:**
```typescript
{
  auditType: "security" | "performance" | "quality" | "dependencies",
  targetPath?: string, // Defaults to project root
  scope?: "full" | "quick" | "critical-only"
}
```

**Example:**
```typescript
await tools.sdk_audit_task({
  auditType: "security",
  targetPath: "src/",
  scope: "full"
});
```

**Returns:**
```json
{
  "success": true,
  "findings": [
    {
      "severity": "high",
      "type": "security",
      "file": "src/api/auth.ts",
      "line": 42,
      "issue": "Hardcoded API key",
      "recommendation": "Use environment variable"
    }
  ],
  "summary": {
    "high": 1,
    "medium": 3,
    "low": 7
  },
  "workerAudit": {
    "totalChunks": 8,
    "completedChunks": 8,
    "agentsUsed": 4
  }
}
```

**Audit Types:**

| Type | Checks | Output |
|------|--------|--------|
| `security` | Vulnerabilities, secrets, auth | Severity-ranked findings |
| `performance` | Bottlenecks, inefficiencies | Performance improvements |
| `quality` | Complexity, duplication | Maintainability issues |
| `dependencies` | Outdated packages, CVEs | Dependency vulnerabilities |

---

### `sdk_run_worker`

**Purpose:** Run specialized swarm workers (map, audit, optimize, testgaps).

**Parameters:**
```typescript
{
  workerType: "map" | "audit" | "optimize" | "testgaps",
  targetPath?: string // Defaults to project root
}
```

**Example:**
```typescript
await tools.sdk_run_worker({
  workerType: "testgaps",
  targetPath: "src/"
});
```

**Returns:**
```json
{
  "success": true,
  "totalChunks": 15,
  "completedChunks": 15,
  "agentsUsed": 6,
  "results": [
    {
      "file": "src/api/users.ts",
      "function": "createUser",
      "coverage": "0%",
      "suggestedTests": ["Should create user", "Should reject invalid email"]
    }
  ],
  "summary": {
    "totalFiles": 47,
    "testedFiles": 31,
    "coverage": "66%"
  }
}
```

**Worker Scaling:**
- Small tasks (<5 files): 2 agents
- Medium tasks (5-20 files): 4-6 agents
- Large tasks (>20 files): 8 agents

---

### `sdk_get_metrics`

**Purpose:** Get Agent SDK coordinator metrics.

**Parameters:** None

**Returns:**
```json
{
  "success": true,
  "metrics": {
    "totalTasks": 127,
    "successRate": 0.95,
    "averageQuality": 0.87,
    "averageIterations": 1.8,
    "patternsLearned": 23
  }
}
```

**Use Cases:**
- Monitor SDK performance
- Track quality trends
- Evaluate learning effectiveness

---

## 9. Configuration

### Environment Variables

Swarm Orchestrato supports multiple LLM providers and configuration options via `.env`.

#### Provider Selection

```env
# Primary provider
LLM_PROVIDER=anthropic

# Fallback provider (if primary fails)
LLM_FALLBACK_PROVIDER=openrouter
```

**Supported Providers:**
- `anthropic` (default, recommended)
- `zai` (free tier available)
- `openrouter` (200+ models)
- `openai` (or any OpenAI-compatible endpoint)

---

#### Anthropic Configuration

```env
# Use ONE of the following:

# Option 1: Static API key
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Option 2: OAuth bearer token (takes precedence)
ANTHROPIC_AUTH_TOKEN=your-oauth-token
```

**Default Model:** `claude-opus-4-5-20251101`

---

#### z.ai Configuration

```env
LLM_PROVIDER=zai
ZAI_API_KEY=your-zai-key
ZAI_BASE_URL=https://api.z.ai/v1
ZAI_MODEL=glm-4.7
```

**Features:**
- Free tier available
- OpenAI-compatible API
- Lower latency for some regions

---

#### OpenRouter Configuration

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=anthropic/claude-sonnet-4
```

**Features:**
- Access to 200+ models
- Pay-per-use pricing
- Automatic fallback across models

---

#### OpenAI Configuration

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your-openai-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

**Compatible Endpoints:**
- OpenAI (GPT-4, GPT-4o)
- Azure OpenAI
- Any OpenAI-compatible API

---

#### Claude Flow MCP Configuration

```env
CLAUDE_FLOW_MODE=v3
CLAUDE_FLOW_TOPOLOGY=hierarchical-mesh
CLAUDE_FLOW_MAX_AGENTS=15
CLAUDE_FLOW_MEMORY_BACKEND=hybrid
```

| Variable | Options | Default | Description |
|----------|---------|---------|-------------|
| `CLAUDE_FLOW_MODE` | `v3` | `v3` | MCP server version |
| `CLAUDE_FLOW_TOPOLOGY` | See topologies | `hierarchical-mesh` | Default swarm topology |
| `CLAUDE_FLOW_MAX_AGENTS` | `2-15` | `15` | Max agents per swarm |
| `CLAUDE_FLOW_MEMORY_BACKEND` | `hybrid`, `sqlite`, `hnsw` | `hybrid` | Memory storage type |

---

### Project Binding

The orchestrator enforces strict project boundaries to prevent cross-project operations.

#### Bind to Current Directory

```bash
# Default: binds to cwd
npm start
```

#### Bind to Specific Project

```bash
# Via environment variable
ORCHESTRATOR_PROJECT_ROOT=/path/to/my-project npm start

# Or export for session
export ORCHESTRATOR_PROJECT_ROOT=/path/to/my-project
npm start
```

#### Programmatic Configuration

```typescript
import { createOrchestrator } from "./src/lib.js";

const { agent, projectRoot } = await createOrchestrator({
  projectRoot: "/home/user/my-project", // REQUIRED
  provider: "anthropic",
  workDir: "./orchestrator-workspace"
});

console.log(`Bound to: ${projectRoot}`);
```

**Validation Rules:**
1. `projectRoot` is **mandatory** — orchestrator will not start without it
2. All task paths are validated before dispatch
3. Tasks referencing external paths return `SCOPE_VIOLATION` errors
4. Project context is injected into all dispatched tasks

---

### Provider Setup

#### Anthropic (Recommended)

1. **Get API Key:**
   - Sign up at https://console.anthropic.com/
   - Navigate to API Keys
   - Create a new key

2. **Add to `.env`:**
   ```env
   LLM_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```

3. **Benefits:**
   - Native Claude Agent SDK support
   - Best performance for code tasks
   - Direct access to Claude Opus/Sonnet

---

#### z.ai (Free Tier)

1. **Get API Key:**
   - Sign up at https://z.ai/
   - Free tier includes generous usage

2. **Add to `.env`:**
   ```env
   LLM_PROVIDER=zai
   ZAI_API_KEY=your-zai-key
   ZAI_BASE_URL=https://api.z.ai/v1
   ZAI_MODEL=glm-4.7
   ```

3. **Benefits:**
   - Free tier available
   - No credit card required
   - Good for testing/development

---

#### OpenRouter (200+ Models)

1. **Get API Key:**
   - Sign up at https://openrouter.ai/
   - Add credits or use free tier

2. **Add to `.env`:**
   ```env
   LLM_PROVIDER=openrouter
   OPENROUTER_API_KEY=your-openrouter-key
   OPENROUTER_MODEL=anthropic/claude-sonnet-4
   ```

3. **Benefits:**
   - Access to many providers
   - Automatic fallback
   - Pay-per-use pricing

---

### Workspace Configuration

```bash
# Custom workspace directory
ORCHESTRATOR_WORKDIR=./my-workspace npm start
```

**Workspace Contents:**
- `checkpoints.db` — SQLite conversation checkpoints
- `agent-files/` — Agent SDK filesystem backend
- `logs/` — Execution logs

**Cleanup:**
```bash
# Remove workspace to start fresh
rm -rf ./orchestrator-workspace
```

---

## 10. Usage Patterns

### Common Workflows

#### Pattern 1: Full-Stack Feature Development

**Goal:** Build a complete feature (API + UI + tests)

```bash
npm start
```

```
mission> Build a user profile management feature with:
- API endpoints (GET/PUT /profile)
- React component for profile editing
- Form validation
- Unit and integration tests
```

**Orchestrator Flow:**

1. **ORIENT:**
   - Check existing auth implementation
   - Review project structure (src/api/, src/components/)

2. **PLAN:**
   ```
   ✓ Create API endpoint: GET /profile
   ✓ Create API endpoint: PUT /profile
   ✓ Create React ProfileEdit component
   ✓ Add form validation logic
   ✓ Write API integration tests
   ✓ Write component unit tests
   ```

3. **DISPATCH:**
   - Spawn swarm (hierarchical, 6 agents)
   - Parallel execution: API endpoints + React component
   - Sequential: Tests after implementation

4. **TRACK:**
   - Monitor task completion
   - Validate acceptance criteria

5. **ADAPT:**
   - If tests fail, re-dispatch with fixes

**Result:**
```
✓ src/api/profile.ts (GET/PUT endpoints)
✓ src/components/ProfileEdit.tsx (React component)
✓ src/validation/profile.ts (validation logic)
✓ src/api/profile.test.ts (API tests)
✓ src/components/ProfileEdit.test.tsx (component tests)

All acceptance criteria met. Feature complete!
```

---

#### Pattern 2: Code Quality Audit

**Goal:** Run comprehensive quality audit

```bash
npm start
```

```
mission> Run a full security, performance, and quality audit on src/
```

**Orchestrator Flow:**

1. **ORIENT:**
   - Check project size (47 files)

2. **PLAN:**
   ```
   ✓ Run security audit
   ✓ Run performance audit
   ✓ Run quality audit
   ✓ Aggregate findings
   ✓ Prioritize by severity
   ```

3. **DISPATCH:**
   - Use `sdk_run_worker` with `audit` worker
   - Spawn 6 agents (medium-sized codebase)
   - Chunk files by directory

4. **TRACK:**
   - Monitor chunk completion (15/15)
   - Aggregate results

5. **ADAPT:**
   - Store findings in memory (namespace: `workers`)

**Result:**
```json
{
  "security": {
    "high": 2,
    "medium": 5,
    "low": 12
  },
  "performance": {
    "high": 1,
    "medium": 8,
    "low": 15
  },
  "quality": {
    "high": 0,
    "medium": 11,
    "low": 23
  },
  "recommendations": [
    "Fix hardcoded API key in src/api/auth.ts",
    "Optimize DataTable render performance",
    "Reduce cyclomatic complexity in src/utils/helpers.ts"
  ]
}
```

---

#### Pattern 3: Continuous Background Monitoring

**Goal:** Keep workers running continuously

```bash
# Start daemon
npm run daemon
```

**Daemon Configuration:**

```typescript
// Workers run on schedule:
{
  "map": "every 6 hours",      // Update codebase map
  "audit": "every 24 hours",   // Daily security audit
  "optimize": "every 12 hours", // Twice-daily optimization check
  "testgaps": "every 24 hours" // Daily test coverage check
}
```

**Benefits:**
- Always-fresh codebase map
- Early vulnerability detection
- Proactive optimization suggestions
- Continuous test coverage monitoring

**Check Status:**
```bash
npm run daemon:status
```

**Output:**
```
Daemon Status: RUNNING
Uptime: 3 days, 7 hours

Worker Schedule:
- map: Last run 2h ago, next in 4h
- audit: Last run 18h ago, next in 6h
- optimize: Last run 8h ago, next in 4h
- testgaps: Last run 20h ago, next in 4h

Results stored in: .claude-flow/daemon-state.json
```

---

### Best Practices

#### 1. Start with Clear Acceptance Criteria

**❌ Bad:**
```
mission> Make the app better
```

**✅ Good:**
```
mission> Improve API response time by:
- Adding Redis caching layer
- Optimizing database queries
- Implementing pagination on /users endpoint
Target: <100ms average response time
```

---

#### 2. Leverage Project Scoping

**❌ Bad:**
```
mission> Analyze files in /home/user/other-project
```

**✅ Good:**
```
# Ensure project is bound correctly
ORCHESTRATOR_PROJECT_ROOT=/home/user/my-project npm start

mission> Analyze all TypeScript files in src/
```

---

#### 3. Use Subagents for Specialized Tasks

**❌ Bad:**
```
mission> [Orchestrator tries to design topology AND dispatch tasks simultaneously]
```

**✅ Good:**
```
mission> Design optimal swarm for processing 100-file security audit

Orchestrator → swarm_architect:
  "Design swarm for security audit, 100 files, high criticality"

swarm_architect responds with design

Orchestrator → swarm_init:
  Apply recommended design

Orchestrator → task_dispatcher:
  "Decompose security audit into subtasks"
```

---

#### 4. Monitor and Adapt

```
mission> Build feature X

[After 5 minutes]
mission> Status check

Orchestrator → progress_tracker:
  "Provide status update"

[If drift detected]
Orchestrator → recovery_coordinator:
  "Handle drifted task"
```

---

#### 5. Take Snapshots Before Risky Operations

```
mission> Refactor entire auth module

Orchestrator:
  1. Taking state snapshot... ✓ snapshot-abc123
  2. Initializing swarm... ✓
  3. Dispatching refactor tasks... ✓

[If something fails]
Orchestrator → recovery_coordinator:
  "Restore from snapshot-abc123"
```

---

### Anti-Patterns

#### ❌ Anti-Pattern 1: Vague Goals

```
mission> Fix the bugs
```

**Problem:** No specific acceptance criteria, impossible to validate completion.

**Solution:**
```
mission> Fix the authentication bug where logout doesn't clear session cookie
Acceptance: After logout, GET /profile returns 401
```

---

#### ❌ Anti-Pattern 2: Cross-Project Operations

```
mission> Copy config from /home/user/project-A to /home/user/project-B
```

**Problem:** Violates project boundary, will return `SCOPE_VIOLATION`.

**Solution:** Run orchestrator separately for each project, or manually copy config first.

---

#### ❌ Anti-Pattern 3: Micromanaging Agents

```
mission> Spawn agent code-gen-1, assign it to write line 42 of file X
```

**Problem:** Defeats purpose of orchestration — orchestrator should coordinate, not micromanage.

**Solution:**
```
mission> Implement user login endpoint at src/api/auth.ts
```

Let the orchestrator decompose and dispatch.

---

#### ❌ Anti-Pattern 4: Ignoring Failures

```
mission> Build feature X

[Task fails]

mission> Build feature Y (without addressing failure)
```

**Problem:** Failures often indicate systemic issues that will cascade.

**Solution:**
```
mission> Build feature X

[Task fails]

mission> Why did the last task fail?

Orchestrator → progress_tracker:
  Retrieves failure context

Orchestrator → recovery_coordinator:
  Addresses root cause

mission> Retry feature X
```

---

## 11. Troubleshooting

### Common Issues

#### Issue 1: Orchestrator Won't Start

**Symptom:**
```
Error: projectRoot is required
```

**Cause:** Missing project binding.

**Solution:**
```bash
# Set project root explicitly
ORCHESTRATOR_PROJECT_ROOT=/path/to/project npm start

# Or in .env
echo "ORCHESTRATOR_PROJECT_ROOT=/path/to/project" >> .env
```

---

#### Issue 2: Tasks Timeout

**Symptom:**
```
Task task-xyz789 timed out after 120000ms
```

**Cause:** Task too complex for default timeout.

**Solution:**
```typescript
await tools.task_orchestrate({
  task: "Complex long-running task",
  strategy: "parallel",
  timeout: 600000 // Increase to 10 minutes
});
```

Or break task into smaller subtasks:
```
mission> Delegate to task_dispatcher to decompose this into smaller chunks
```

---

#### Issue 3: Scope Violation Errors

**Symptom:**
```json
{
  "error": "SCOPE_VIOLATION",
  "invalidPaths": ["/home/user/other-project/file.ts"]
}
```

**Cause:** Task references files outside project boundary.

**Solution:**
1. Verify project root: `echo $ORCHESTRATOR_PROJECT_ROOT`
2. Ensure all paths are relative to project root
3. If intentional, restart orchestrator bound to parent directory

---

#### Issue 4: Agent Failures

**Symptom:**
```
Agent code-gen-1 failed with error: TIMEOUT
```

**Cause:** Agent unresponsive or overloaded.

**Solution:**

Orchestrator should automatically handle this via `recovery_coordinator`:
```
1. Detect failure (agent_health)
2. Terminate unresponsive agent
3. Spawn replacement
4. Re-dispatch task
```

If not automatic:
```
mission> Delegate to recovery_coordinator to handle agent code-gen-1 failure
```

---

#### Issue 5: Low Quality Results

**Symptom:**
```json
{
  "quality": 0.42,
  "iterations": 3
}
```

**Cause:** Task description too vague or requirements unclear.

**Solution:**
1. Add more specific requirements
2. Provide examples or context
3. Use `sdk_execute_task` with stricter acceptance criteria

**Before:**
```typescript
await tools.sdk_execute_task({
  taskType: "feature",
  description: "Add search functionality"
});
```

**After:**
```typescript
await tools.sdk_execute_task({
  taskType: "feature",
  description: "Add full-text search to products table",
  requirements: [
    "Support fuzzy matching on product name and description",
    "Return results sorted by relevance",
    "Include pagination (10 results per page)",
    "Response time < 200ms for 10k products",
    "Add comprehensive unit tests"
  ],
  targetPath: "src/api/search.ts"
});
```

---

#### Issue 6: Memory Pressure

**Symptom:**
```json
{
  "memory": {
    "usage": 0.94,
    "pressure": "high"
  }
}
```

**Cause:** Too much data stored in memory.

**Solution:**
```bash
# Clean up old memory entries
mission> Delete old entries from memory namespaces older than 7 days

# Or manually
await tools.memory_delete({ namespace: "tasks", key: "old-task-graph" });
```

Configure memory retention in Claude Flow MCP.

---

### Debugging Tips

#### Enable Verbose Logging

```bash
DEBUG=swarm:* npm start
```

**Output:**
```
swarm:orchestrator ORIENT phase starting...
swarm:orchestrator Querying swarm status...
swarm:mcp-client Calling tool: swarm_status
swarm:mcp-client Response: {"health": 95, ...}
```

---

#### Check MCP Server Connection

```bash
# Test MCP server manually
npx @modelcontextprotocol/inspector
```

Verify Claude Flow tools are available:
```
Available tools:
- swarm_init
- swarm_status
- agent_spawn
...
```

---

#### Inspect Checkpoints

```bash
# Open checkpoint database
sqlite3 orchestrator-workspace/checkpoints.db

sqlite> SELECT * FROM checkpoints ORDER BY checkpoint_id DESC LIMIT 1;
```

View conversation history and state.

---

#### Review Worker Results

```bash
# Check worker output
cat .claude-flow/daemon-state.json

# Or via memory
mission> Retrieve latest worker results from memory

Orchestrator:
await tools.memory_retrieve({
  namespace: "workers",
  key: "audit-latest"
});
```

---

#### Monitor Agent Metrics

```
mission> Get metrics for all agents

Orchestrator:
await tools.agent_list({ status: "active" });
await tools.agent_metrics({ agentId: "code-gen-1" });
```

**Output:**
```json
{
  "agentId": "code-gen-1",
  "tasksCompleted": 12,
  "tasksFailed": 1,
  "errorRate": 0.08,
  "utilization": 0.92
}
```

High error rate or low utilization indicates issues.

---

## 12. Advanced Features

### Dynamic Scaling

Workers automatically scale agent count based on task size using the base worker class.

**Scaling Configuration:**

```typescript
const worker = await createSwarmWorker({
  name: "custom-worker",
  scaling: {
    enabled: true,
    minAgents: 2,
    maxAgents: 10,
    thresholds: {
      small: 5,   // < 5 items: use minAgents
      medium: 30  // >= 30 items: use maxAgents
    }
  }
});
```

**Scaling Algorithm:**

- **Small tasks** (<5 items): 2 agents
- **Medium tasks** (5-30 items): Linear interpolation
- **Large tasks** (≥30 items): 10 agents

**Example:**
```typescript
// 3 files → 2 agents
// 15 files → 5 agents (mid-range)
// 50 files → 10 agents
```

**Benefits:**
- Efficient resource usage for small tasks
- Maximum parallelism for large codebases
- Cost optimization (fewer agents = lower API costs)

---

### Topology Optimization

Claude Flow can dynamically optimize swarm topology based on runtime performance.

**Trigger Optimization:**

```typescript
await tools.topology_optimize({ swarmId: "swarm-abc123" });
```

**What It Does:**

1. Analyzes communication patterns
2. Detects bottlenecks (e.g., queen overload)
3. Recommends topology change
4. Optionally applies optimization

**Example Scenario:**

**Before:**
- Topology: `hierarchical`
- Queen handling 100% of coordination
- Bottleneck detected: Queen saturated

**After Optimization:**
- Topology: `hierarchical-mesh`
- Queen handles high-level coordination
- Agents communicate peer-to-peer for subtasks
- Throughput increased 30%

**Auto-Optimization:**

Enable in orchestrator system prompt:
```
If swarm throughput < 50% expected, run topology_optimize
```

---

### Fault Tolerance

Swarm Orchestrato includes multiple layers of fault tolerance:

#### 1. Agent-Level Fault Tolerance

**Mechanism:** `fault_tolerance` tool

**Triggers:**
- Agent timeout (>120s no response)
- Agent error rate >20%
- Agent crash

**Actions:**
1. Terminate failed agent
2. Spawn replacement
3. Re-dispatch task to new agent
4. Store failure context in memory

**Example:**
```typescript
await tools.fault_tolerance({
  failureType: "agent",
  failureId: "code-gen-1",
  context: "Timeout on task task-xyz789"
});
```

**Response:**
```json
{
  "adaptation": "spawned_replacement",
  "newAgentId": "code-gen-1-replacement",
  "taskReassigned": true
}
```

---

#### 2. Task-Level Fault Tolerance

**Mechanism:** Retry with exponential backoff

**Triggers:**
- Task failure (non-terminal error)
- Transient network issues
- API rate limits

**Actions:**
1. Wait (delay: 2^retryCount seconds)
2. Re-dispatch task
3. If 3 failures: escalate to recovery_coordinator

---

#### 3. Swarm-Level Fault Tolerance

**Mechanism:** Byzantine consensus (if configured)

**Triggers:**
- Conflicting agent outputs
- Adversarial conditions

**Actions:**
1. Collect votes from all agents
2. Detect Byzantine agents (malicious or buggy)
3. Exclude Byzantine agents from consensus
4. Re-execute with trusted agents

**Enable Byzantine Consensus:**
```typescript
await tools.swarm_init({
  topology: "mesh",
  maxAgents: 10,
  config: {
    consensus: "byzantine",
    faultTolerance: 0.33 // Tolerate up to 33% Byzantine agents
  }
});
```

---

#### 4. State Snapshots & Recovery

**Mechanism:** `state_snapshot` + `context_restore`

**Usage:**

```typescript
// Before risky operation
const snapshot = await tools.state_snapshot({
  include: ["tasks", "progress", "swarms"]
});

// ... risky operation ...

// If failure, restore
await tools.context_restore({
  snapshotId: snapshot.snapshotId
});
```

**What's Saved:**
- All memory namespaces (tasks, progress, decisions, etc.)
- Swarm configurations
- Agent states
- Task graphs

---

### Memory Namespaces

Swarm Orchestrato organizes persistent state across 8 namespaces:

| Namespace | Purpose | Example Keys |
|-----------|---------|--------------|
| `tasks` | Task definitions, dependencies | `task-graph-2024-02-05`, `task:task-xyz789` |
| `progress` | Completion status, timelines | `summary:latest`, `task:task-xyz789:progress` |
| `decisions` | Architecture/strategy decisions | `decision-topology-2024-02-04` |
| `patterns` | Learned patterns | `pattern:auth-implementation`, `pattern:api-design` |
| `failures` | Failure logs | `failure:agent-timeout-20240205` |
| `recovery` | Recovery actions | `recovery:snapshot-abc123` |
| `context` | Project context, goals | `project:goals`, `acceptance-criteria` |
| `workers` | Worker results | `map-latest`, `audit-20240205` |

**Example: Store Decision**

```typescript
await tools.memory_store({
  namespace: "decisions",
  key: "decision-auth-method-2024-02-05",
  value: JSON.stringify({
    decision: "Use JWT tokens for auth",
    rationale: "Stateless, scalable, standard-compliant",
    alternatives: ["Sessions (rejected: not stateless)", "OAuth (rejected: overkill)"],
    date: "2024-02-05"
  }),
  tags: ["auth", "architecture"]
});
```

**Example: Search Decisions**

```typescript
await tools.memory_search({
  query: "Why did we choose JWT for authentication?",
  namespace: "decisions",
  limit: 3
});
```

**Response:**
```json
{
  "results": [
    {
      "key": "decision-auth-method-2024-02-05",
      "value": "{\"decision\":\"Use JWT tokens for auth\",...}",
      "score": 0.95
    }
  ]
}
```

**Benefits:**
- **Long-term context**: Decisions persist across sessions
- **Learning**: Patterns are reused for similar tasks
- **Debugging**: Failure logs help identify recurring issues
- **Accountability**: Full audit trail of decisions

---

### Consensus Mechanisms

When multiple agents work on the same task, consensus mechanisms ensure agreement.

#### Raft (Leader-Based)

**Best For:** Coding, development swarms

**How It Works:**
1. Queen (leader) proposes solution
2. Workers validate
3. Majority approval required

**Pros:**
- Fast decision-making
- Clear authority
- Anti-drift

**Cons:**
- Single point of failure (queen)
- Less diverse outputs

---

#### Byzantine (Fault-Tolerant)

**Best For:** Security, adversarial contexts

**How It Works:**
1. All agents submit solutions
2. Detect outliers (Byzantine agents)
3. Exclude Byzantine agents
4. Consensus among honest agents

**Pros:**
- Tolerates malicious/buggy agents
- High reliability

**Cons:**
- Slower (requires multiple rounds)
- More expensive (more agents needed)

**Formula:** Tolerate `f` Byzantine agents requires `3f + 1` total agents.

---

#### Gossip (Eventually Consistent)

**Best For:** Research, large-scale analysis

**How It Works:**
1. Agents exchange partial results
2. Gradually converge on consensus
3. No central coordinator

**Pros:**
- Scales to large swarms
- Fault-tolerant
- Decentralized

**Cons:**
- Slower convergence
- Eventual (not immediate) consistency

---

#### Quorum (Configurable Majority)

**Best For:** Voting, approvals

**How It Works:**
1. All agents vote
2. Require configurable majority (e.g., 2/3)
3. Majority vote wins

**Pros:**
- Flexible (adjust quorum size)
- Democratic

**Cons:**
- Can deadlock if no majority

---

#### CRDT (Conflict-Free)

**Best For:** Distributed state merging

**How It Works:**
1. Agents modify state independently
2. Merge operations are commutative
3. No conflicts, automatic convergence

**Pros:**
- No coordination overhead
- Always converges
- Highly available

**Cons:**
- Complex data structures required
- Not suitable for all tasks

---

**Selecting Consensus Mechanism:**

```typescript
await tools.swarm_init({
  topology: "mesh",
  maxAgents: 10,
  config: {
    consensus: "quorum", // raft | byzantine | gossip | quorum | crdt
    quorumSize: 0.67 // For quorum: require 67% agreement
  }
});
```

Or delegate to swarm_architect:
```
mission> Design swarm with Byzantine fault tolerance for security audit

Orchestrator → swarm_architect:
  "Design swarm, Byzantine consensus, security context"

swarm_architect:
  Recommended: 10 agents (tolerates 3 Byzantine), Byzantine consensus
```

---

### Iterative Refinement

SDK tools (`sdk_execute_task`, `sdk_code_task`) use iterative refinement to meet quality thresholds.

**How It Works:**

1. **Execute:** Agent completes task
2. **Evaluate:** Evaluator scores quality (0-1)
3. **Refine:** If quality < threshold (0.8), agent refines
4. **Repeat:** Max 3 iterations

**Quality Metrics:**
- Code correctness
- Test coverage
- Documentation completeness
- Adherence to requirements

**Example:**

```typescript
await tools.sdk_execute_task({
  taskType: "feature",
  description: "Implement user search with autocomplete",
  requirements: [
    "Debounce input (300ms)",
    "Highlight matching text",
    "Keyboard navigation support",
    "Include unit tests"
  ]
});
```

**Iteration 1:**
- Quality: 0.65 (missing keyboard nav)
- Feedback: "Add keyboard navigation support"

**Iteration 2:**
- Quality: 0.82 (all requirements met)
- ✓ Accepted

**Configuration:**

```typescript
const coordinator = new AgentCoordinator({
  iterativeRefinement: {
    enabled: true,
    maxIterations: 3,
    qualityThreshold: 0.8 // Require 80% quality
  }
});
```

**Benefits:**
- Higher quality outputs
- Self-correcting agents
- Reduced manual review

---

### Historical Learning

Agent SDK coordinator learns from past executions to improve future performance.

**What It Learns:**
- Successful patterns (task type → approach)
- Common failure modes
- Optimal iteration strategies

**Storage:**

Patterns stored in memory (namespace: `patterns`):

```json
{
  "taskType": "feature",
  "pattern": "auth-implementation",
  "approach": "Use JWT with refresh tokens",
  "successRate": 0.92,
  "averageQuality": 0.87,
  "usedCount": 12
}
```

**Retrieval:**

When executing a new task:
1. Search memory for similar patterns
2. Retrieve top K patterns (default: 5)
3. Apply learned approach
4. Fallback to default if no patterns match

**Configuration:**

```typescript
const coordinator = new AgentCoordinator({
  historicalLearning: {
    enabled: true,
    retrievalTopK: 5, // Retrieve top 5 patterns
    patternMinSuccessRate: 0.7 // Only use patterns with >70% success
  }
});
```

**Example:**

**First Time:**
```
Task: Implement OAuth authentication
Approach: Trial-and-error, 3 iterations
Quality: 0.75
```

**Second Time:**
```
Task: Implement Google OAuth login
Approach: Retrieved pattern "oauth-implementation"
Iterations: 1 (used learned approach)
Quality: 0.88
```

**Benefits:**
- Faster execution (fewer iterations)
- Higher quality (proven patterns)
- Continuous improvement

---

## 13. FAQ

### General Questions

#### Q: Do I need to run Claude Flow MCP separately?

**A:** Yes. Claude Flow MCP is an external server that Swarm Orchestrato connects to via stdio. Ensure your `.mcp.json` includes the Claude Flow server configuration.

---

#### Q: Can I use Swarm Orchestrato without Claude Flow?

**A:** No. The orchestrator depends on Claude Flow MCP for swarm management, agent spawning, and task orchestration. However, SDK tools (`sdk_*`) can work independently for single-agent tasks.

---

#### Q: What's the difference between MCP tools and SDK tools?

**A:**
- **MCP Tools**: Connect to Claude Flow MCP server for multi-agent coordination (swarms, consensus, topologies)
- **SDK Tools**: Use Claude Agent SDK for focused, single-task execution with iterative refinement

**Use MCP tools for:** Large-scale, multi-agent workflows
**Use SDK tools for:** High-quality code generation and audits

---

#### Q: How much does it cost to run?

**A:** Costs depend on your LLM provider:
- **Anthropic**: ~$15 per million input tokens, ~$75 per million output tokens (Claude Opus)
- **z.ai**: Free tier available, then pay-per-use
- **OpenRouter**: Varies by model ($0.50-$30 per million tokens)

**Typical costs for a medium mission (5-10 tasks, 50 files):**
- Input: ~500K tokens → $7.50
- Output: ~100K tokens → $7.50
- **Total: ~$15-20**

---

### Setup Questions

#### Q: I get "projectRoot is required" error

**A:** Set project root explicitly:

```bash
ORCHESTRATOR_PROJECT_ROOT=/path/to/project npm start
```

Or add to `.env`:
```env
ORCHESTRATOR_PROJECT_ROOT=/home/user/my-project
```

---

#### Q: How do I know if Claude Flow MCP is working?

**A:** Test connection:

```bash
npx @modelcontextprotocol/inspector
```

Verify tools like `swarm_init`, `agent_spawn` are listed.

---

#### Q: Can I use a different LLM provider?

**A:** Yes. Supported providers:
- `anthropic` (default)
- `zai` (free tier)
- `openrouter` (200+ models)
- `openai` (or any OpenAI-compatible)

Set `LLM_PROVIDER` in `.env`.

---

### Usage Questions

#### Q: How do I stop a running swarm?

**A:**
```typescript
await tools.swarm_destroy({
  swarmId: "swarm-abc123",
  graceful: true // Wait for tasks to complete
});
```

Or:
```
mission> Destroy swarm swarm-abc123
```

---

#### Q: Can I run multiple missions in parallel?

**A:** Yes, but each mission should be a separate session:

```bash
# Terminal 1
npm start # Mission A

# Terminal 2
ORCHESTRATOR_WORKDIR=./workspace-b npm start # Mission B
```

Use different workdirs to avoid checkpoint conflicts.

---

#### Q: How do I resume a previous mission?

**A:** Orchestrator uses SQLite checkpoints. Resume by using the same `thread_id`:

```typescript
const result = await agent.invoke(
  { messages: [new HumanMessage("Continue previous mission")] },
  { configurable: { thread_id: "session-1" } }
);
```

Or in interactive mode:
```
mission> Resume from where we left off
```

The orchestrator will recall context from memory.

---

### Troubleshooting Questions

#### Q: Why are my tasks failing with "SCOPE_VIOLATION"?

**A:** Tasks reference files outside the project boundary. Verify:

1. Project root is correct: `echo $ORCHESTRATOR_PROJECT_ROOT`
2. All paths in task description are within project
3. If intentional, restart with broader project root

---

#### Q: My agents are timing out. What should I do?

**A:** Increase task timeout:

```typescript
await tools.task_orchestrate({
  task: "Long-running task",
  strategy: "parallel",
  timeout: 600000 // 10 minutes
});
```

Or break task into smaller subtasks:
```
mission> Delegate to task_dispatcher to decompose this into smaller chunks
```

---

#### Q: How do I debug a failed task?

**A:**

1. **Check task status:**
   ```typescript
   await tools.task_status({ taskId: "task-xyz789" });
   ```

2. **Retrieve failure details:**
   ```typescript
   await tools.memory_search({
     query: "task-xyz789 failure",
     namespace: "failures"
   });
   ```

3. **Check agent metrics:**
   ```typescript
   await tools.agent_metrics({ agentId: "code-gen-1" });
   ```

4. **Review logs:**
   ```bash
   cat orchestrator-workspace/logs/orchestrator.log
   ```

---

### Advanced Questions

#### Q: Can I customize worker scaling thresholds?

**A:** Yes, when creating a custom worker:

```typescript
const worker = await createSwarmWorker({
  name: "my-worker",
  scaling: {
    enabled: true,
    minAgents: 3,
    maxAgents: 12,
    thresholds: {
      small: 10,  // < 10 items: 3 agents
      medium: 50  // >= 50 items: 12 agents
    }
  }
});
```

---

#### Q: How do I implement a custom consensus mechanism?

**A:** Claude Flow MCP supports pluggable consensus. Define in swarm config:

```typescript
await tools.swarm_init({
  topology: "mesh",
  config: {
    consensus: "custom",
    customConsensus: {
      type: "majority-vote",
      threshold: 0.75 // Require 75% agreement
    }
  }
});
```

---

#### Q: Can I persist memory across different projects?

**A:** Memory is stored in `.claude-flow/data/` by default. To share memory:

1. **Use a shared memory backend:**
   ```env
   CLAUDE_FLOW_MEMORY_PATH=/shared/memory
   ```

2. **Or copy memory namespaces:**
   ```bash
   cp -r .claude-flow/data/ /shared/memory/
   ```

**Caution:** Shared memory can lead to cross-project contamination. Use namespace prefixes:
```typescript
await tools.memory_store({
  namespace: "project-A:tasks",
  key: "task-graph",
  value: "..."
});
```

---

#### Q: How do I contribute a new worker?

**A:**

1. **Create worker file:** `src/workers/my-worker.ts`

2. **Extend base worker:**
   ```typescript
   import { createSwarmWorker } from "./base.js";

   export async function runMyWorker(targetPath: string) {
     const worker = await createSwarmWorker({
       name: "my-worker",
       model: "sonnet"
     });

     const swarmId = await worker.initSwarm();
     // ... implement worker logic ...
     await worker.shutdown(swarmId);
   }
   ```

3. **Add npm script:** `package.json`
   ```json
   {
     "scripts": {
       "worker:my-worker": "tsx src/daemon.ts run my-worker"
     }
   }
   ```

4. **Register in daemon:** `src/daemon.ts`

---

## Conclusion

Swarm Orchestrato enables autonomous, multi-agent AI workflows with:

✅ **Zero manual execution** — plan, dispatch, track, adapt autonomously
✅ **60+ specialized agents** — access the full Claude Flow toolkit
✅ **Dynamic scaling** — 2-8 agents based on task complexity
✅ **Fault tolerance** — automatic recovery, snapshots, Byzantine consensus
✅ **Persistent memory** — HNSW vector search for long-term learning
✅ **Project-scoped** — strict boundaries prevent cross-project contamination

**Get Started:**

```bash
git clone https://github.com/yourusername/swarmorchestrato.git
cd swarmorchestrato
npm install
cp .env.example .env
# Edit .env with your API key
npm start
```

**Resources:**

- **Claude Flow Docs:** https://claude-flow.ruv.io/
- **DeepAgents.js:** https://github.com/langchain-ai/deepagentsjs
- **GitHub:** https://github.com/yourusername/swarmorchestrato

**Support:**

- Open an issue on GitHub
- Join the Discord community
- Read the architecture docs: `docs/ARCHITECTURE.md`

---

**Happy Orchestrating! 🎯**
