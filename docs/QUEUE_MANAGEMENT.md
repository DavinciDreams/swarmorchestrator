# Task Queue Management

## Overview

The task queue management system prevents stale tasks from accumulating and blocking new work.

## Problem It Solves

**Before:**
- Old tasks from previous sessions stayed in "pending" forever
- New tasks got stuck behind 2-3 day old tasks
- No way to clean up the queue automatically
- Manual intervention required to clear old tasks

**After:**
- Automatic cleanup on every startup
- Tasks older than 24 hours are auto-cancelled
- Manual commands for queue inspection
- Configurable thresholds and limits

---

## Automatic Cleanup

Every time the orchestrator starts, it:
1. Scans all pending tasks
2. Cancels tasks older than 24 hours
3. Warns if queue size exceeds 50 tasks
4. Logs cleanup results

**Configuration** (in `src/index.ts`):
```typescript
await initializeTaskQueueManager({
  maxTaskAgeHours: 24,      // Cancel tasks older than this
  maxPendingTasks: 50,      // Warn if queue exceeds this
  autoCleanupOnStartup: true // Run cleanup on startup
});
```

---

## Manual Queue Management

### Check Queue Status
```bash
pnpm queue:status
```

**Output:**
```
📊 Queue Status:
  Pending: 3
  Completed: 12
  Cancelled: 17
  Oldest pending: 2.5 hours ago
```

### Clean Old Tasks
Manually trigger cleanup (cancels tasks older than configured age):
```bash
pnpm queue:clean
```

**Output:**
```
🧹 Cleaning old tasks...

✂️  Cancelled old task: Analyze the project structure...
✂️  Cancelled old task: Run flake8 and mypy...

✅ Cleanup complete!
  Cancelled: 5
  Remaining: 2
```

### Prune History
Remove old completed/cancelled tasks (default: 7 days):
```bash
pnpm queue:prune        # Remove tasks older than 7 days
pnpm queue:prune 30     # Remove tasks older than 30 days
```

---

## How It Works

### Task Lifecycle
```
Created → Pending → In Progress → Completed
                ↓
            Cancelled (if too old)
```

### Auto-Cancellation Rules
Tasks are auto-cancelled if:
- Status is "pending"
- Age > `maxTaskAgeHours` (default: 24 hours)
- Cancelled tasks get tagged with reason:
  ```json
  {
    "status": "cancelled",
    "cancelledAt": "2026-02-06T01:00:00Z",
    "cancelReason": "Auto-cancelled: Task older than 24 hours"
  }
  ```

### Queue Size Warning
If pending tasks exceed `maxPendingTasks` (default: 50):
```
⚠️  Warning: 73 pending tasks exceeds limit of 50
Consider cancelling old tasks or increasing the limit
```

---

## Configuration

### Environment Variables
```bash
# Set in .env file or environment
TASK_MAX_AGE_HOURS=24      # Default: 24
TASK_MAX_PENDING=50        # Default: 50
TASK_AUTO_CLEANUP=true     # Default: true
```

### Programmatic Configuration
```typescript
import { initializeTaskQueueManager } from './src/utils/task-queue-manager.js';

const manager = await initializeTaskQueueManager({
  maxTaskAgeHours: 48,        // 2 days
  maxPendingTasks: 100,
  autoCleanupOnStartup: true,
  taskStorePath: '.claude-flow/tasks/store.json'
});
```

---

## Use Cases

### 1. Long-Running Orchestrator Sessions
If you leave the orchestrator running for days:
- Old tasks won't accumulate
- Queue stays clean automatically
- New tasks get priority

### 2. Multi-Project Workflows
If you switch between projects:
- Old project tasks won't block new ones
- Each startup cleans stale tasks
- Fresh start for each session

### 3. Development/Testing
During development with many test tasks:
- Test tasks auto-expire after 24h
- Queue doesn't fill with test debris
- Clean slate for each dev session

