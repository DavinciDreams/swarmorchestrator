# Swarm Orchestrato Architecture

This document provides a comprehensive overview of the Swarm Orchestrato architecture, including system layers, worker flows, dynamic scaling algorithms, and swarm topologies.

## Table of Contents

1. [System Overview](#system-overview)
2. [Worker Flow](#worker-flow)
3. [Dynamic Scaling](#dynamic-scaling)
4. [Swarm Topologies](#swarm-topologies)
5. [Key Components](#key-components)
6. [Memory Namespaces](#memory-namespaces)

---

## System Overview

The Swarm Orchestrato is a three-layer architecture that coordinates agent swarms through Claude Flow MCP.

```mermaid
graph TB
    subgraph "Layer 1: Swarm Orchestrato"
        direction TB
        DA[DeepAgents.js Deep Agent]

        subgraph "Built-in Components"
            PL[Planner]
            TD[Todos]
        end

        subgraph "Subagents"
            SA[Swarm Architect]
            TDP[Task Dispatcher]
            PT[Progress Tracker]
            RC[Recovery Coordinator]
        end

        subgraph "MCP Tool Bridge"
            LT[32 LangChain Tools]
        end

        DA --> PL
        DA --> TD
        DA --> SA
        DA --> TDP
        DA --> PT
        DA --> RC
        DA --> LT
    end

    subgraph "Layer 2: Background Daemon"
        direction TB
        SD[SwarmDaemon]

        subgraph "Workers"
            MW[MapWorker<br/>mesh topology]
            AW[AuditWorker<br/>hierarchical topology]
            OW[OptimizeWorker<br/>hierarchical-mesh topology]
            CW[ConsolidateWorker]
            TW[TestGapsWorker]
        end

        SD --> MW
        SD --> AW
        SD --> OW
        SD --> CW
        SD --> TW
    end

    subgraph "Layer 3: Claude Flow MCP Server"
        direction TB
        MCP[MCP Server - 87 Tools]

        subgraph "Core Capabilities"
            SW[Swarms]
            AG[Agents]
            TA[Tasks]
            MM[Memory]
            NE[Neural]
            WF[Workflows]
            CO[Consensus]
            HN[HNSW Index]
            FT[Fault Tolerance]
            PF[Performance]
        end

        MCP --> SW
        MCP --> AG
        MCP --> TA
        MCP --> MM
        MCP --> NE
        MCP --> WF
        MCP --> CO
        MCP --> HN
        MCP --> FT
        MCP --> PF
    end

    LT -->|stdio| MCP
    MW -->|callMcpTool| MCP
    AW -->|callMcpTool| MCP
    OW -->|callMcpTool| MCP

    style DA fill:#e1f5fe
    style SD fill:#fff3e0
    style MCP fill:#f3e5f5
```

### Layer Responsibilities

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| **Layer 1** | Swarm Orchestrato | High-level coordination, planning, task decomposition |
| **Layer 1** | Subagents | Specialized coordination (architecture, dispatch, tracking, recovery) |
| **Layer 2** | Background Daemon | Scheduled background workers for continuous analysis |
| **Layer 2** | Workers | Chunked parallel processing using swarm agents |
| **Layer 3** | Claude Flow MCP | Low-level swarm management, agent spawning, memory, consensus |

---

## Worker Flow

Workers follow a consistent pattern: gather files, chunk by directory, spawn swarm agents, process in parallel, and aggregate results.

```mermaid
sequenceDiagram
    autonumber
    participant D as Daemon
    participant W as Worker
    participant FS as Filesystem
    participant SW as Swarm
    participant AG as Agents
    participant MC as MCP Server
    participant MM as Memory

    D->>W: run()

    rect rgb(240, 248, 255)
        Note over W,FS: Phase 1: Gather Files
        W->>FS: gatherSourceFiles(projectRoot)
        FS-->>W: string[] (all source files)
    end

    rect rgb(255, 248, 240)
        Note over W: Phase 2: Chunk by Directory
        W->>W: chunkByDirectory(files, maxChunkSize)
        Note right of W: Groups files by directory<br/>Merges small dirs<br/>Splits large dirs
        W-->>W: string[][] (chunked files)
    end

    rect rgb(240, 255, 240)
        Note over W,MC: Phase 3: Initialize Swarm
        W->>MC: swarm_init(topology, maxAgents)
        MC-->>W: swarmId
    end

    rect rgb(255, 240, 255)
        Note over W,AG: Phase 4: Calculate Scaling
        W->>W: calculateOptimalConcurrency(chunks.length)
        Note right of W: Determines agent count<br/>based on task size
    end

    rect rgb(248, 248, 240)
        Note over W,AG: Phase 5: Process Chunks in Parallel
        loop For each batch of chunks
            par Parallel Processing
                W->>AG: processor(chunk[0])
                W->>AG: processor(chunk[1])
                W->>AG: processor(chunk[n])
            end
            AG-->>W: ChunkResult[]
        end
    end

    rect rgb(240, 248, 248)
        Note over W,MM: Phase 6: Aggregate & Store
        W->>W: aggregateResults(chunkResults)
        W->>MM: memory_store(results)
        MM-->>W: stored
    end

    rect rgb(248, 240, 240)
        Note over W,MC: Phase 7: Cleanup
        W->>MC: swarm_shutdown(swarmId, graceful=true)
        MC-->>W: shutdown complete
    end

    W-->>D: WorkerResult
```

### Chunk Processing Detail

```mermaid
flowchart TD
    subgraph "chunkByDirectory Algorithm"
        A[Input: files array] --> B{Group files by<br/>directory path}
        B --> C[Map&lt;dir, files[]&gt;]

        C --> D{For each directory}
        D --> E{files.length ><br/>maxChunkSize?}

        E -->|Yes| F[Split into multiple chunks<br/>of maxChunkSize each]
        E -->|No| G{currentChunk.length +<br/>files.length > maxChunkSize?}

        G -->|Yes| H[Push currentChunk<br/>Start new chunk with files]
        G -->|No| I[Add files to currentChunk]

        F --> J[Add all split chunks]
        H --> K{More directories?}
        I --> K
        J --> K

        K -->|Yes| D
        K -->|No| L[Push final currentChunk]
        L --> M[Output: string[][] chunks]
    end

    style A fill:#e3f2fd
    style M fill:#e8f5e9
```

---

## Dynamic Scaling

The system dynamically calculates the optimal number of concurrent agents based on task size.

```mermaid
flowchart TD
    subgraph "calculateOptimalConcurrency"
        A[Input: taskSize, scalingConfig] --> B{scaling.enabled?}

        B -->|No| C[Return maxAgents<br/>reason: scaling disabled]

        B -->|Yes| D{taskSize <= 0?}
        D -->|Yes| E[Return minAgents<br/>reason: empty task]

        D -->|No| F{taskSize < small threshold?}
        F -->|Yes| G[Return minAgents<br/>reason: small task]

        F -->|No| H{taskSize >= medium threshold?}
        H -->|Yes| I[Return maxAgents<br/>reason: large task]

        H -->|No| J[Linear Interpolation]

        subgraph "Linear Interpolation Formula"
            J --> K["range = medium - small"]
            K --> L["position = taskSize - small"]
            L --> M["ratio = position / range"]
            M --> N["scaled = min + ratio * (max - min)"]
            N --> O["Return Math.round(scaled)"]
        end
    end

    style A fill:#fff3e0
    style C fill:#e8f5e9
    style E fill:#e8f5e9
    style G fill:#e8f5e9
    style I fill:#e8f5e9
    style O fill:#e8f5e9
```

### Scaling Configuration

```mermaid
graph LR
    subgraph "Default Scaling Thresholds"
        direction TB
        T1["< 5 items<br/>(small)"] -->|"minAgents = 2"| A1[2 agents]
        T2["5-20 items<br/>(medium)"] -->|"Linear scale"| A2[2-8 agents]
        T3["> 20 items<br/>(large)"] -->|"maxAgents = 8"| A3[8 agents]
    end

    style T1 fill:#e3f2fd
    style T2 fill:#fff9c4
    style T3 fill:#ffccbc
```

### Scaling Example Visualization

```mermaid
xychart-beta
    title "Agent Count vs Task Size (Default Config)"
    x-axis "Task Size (items)" [0, 5, 10, 15, 20, 25, 30]
    y-axis "Agent Count" 0 --> 10
    line "Agents" [2, 2, 4, 6, 8, 8, 8]
```

---

## Swarm Topologies

Different workers use different swarm topologies optimized for their specific workloads.

### Topology Overview

```mermaid
graph TB
    subgraph "Mesh Topology (MapWorker)"
        direction TB
        M1((Agent 1))
        M2((Agent 2))
        M3((Agent 3))
        M4((Agent 4))
        M5((Agent 5))
        M6((Agent 6))

        M1 <--> M2
        M1 <--> M3
        M1 <--> M4
        M2 <--> M3
        M2 <--> M5
        M3 <--> M4
        M3 <--> M6
        M4 <--> M5
        M5 <--> M6
        M4 <--> M6
    end
```

**Use Case**: Codebase mapping - peer-to-peer parallel file processing where agents work independently and can share discovered relationships.

```mermaid
graph TB
    subgraph "Hierarchical Topology (AuditWorker)"
        direction TB
        Q((Queen<br/>Coordinator))

        W1((Worker 1))
        W2((Worker 2))
        W3((Worker 3))
        W4((Worker 4))

        Q --> W1
        Q --> W2
        Q --> W3
        Q --> W4

        W1 -.->|findings| Q
        W2 -.->|findings| Q
        W3 -.->|findings| Q
        W4 -.->|findings| Q
    end

    style Q fill:#ffcdd2
```

**Use Case**: Security audits - queen coordinates findings aggregation, ensures consistent severity ratings, and prevents duplicate detection.

```mermaid
graph TB
    subgraph "Hierarchical-Mesh Topology (OptimizeWorker)"
        direction TB
        QN((Queen<br/>Coordinator))

        subgraph "Team A"
            A1((A1))
            A2((A2))
            A1 <--> A2
        end

        subgraph "Team B"
            B1((B1))
            B2((B2))
            B1 <--> B2
        end

        QN --> A1
        QN --> A2
        QN --> B1
        QN --> B2

        A1 -.->|results| QN
        B1 -.->|results| QN
    end

    style QN fill:#ffcdd2
```

**Use Case**: Optimization analysis - combines top-down coordination with peer collaboration within teams for discussing complex refactoring decisions.

### Topology Selection Guide

```mermaid
flowchart TD
    A[Task Type?] --> B{Needs tight control?}

    B -->|Yes| C{Large team > 10?}
    B -->|No| D{Need consensus?}

    C -->|Yes| E[hierarchical-mesh]
    C -->|No| F[hierarchical]

    D -->|Yes| G{Sequential pipeline?}
    D -->|No| H[mesh]

    G -->|Yes| I[ring]
    G -->|No| J{Central hub pattern?}

    J -->|Yes| K[star]
    J -->|No| H

    style E fill:#e1bee7
    style F fill:#ffccbc
    style H fill:#c8e6c9
    style I fill:#b3e5fc
    style K fill:#fff9c4
```

### Worker Topology Configuration

| Worker | Topology | Model | Max Concurrency | Chunk Timeout | Use Case |
|--------|----------|-------|-----------------|---------------|----------|
| **MapWorker** | `mesh` | haiku | 6 | 60s | Parallel file indexing |
| **AuditWorker** | `hierarchical` | sonnet | 4 | 180s | Security analysis with finding coordination |
| **OptimizeWorker** | `hierarchical-mesh` | sonnet | 4 | 120s | Complex refactoring decisions |

---

## Key Components

### `createSwarmWorker()` - Factory for Swarm-Based Workers

```mermaid
classDiagram
    class SwarmWorkerConfig {
        +string name
        +number chunkTimeoutMs
        +number maxConcurrency
        +string model
        +string topology
        +ScalingConfig scaling
    }

    class ScalingConfig {
        +boolean enabled
        +number minAgents
        +number maxAgents
        +Thresholds thresholds
    }

    class Thresholds {
        +number small
        +number medium
    }

    class SwarmWorker {
        +string name
        +getScalingConfig() ScalingConfig
        +initSwarm() Promise~string~
        +spawnAgents() Promise~string[]~
        +processChunks() Promise~WorkerResult~
        +dispatchTask() Promise~string~
        +storeResults() Promise~void~
        +shutdown() Promise~void~
    }

    class WorkerResult {
        +boolean success
        +number totalChunks
        +number completedChunks
        +number failedChunks
        +ChunkResult[] results
        +unknown aggregated
        +number durationMs
    }

    class ChunkResult {
        +string chunkId
        +boolean success
        +unknown data
        +string error
        +number durationMs
    }

    SwarmWorkerConfig --> ScalingConfig
    ScalingConfig --> Thresholds
    SwarmWorkerConfig ..> SwarmWorker : creates
    SwarmWorker --> WorkerResult
    WorkerResult --> ChunkResult
```

### `chunkByDirectory()` - File Chunking Strategy

```mermaid
flowchart LR
    subgraph Input
        F1[src/tools/swarm.ts]
        F2[src/tools/agents.ts]
        F3[src/tools/tasks.ts]
        F4[src/workers/base.ts]
        F5[src/workers/map.ts]
        F6[src/mcp/client.ts]
    end

    subgraph "Group by Directory"
        D1["src/tools/<br/>(3 files)"]
        D2["src/workers/<br/>(2 files)"]
        D3["src/mcp/<br/>(1 file)"]
    end

    subgraph "Output Chunks (maxSize=2)"
        C1["Chunk 1<br/>swarm.ts, agents.ts"]
        C2["Chunk 2<br/>tasks.ts"]
        C3["Chunk 3<br/>base.ts, map.ts"]
        C4["Chunk 4<br/>client.ts"]
    end

    F1 --> D1
    F2 --> D1
    F3 --> D1
    F4 --> D2
    F5 --> D2
    F6 --> D3

    D1 -->|split large| C1
    D1 -->|split large| C2
    D2 --> C3
    D3 -->|merge small| C4
```

### `estimateAgentCount()` - Complexity-Based Estimation

```mermaid
flowchart TD
    A[Input Metrics] --> B{Calculate Base}

    subgraph "Input Metrics"
        M1[fileCount]
        M2[totalLines]
        M3[chunkCount]
        M4[complexity: low/medium/high]
    end

    B --> C["base = max(fileCount, chunkCount, ceil(totalLines/500))"]

    C --> D{Apply Complexity Multiplier}

    D --> E["low: 0.5x"]
    D --> F["medium: 1.0x"]
    D --> G["high: 1.5x"]

    E --> H["adjusted = ceil(base * multiplier)"]
    F --> H
    G --> H

    H --> I["agents = clamp(adjusted, 2, 10)"]

    I --> J[Output: agents, reasoning]

    style A fill:#e3f2fd
    style J fill:#e8f5e9
```

---

## Memory Namespaces

The system uses organized memory namespaces for persistent state management.

```mermaid
graph TB
    subgraph "Memory Namespaces"
        direction LR

        subgraph "Execution State"
            TASKS[tasks<br/>Task definitions,<br/>dependencies, task graph]
            PROG[progress<br/>Completion status,<br/>timelines, rollups]
        end

        subgraph "Decision History"
            DEC[decisions<br/>Architecture/strategy<br/>decisions with rationale]
            PAT[patterns<br/>Learned patterns about<br/>what works]
        end

        subgraph "Failure Tracking"
            FAIL[failures<br/>Failure logs with<br/>root causes]
            REC[recovery<br/>Recovery actions<br/>and outcomes]
        end

        subgraph "Project Context"
            CTX[context<br/>Project context,<br/>goals, acceptance criteria]
        end

        subgraph "Worker Results"
            WM[worker-map<br/>Codebase mapping results]
            WA[worker-audit<br/>Security audit findings]
            WO[worker-optimize<br/>Optimization suggestions]
        end
    end

    style TASKS fill:#e3f2fd
    style PROG fill:#e3f2fd
    style DEC fill:#fff9c4
    style PAT fill:#fff9c4
    style FAIL fill:#ffccbc
    style REC fill:#ffccbc
    style CTX fill:#e8f5e9
    style WM fill:#f3e5f5
    style WA fill:#f3e5f5
    style WO fill:#f3e5f5
```

### Memory Flow

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant W as Worker
    participant M as Memory Store
    participant MC as MCP Server

    Note over O,MC: Planning Phase
    O->>M: memory_store(tasks, task-graph)
    O->>M: memory_store(context, project-goals)

    Note over O,MC: Execution Phase
    O->>W: dispatch task
    W->>MC: process chunks
    MC-->>W: results
    W->>M: memory_store(worker-{name}, results)
    W-->>O: WorkerResult

    Note over O,MC: Tracking Phase
    O->>M: memory_store(progress, status-update)
    O->>M: memory_search(patterns, similar-tasks)

    Note over O,MC: Recovery Phase
    O->>M: memory_store(failures, error-context)
    O->>M: memory_store(recovery, recovery-action)
```

---

## Daemon Worker Schedule

The background daemon schedules workers with staggered offsets to prevent resource contention.

```mermaid
gantt
    title Worker Schedule (First 2 Hours)
    dateFormat mm:ss
    axisFormat %M:%S

    section Map Worker
    Initial Run (offset 0)     :active, map1, 00:00, 5m
    Recurring (15min)          :map2, 15:00, 5m
    Recurring                  :map3, 30:00, 5m
    Recurring                  :map4, 45:00, 5m
    Recurring                  :map5, 60:00, 5m
    Recurring                  :map6, 75:00, 5m
    Recurring                  :map7, 90:00, 5m
    Recurring                  :map8, 105:00, 5m

    section Audit Worker
    Initial Run (offset 2min)  :active, aud1, 02:00, 10m
    Recurring (30min)          :aud2, 32:00, 10m
    Recurring                  :aud3, 62:00, 10m
    Recurring                  :aud4, 92:00, 10m

    section Optimize Worker
    Initial Run (offset 5min)  :active, opt1, 05:00, 8m
    Recurring (30min)          :opt2, 35:00, 8m
    Recurring                  :opt3, 65:00, 8m
    Recurring                  :opt4, 95:00, 8m
```

---

## Data Flow Summary

```mermaid
flowchart TB
    subgraph "User Interaction"
        U[User Request]
    end

    subgraph "Layer 1: Orchestration"
        O[Orchestrator]
        SA[Subagents]
    end

    subgraph "Layer 2: Background Processing"
        D[Daemon]
        W[Workers]
    end

    subgraph "Layer 3: Swarm Execution"
        MCP[Claude Flow MCP]
        SW[Swarm Agents]
    end

    subgraph "Storage"
        M[(Memory Store)]
        FS[(Filesystem)]
    end

    U -->|request| O
    O -->|delegate| SA
    O -->|dispatch| MCP
    SA -->|tools| MCP

    D -->|schedule| W
    W -->|process| MCP
    MCP -->|spawn/manage| SW

    SW -->|read| FS
    SW -->|results| MCP
    MCP -->|aggregate| W
    W -->|store| M
    O -->|query| M

    style U fill:#e3f2fd
    style O fill:#fff9c4
    style MCP fill:#f3e5f5
    style M fill:#e8f5e9
```

---

## References

- **Claude Flow Documentation**: https://claude-flow.ruv.io/
- **DeepAgents.js**: https://github.com/langchain-ai/deepagentsjs
- **MCP Protocol**: https://modelcontextprotocol.io/
