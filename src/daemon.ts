/**
 * Swarm Orchestrato — Daemon
 *
 * Background daemon that runs swarm-based workers for:
 * - Security auditing (chunked, parallel)
 * - Codebase mapping
 * - Optimization analysis
 * - Memory consolidation
 *
 * Key differences from the old daemon:
 * - Uses swarm agents to chunk and parallelize work
 * - Proper timeouts per chunk, not per entire job
 * - Uses appropriate models (sonnet for complex, haiku for simple)
 */

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { AuditWorker } from "./workers/audit.js";
import { MapWorker } from "./workers/map.js";
import { OptimizeWorker } from "./workers/optimize.js";
import { TestGapsWorker } from "./workers/testgaps.js";

const PROJECT_ROOT = process.env.ORCHESTRATOR_WORKDIR || process.cwd();
const STATE_FILE = path.join(PROJECT_ROOT, ".claude-flow/daemon-state.json");
const LOG_DIR = path.join(PROJECT_ROOT, ".claude-flow/logs");

interface WorkerState {
  runCount: number;
  successCount: number;
  failureCount: number;
  averageDurationMs: number;
  lastRun?: string;
  nextRun?: string;
  isRunning: boolean;
  lastError?: string;
}

interface DaemonState {
  running: boolean;
  startedAt: string;
  workers: Record<string, WorkerState>;
  config: {
    autoStart: boolean;
    logDir: string;
    stateFile: string;
    maxConcurrent: number;
    workerTimeoutMs: number;
    resourceThresholds: {
      maxCpuLoad: number;
      minFreeMemoryPercent: number;
    };
    workers: Array<{
      type: string;
      intervalMs: number;
      offsetMs: number;
      priority: string;
      description: string;
      enabled: boolean;
      model?: string;
    }>;
  };
  savedAt: string;
}

// Worker configurations with proper models and timeouts
const WORKER_CONFIG = [
  {
    type: "map",
    intervalMs: 900000, // 15 min
    offsetMs: 0,
    priority: "normal",
    description: "Codebase mapping using swarm",
    enabled: true,
    model: "haiku", // Simple task
  },
  {
    type: "audit",
    intervalMs: 1800000, // 30 min (was 10 min - too frequent)
    offsetMs: 120000,
    priority: "critical",
    description: "Security analysis using chunked swarm",
    enabled: true,
    model: "sonnet", // Complex task - needs intelligence
  },
  {
    type: "optimize",
    intervalMs: 1800000, // 30 min
    offsetMs: 300000,
    priority: "high",
    description: "Performance optimization using swarm",
    enabled: true,
    model: "sonnet",
  },
  {
    type: "consolidate",
    intervalMs: 3600000, // 1 hour
    offsetMs: 600000,
    priority: "low",
    description: "Memory consolidation",
    enabled: true,
    model: "haiku",
  },
  {
    type: "testgaps",
    intervalMs: 2400000, // 40 min
    offsetMs: 900000,
    priority: "normal",
    description: "Test coverage analysis",
    enabled: true,
    model: "sonnet",
  },
];

