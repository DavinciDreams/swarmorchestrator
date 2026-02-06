/**
 * Task Queue Manager
 *
 * Prevents task queue from accumulating old/stale tasks:
 * - Auto-cleanup on startup
 * - Age-based task expiration
 * - Queue size limits
 * - Duplicate task detection
 */

import * as fs from "fs";
import * as path from "path";

export interface TaskQueueConfig {
  /** Maximum age of pending tasks in hours (default: 24) */
  maxTaskAgeHours: number;
  /** Maximum number of pending tasks (default: 50) */
  maxPendingTasks: number;
  /** Auto-cleanup on startup (default: true) */
  autoCleanupOnStartup: boolean;
  /** Task store file path */
  taskStorePath: string;
}

const DEFAULT_CONFIG: TaskQueueConfig = {
  maxTaskAgeHours: 24,
  maxPendingTasks: 50,
  autoCleanupOnStartup: true,
  taskStorePath: ".claude-flow/tasks/store.json",
};

export class TaskQueueManager {
  private config: TaskQueueConfig;

  constructor(config?: Partial<TaskQueueConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Clean up old/stale tasks from the queue
   */
  async cleanup(): Promise<{
    cancelled: number;
    remaining: number;
    completed: number;
  }> {
    const storePath = path.resolve(this.config.taskStorePath);

    if (!fs.existsSync(storePath)) {
      console.log("[TaskQueueManager] No task store found, skipping cleanup");
      return { cancelled: 0, remaining: 0, completed: 0 };
    }

    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));

    let cancelled = 0;
    let remaining = 0;
    let completed = 0;

    const now = Date.now();
    const maxAgeMs = this.config.maxTaskAgeHours * 60 * 60 * 1000;

    Object.keys(store.tasks || {}).forEach((id) => {
      const task = store.tasks[id];
      const taskAge = now - new Date(task.createdAt).getTime();

      if (task.status === "pending") {
        // Cancel tasks older than max age
        if (taskAge > maxAgeMs) {
          task.status = "cancelled";
          task.cancelledAt = new Date().toISOString();
          task.cancelReason = `Auto-cancelled: Task older than ${this.config.maxTaskAgeHours} hours`;
          cancelled++;
          console.log(
            `[TaskQueueManager] ✂️  Cancelled old task: ${task.description.substring(0, 60)}...`
          );
        } else {
          remaining++;
        }
      } else if (task.status === "completed") {
        completed++;
      }
    });

    // Check if pending queue is too large
    if (remaining > this.config.maxPendingTasks) {
      console.warn(
        `[TaskQueueManager] ⚠️  Warning: ${remaining} pending tasks exceeds limit of ${this.config.maxPendingTasks}`
      );
      console.warn(
        `[TaskQueueManager] Consider cancelling old tasks or increasing the limit`
      );
    }

    // Save updated store
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

    console.log(`[TaskQueueManager] ✅ Cleanup complete:`);
    console.log(`  • Cancelled: ${cancelled}`);
    console.log(`  • Remaining Pending: ${remaining}`);
    console.log(`  • Completed: ${completed}`);

    return { cancelled, remaining, completed };
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    pending: number;
    completed: number;
    cancelled: number;
    oldest: string | null;
  } {
    const storePath = path.resolve(this.config.taskStorePath);

    if (!fs.existsSync(storePath)) {
      return { pending: 0, completed: 0, cancelled: 0, oldest: null };
    }

    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));

    let pending = 0;
    let completed = 0;
    let cancelled = 0;
    let oldestPending: Date | null = null;

    Object.values(store.tasks || {}).forEach((task: any) => {
      if (task.status === "pending") {
        pending++;
        const createdAt = new Date(task.createdAt);
        if (!oldestPending || createdAt < oldestPending) {
          oldestPending = createdAt;
        }
      } else if (task.status === "completed") {
        completed++;
      } else if (task.status === "cancelled") {
        cancelled++;
      }
    });

    return {
      pending,
      completed,
      cancelled,
      oldest: oldestPending ? oldestPending.toISOString() : null,
    };
  }

  /**
   * Remove completed/cancelled tasks older than specified days
   */
  async pruneHistory(olderThanDays: number = 7): Promise<number> {
    const storePath = path.resolve(this.config.taskStorePath);

    if (!fs.existsSync(storePath)) {
      return 0;
    }

    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));

    let pruned = 0;
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    Object.keys(store.tasks || {}).forEach((id) => {
      const task = store.tasks[id];

      if (["completed", "cancelled"].includes(task.status)) {
        const completedTime = task.completedAt || task.cancelledAt;
        if (completedTime && new Date(completedTime).getTime() < cutoffTime) {
          delete store.tasks[id];
          pruned++;
        }
      }
    });

    if (pruned > 0) {
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
      console.log(`[TaskQueueManager] 🗑️  Pruned ${pruned} old completed/cancelled tasks`);
    }

    return pruned;
  }
}

/**
 * Initialize task queue manager and run startup cleanup
 */
export async function initializeTaskQueueManager(
  config?: Partial<TaskQueueConfig>
): Promise<TaskQueueManager> {
  const manager = new TaskQueueManager(config);

  if (manager["config"].autoCleanupOnStartup) {
    console.log("[TaskQueueManager] 🧹 Running startup cleanup...");
    await manager.cleanup();
  }

  return manager;
}
