# Iteration Configuration

## Overview

The Agent Coordinator supports **iterative refinement** — automatically re-executing tasks until they meet quality thresholds. This feature can be configured via environment variables.

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Iterative Refinement
ITERATIVE_REFINEMENT_ENABLED=true   # Enable/disable iterative refinement
MAX_ITERATIONS=1                     # Number of refinement attempts (1-10)
QUALITY_THRESHOLD=0.8                # Quality score threshold (0.0-1.0)

# Historical Learning
HISTORICAL_LEARNING_ENABLED=true    # Learn from past executions
RETRIEVAL_TOP_K=5                   # Number of similar tasks to retrieve
PATTERN_MIN_SUCCESS_RATE=0.7        # Minimum success rate for patterns

# Swarm Configuration
SWARM_TOPOLOGY=hierarchical-mesh    # Topology type
SWARM_MAX_AGENTS=8                  # Max agents per swarm
```

### Defaults

| Variable | Default | Description |
|----------|---------|-------------|
| `ITERATIVE_REFINEMENT_ENABLED` | `true` | Enable iterative refinement |
| `MAX_ITERATIONS` | `1` | Single pass (no re-execution) |
| `QUALITY_THRESHOLD` | `0.8` | 80% quality required to pass |
| `HISTORICAL_LEARNING_ENABLED` | `true` | Learn from past tasks |
| `RETRIEVAL_TOP_K` | `5` | Retrieve top 5 similar tasks |
| `PATTERN_MIN_SUCCESS_RATE` | `0.7` | 70% success rate for pattern reuse |
| `SWARM_TOPOLOGY` | `hierarchical-mesh` | Default topology |
| `SWARM_MAX_AGENTS` | `8` | Maximum 8 agents per swarm |

---

## How Iterative Refinement Works

When `ITERATIVE_REFINEMENT_ENABLED=true`:

1. **Execute Task** — Agent executes the task
2. **Evaluate Output** — Evaluator scores quality (0-1)
3. **Check Threshold** — If quality ≥ threshold, done!
4. **Generate Improvements** — If quality < threshold, generate suggestions
5. **Re-execute** — Agent tries again with improvements
6. **Repeat** — Up to `MAX_ITERATIONS` times

### Example Flow

```
Iteration 1:
  Execute → Quality: 0.6 (below 0.8 threshold)
  Generate improvements → Re-execute

Iteration 2:
  Execute → Quality: 0.85 (above 0.8 threshold)
  ✅ Done! (stopped after 2 iterations)
```

---

## Use Cases

### Single Pass (Fastest)
For rapid prototyping or when quality checks aren't critical:

```bash
MAX_ITERATIONS=1
QUALITY_THRESHOLD=0.5
```

### Balanced (Recommended)
Good quality with reasonable execution time:

```bash
MAX_ITERATIONS=2
QUALITY_THRESHOLD=0.8
```

### High Quality (Slower)
When output quality is critical:

```bash
MAX_ITERATIONS=5
QUALITY_THRESHOLD=0.9
```

### Disabled
Turn off iterative refinement completely:

```bash
ITERATIVE_REFINEMENT_ENABLED=false
MAX_ITERATIONS=1
```

---

## Performance Impact

| Setting | Execution Time | Quality | Use Case |
|---------|----------------|---------|----------|
| `MAX_ITERATIONS=1` | Fast (1x) | Variable | Prototyping, experimentation |
| `MAX_ITERATIONS=2` | Medium (1-2x) | Good | Production, most tasks |
| `MAX_ITERATIONS=3` | Slower (1-3x) | High | Critical tasks |
| `MAX_ITERATIONS=5` | Slow (1-5x) | Very high | Mission-critical output |

**Note:** Actual iterations depend on quality scores. If quality threshold is met early, iteration stops.

---

## Monitoring

### Check Current Configuration

```typescript
import { getCoordinator } from './tools/agent-sdk.js';

const coordinator = await getCoordinator();
console.log('Config:', coordinator.config);
```

### View Iteration Logs

During execution, you'll see logs like:

```
--- Iteration 1/3 ---
Quality: 0.65
Improvement suggestions: 8

--- Iteration 2/3 ---
Quality: 0.82
Quality threshold (0.8) met!
```

### Check Metrics

```typescript
const metrics = coordinator.getMetrics();
console.log('Average iterations:', metrics.averageIterations);
console.log('Average quality:', metrics.averageQuality);
```

---

## Troubleshooting

### Tasks Never Complete
**Problem:** Tasks iterate forever or hit max iterations

**Solution:**
- Lower `QUALITY_THRESHOLD` (try 0.7 or 0.6)
- Check evaluator logic
- Increase `MAX_ITERATIONS` if quality is improving

### Poor Quality Output
**Problem:** Tasks complete but output is low quality

**Solution:**
- Increase `QUALITY_THRESHOLD` (try 0.85 or 0.9)
- Increase `MAX_ITERATIONS` (try 3-5)
- Review task requirements and evaluation criteria

### Slow Execution
**Problem:** Tasks take too long to complete

**Solution:**
- Reduce `MAX_ITERATIONS` (try 1-2)
- Lower `QUALITY_THRESHOLD` (try 0.7)
- Set `ITERATIVE_REFINEMENT_ENABLED=false`

---

## Advanced Configuration

### Per-Task Overrides

You can override settings programmatically:

```typescript
const coordinator = new AgentCoordinator({
  iterativeRefinement: {
    enabled: true,
    maxIterations: 5,      // Override for this coordinator
    qualityThreshold: 0.9,
  }
});
```

### Dynamic Adjustment

Adjust based on task type:

```typescript
const iterations = taskType === 'critical' ? 5 : 1;
const threshold = taskType === 'critical' ? 0.9 : 0.7;
```

---

## Related Documentation

- [Queue Management](./QUEUE_MANAGEMENT.md) - Task queue configuration
- [Monitoring](./MONITORING.md) - Swarm progress monitoring
- [Agent Coordinator](../src/agents/agent-coordinator.ts) - Source code

---

**See Also:**
- `.env.example` - Full environment variable reference
- `src/agents/agent-coordinator.ts` - Coordinator implementation
- `src/tools/agent-sdk.ts` - SDK tools configuration
