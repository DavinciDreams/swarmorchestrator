#!/usr/bin/env tsx
/**
 * Task Queue Management CLI
 *
 * Usage:
 *   pnpm queue:status    - Show queue statistics
 *   pnpm queue:clean     - Clean up old tasks
 *   pnpm queue:prune     - Remove old completed/cancelled tasks
 */

import { TaskQueueManager } from "../src/utils/task-queue-manager.js";

const command = process.argv[2] || "status";

async function main() {
  const manager = new TaskQueueManager();

  console.log("🔧 Task Queue Manager");
  console.log("====================\n");

  switch (command) {
    case "status": {
      const stats = manager.getStats();
      console.log("📊 Queue Status:");
      console.log(`  Pending: ${stats.pending}`);
      console.log(`  Completed: ${stats.completed}`);
      console.log(`  Cancelled: ${stats.cancelled}`);
      if (stats.oldest) {
        const age = (Date.now() - new Date(stats.oldest).getTime()) / (1000 * 60 * 60);
        console.log(`  Oldest pending: ${age.toFixed(1)} hours ago`);
      }
      console.log();
      break;
    }

    case "clean": {
      console.log("🧹 Cleaning old tasks...\n");
      const result = await manager.cleanup();
      console.log("\n✅ Cleanup complete!");
      console.log(`  Cancelled: ${result.cancelled}`);
      console.log(`  Remaining: ${result.remaining}`);
      break;
    }

    case "prune": {
      const days = parseInt(process.argv[3]) || 7;
      console.log(`🗑️  Pruning tasks older than ${days} days...\n`);
      const pruned = await manager.pruneHistory(days);
      console.log(`✅ Pruned ${pruned} old tasks`);
      break;
    }

    default:
      console.log("❌ Unknown command:", command);
      console.log("\nAvailable commands:");
      console.log("  status - Show queue statistics");
      console.log("  clean  - Clean up old pending tasks");
      console.log("  prune  - Remove old completed/cancelled tasks");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