class SwarmDaemon {
  private state: DaemonState;
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private running = false;

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): DaemonState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      }
    } catch {
      // Use default
    }

    return {
      running: false,
      startedAt: new Date().toISOString(),
      workers: {},
      config: {
        autoStart: false,
        logDir: LOG_DIR,
        stateFile: STATE_FILE,
        maxConcurrent: 2,
        workerTimeoutMs: 600000, // 10 min overall (chunks have their own timeouts)
        resourceThresholds: {
          maxCpuLoad: 2,
          minFreeMemoryPercent: 20,
        },
        workers: WORKER_CONFIG,
      },
      savedAt: new Date().toISOString(),
    };
  }

  private saveState(): void {
    this.state.savedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  private initWorkerState(type: string): WorkerState {
    if (!this.state.workers[type]) {
      this.state.workers[type] = {
        runCount: 0,
        successCount: 0,
        failureCount: 0,
        averageDurationMs: 0,
        isRunning: false,
      };
    }
    return this.state.workers[type];
  }

  private log(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logLine);

    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, "daemon.log"), logLine + "\n");
  }

  async runWorker(type: string): Promise<void> {
    const workerState = this.initWorkerState(type);

    if (workerState.isRunning) {
      this.log("warn", `Worker ${type} already running, skipping`);
      return;
    }

    workerState.isRunning = true;
    workerState.runCount++;
    this.saveState();

    const startTime = Date.now();
    this.log("info", `Starting worker: ${type}`);

    try {
      switch (type) {
        case "map": {
          const worker = await MapWorker(PROJECT_ROOT);
          await worker.run();
          break;
        }
        case "audit": {
          const worker = await AuditWorker(PROJECT_ROOT);
          await worker.run();
          break;
        }
        case "optimize": {
          const worker = await OptimizeWorker(PROJECT_ROOT);
          await worker.run();
          break;
        }
        case "testgaps": {
          const worker = await TestGapsWorker(PROJECT_ROOT);
          await worker.run();
          break;
        }
        default:
          this.log("warn", `Unknown worker type: ${type}`);
      }

      const duration = Date.now() - startTime;
      workerState.successCount++;
      workerState.averageDurationMs =
        (workerState.averageDurationMs * (workerState.successCount - 1) + duration) /
        workerState.successCount;
      workerState.lastRun = new Date().toISOString();
      workerState.lastError = undefined;

      this.log("info", `Worker ${type} completed in ${duration}ms`);
    } catch (err) {
      workerState.failureCount++;
      workerState.lastError = err instanceof Error ? err.message : String(err);
      this.log("error", `Worker ${type} failed: ${workerState.lastError}`);
    } finally {
      workerState.isRunning = false;
      this.saveState();
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      this.log("warn", "Daemon already running");
      return;
    }

    this.running = true;
    this.state.running = true;
    this.state.startedAt = new Date().toISOString();
    this.saveState();

    this.log("info", "Swarm daemon starting...");

    // Schedule workers
    for (const config of this.state.config.workers) {
      if (!config.enabled) continue;

      const workerState = this.initWorkerState(config.type);
      const nextRun = new Date(Date.now() + config.offsetMs);
      workerState.nextRun = nextRun.toISOString();

      // Initial run after offset
      const initialTimer = setTimeout(async () => {
        await this.runWorker(config.type);

        // Then schedule recurring runs
        const recurringTimer = setInterval(async () => {
          workerState.nextRun = new Date(Date.now() + config.intervalMs).toISOString();
          this.saveState();
          await this.runWorker(config.type);
        }, config.intervalMs);

        this.timers.set(`${config.type}-recurring`, recurringTimer);
      }, config.offsetMs);

      this.timers.set(`${config.type}-initial`, initialTimer);
      this.log("info", `Scheduled ${config.type} worker (interval: ${config.intervalMs}ms)`);
    }

    this.saveState();
    this.log("info", "Swarm daemon started");
  }

  stop(): void {
    this.log("info", "Stopping swarm daemon...");

    for (const [name, timer] of this.timers) {
      clearTimeout(timer);
      clearInterval(timer);
      this.log("info", `Cleared timer: ${name}`);
    }
    this.timers.clear();

    this.running = false;
    this.state.running = false;
    this.saveState();

    this.log("info", "Swarm daemon stopped");
  }

  status(): DaemonState {
    return this.state;
  }
}

// CLI interface
async function main() {
  const command = process.argv[2] || "status";
  const daemon = new SwarmDaemon();

  switch (command) {
    case "start":
      await daemon.start();
      // Keep process alive
      process.on("SIGINT", () => {
        daemon.stop();
        process.exit(0);
      });
      process.on("SIGTERM", () => {
        daemon.stop();
        process.exit(0);
      });
      break;

    case "stop":
      daemon.stop();
      break;

    case "run": {
      const workerType = process.argv[3];
      if (!workerType) {
        console.error("Usage: daemon run <worker-type>");
        process.exit(1);
      }
      await daemon.runWorker(workerType);
      process.exit(0);
      break;
    }

    case "status":
      console.log(JSON.stringify(daemon.status(), null, 2));
      break;

    default:
      console.log(`
Swarm Orchestrato Daemon

Usage:
  daemon start           Start the background daemon
  daemon stop            Stop the daemon
  daemon run <type>      Run a specific worker once
  daemon status          Show daemon status

Workers:
  map        Codebase mapping
  audit      Security audit (chunked swarm)
  optimize   Optimization analysis
`);
  }
}

main().catch((err) => {
  console.error("Daemon error:", err);
  process.exit(1);
});

export { SwarmDaemon };
