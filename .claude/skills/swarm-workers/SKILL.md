---
name: "Swarm Workers"
description: "Create and manage swarm-based background workers that chunk tasks, scale agents dynamically, and process work in parallel. Use for codebase analysis, security audits, and optimization tasks."
---

# Swarm Workers

## What This Skill Does

Creates and manages swarm-based background workers using Claude Flow MCP. Workers automatically chunk work by directory or complexity, scale agents dynamically (2-8 based on task size), process chunks in parallel with timeout handling, and store results in memory namespaces.

## Prerequisites

- Claude Flow MCP server running
- Node.js 18+

## Quick Start

### Create a Custom Worker

```typescript
import { createSwarmWorker, chunkByDirectory } from "./src/workers/base.js";

const worker = await createSwarmWorker({
  name: "my-worker",
  model: "sonnet",
  topology: "hierarchical-mesh",
  scaling: { enabled: true, minAgents: 2, maxAgents: 8 }
});

const swarmId = await worker.initSwarm();
const chunks = chunkByDirectory(files, 10);
const result = await worker.processChunks(chunks, async (chunk) => {
  // Your processing logic
  return analyzeFiles(chunk);
});
await worker.shutdown(swarmId);
```

### Run Built-in Workers

```bash
pnpm worker:map       # Codebase mapping
pnpm worker:audit     # Security audit
pnpm worker:optimize  # Performance analysis
pnpm daemon           # Run all on schedule
```

## Scaling Configuration

```typescript
interface ScalingConfig {
  enabled: boolean;      // Enable dynamic scaling
  minAgents: number;     // Minimum agents (default: 2)
  maxAgents: number;     // Maximum agents (default: 8)
  thresholds: {
    small: number;       // < 5 items: use minAgents
    medium: number;      // 5-20 items: proportional scaling
                         // > 20 items: use maxAgents
  };
}
```

### Scaling Behavior

| Task Size | Items | Agents |
|-----------|-------|--------|
| Small | < 5 | 2 |
| Medium | 5-20 | 2-8 (linear) |
| Large | > 20 | 8 |

## Built-in Workers

### MapWorker - Codebase Mapping

```typescript
import { MapWorker } from "./src/workers/map.js";

const mapper = await MapWorker(projectRoot);
const result = await mapper.run();
// { files, entryPoints, dependencies, modules }
```

- **Model**: haiku (fast, simple)
- **Topology**: mesh (peer-to-peer)
- **Use case**: Index files, build dependency graphs

### AuditWorker - Security Scanning

```typescript
import { AuditWorker } from "./src/workers/audit.js";

const auditor = await AuditWorker(projectRoot);
const result = await auditor.run();
// { status, riskScore, findings, summary }
```

- **Model**: sonnet (nuanced analysis)
- **Topology**: hierarchical (queen coordinates)
- **Use case**: Find vulnerabilities, hardcoded secrets

### OptimizeWorker - Performance Analysis

```typescript
import { OptimizeWorker } from "./src/workers/optimize.js";

const optimizer = await OptimizeWorker(projectRoot);
const result = await optimizer.run();
// { suggestions, summary, hotspots }
```

- **Model**: sonnet (complex reasoning)
- **Topology**: hierarchical-mesh (hybrid)
- **Use case**: Find bottlenecks, suggest optimizations

## Chunking Strategies

### By Directory

```typescript
import { chunkByDirectory } from "./src/workers/base.js";

const chunks = chunkByDirectory(files, 10);
// Groups files by directory, splits large dirs
```

### By Complexity

```typescript
import { chunkByComplexity } from "./src/workers/base.js";

const chunks = chunkByComplexity(
  files.map(f => ({ path: f, lines: countLines(f) })),
  1000 // max lines per chunk
);
```

## Best Practices

### 1. Choose the Right Model

| Task | Model | Reason |
|------|-------|--------|
| Structure mapping | haiku | Fast, simple patterns |
| Security audit | sonnet | Nuanced detection |
| Performance analysis | sonnet | Complex reasoning |

### 2. Enable Scaling

```typescript
// Good: Dynamic scaling for variable workloads
const worker = await createSwarmWorker({
  name: "my-worker",
  scaling: { enabled: true }
});

// Fixed: When you know exact workload
const worker = await createSwarmWorker({
  name: "my-worker",
  maxConcurrency: 4,
  scaling: { enabled: false }
});
```

### 3. Set Appropriate Timeouts

```typescript
const worker = await createSwarmWorker({
  name: "my-worker",
  chunkTimeoutMs: 180000  // 3 min for complex chunks
});
```

### 4. Store Results

```typescript
await worker.storeResults(`analysis-${Date.now()}`, results);
```

## Troubleshooting

### Workers timing out

**Solution**: Increase `chunkTimeoutMs` or reduce chunk size

```typescript
const worker = await createSwarmWorker({
  chunkTimeoutMs: 300000  // 5 minutes
});
```

### Not scaling as expected

**Solution**: Check thresholds match your workload

```typescript
scaling: {
  thresholds: { small: 10, medium: 50 }  // Adjust for your data
}
```

### Memory issues

**Solution**: Use smaller chunks

```typescript
const chunks = chunkByDirectory(files, 5);  // Max 5 files per chunk
```

## Learn More

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Worker Base: [src/workers/base.ts](src/workers/base.ts)
- Daemon: [src/daemon.ts](src/daemon.ts)