---

## Best Practices

### 1. Regular Queue Checks
Check queue status periodically:
```bash
pnpm queue:status
```

### 2. Prune History Monthly
Clean up old completed tasks:
```bash
pnpm queue:prune 30
```

### 3. Adjust Thresholds
If you need longer task lifetime:
```typescript
// In src/index.ts
maxTaskAgeHours: 48  // 2 days instead of 1
```

### 4. Monitor Queue Size
Watch for the warning:
```
⚠️  Warning: X pending tasks exceeds limit
```
This indicates too many tasks being created - investigate why.

---

## Troubleshooting

### Queue Not Cleaning
**Problem:** Old tasks still present after startup

**Check:**
1. Is `autoCleanupOnStartup` enabled?
2. Are tasks actually older than `maxTaskAgeHours`?
3. Check logs for cleanup errors

**Fix:**
```bash
# Manually clean
pnpm queue:clean

# Check status
pnpm queue:status
```

### Tasks Cancelled Too Soon
**Problem:** Important tasks being auto-cancelled

**Fix:** Increase age threshold:
```typescript
maxTaskAgeHours: 48  // 2 days
```

### Queue Growing Too Large
**Problem:** Hundreds of pending tasks

**Causes:**
- Tasks not completing (stuck?)
- Too many tasks being created
- Tasks timing out

**Fix:**
1. Check why tasks aren't completing
2. Manually clean: `pnpm queue:clean`
3. Lower age threshold: `maxTaskAgeHours: 12`

---

## API Reference

### TaskQueueManager Class

```typescript
class TaskQueueManager {
  constructor(config?: Partial<TaskQueueConfig>);

  // Clean up old pending tasks
  cleanup(): Promise<{
    cancelled: number;
    remaining: number;
    completed: number;
  }>;

  // Get queue statistics
  getStats(): {
    pending: number;
    completed: number;
    cancelled: number;
    oldest: string | null;
  };

  // Remove old completed/cancelled tasks
  pruneHistory(olderThanDays: number): Promise<number>;
}
```

### Configuration Interface

```typescript
interface TaskQueueConfig {
  maxTaskAgeHours: number;        // Default: 24
  maxPendingTasks: number;        // Default: 50
  autoCleanupOnStartup: boolean;  // Default: true
  taskStorePath: string;          // Default: .claude-flow/tasks/store.json
}
```

---

## Examples

### Check If Cleanup Is Working
```bash
# Before starting orchestrator
pnpm queue:status  # Note pending count

# Start orchestrator
pnpm start

# In another terminal
pnpm queue:status  # Pending count should be lower
```

### Manually Clean Before Important Task
```bash
# Clear old tasks first
pnpm queue:clean

# Start fresh session
pnpm start

# Your new task will be next in queue
```

### Find Oldest Tasks
```bash
pnpm queue:status
# Output shows: "Oldest pending: 15.3 hours ago"
```

---

## Monitoring

### Logs to Watch
```
[TaskQueueManager] 🧹 Running startup cleanup...
[TaskQueueManager] ✂️  Cancelled old task: ...
[TaskQueueManager] ✅ Cleanup complete:
  • Cancelled: 5
  • Remaining Pending: 2
  • Completed: 12
```

### Warning Signs
```
⚠️  Warning: 73 pending tasks exceeds limit of 50
```

This means:
- Too many tasks being created
- Tasks not completing fast enough
- May need to investigate task execution

---

## Future Enhancements

Potential improvements:
- [ ] Priority-based expiration (keep high priority longer)
- [ ] Project-specific age thresholds
- [ ] Notification when tasks are auto-cancelled
- [ ] Dashboard for queue visualization
- [ ] Metrics export for monitoring tools

---

**See Also:**
- `MONITORING.md` - Swarm progress monitoring
- `src/utils/task-queue-manager.ts` - Implementation
- `scripts/manage-queue.ts` - CLI commands
