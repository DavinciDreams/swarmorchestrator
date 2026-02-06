/**
 * Reputation Manager - Tracks per-agent reputation with asymmetric updates
 *
 * Implements Best Practice 8 from agent-cooperation-framework-v2:
 * reputation tracking for sustaining cooperation and excluding free-riders.
 *
 * Key properties:
 * - Slow to earn trust (+0.05 per success)
 * - Fast to lose trust (-0.2 per failure)
 * - Time decay for idle agents (0.01/day, floor at 0.3)
 * - Quality threshold: >= 0.7 = success, < 0.7 = failure
 */

import { PersistenceManager, getDefaultPersistenceManager } from "../utils/persistence.js";

// ---------------------------------------------------------------------------
// Data Model
// ---------------------------------------------------------------------------

export interface ReputationRecord {
  agentName: string;
  score: number; // 0.0-1.0, starts at 0.5
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalQuality: number; // cumulative sum for averaging
  lastActivity: string; // ISO timestamp
  lastUpdated: string; // ISO timestamp
  history: ReputationEvent[]; // last MAX_HISTORY events
}

export interface ReputationEvent {
  timestamp: string;
  taskId: string;
  qualityScore: number;
  delta: number;
  reason: "success" | "failure" | "decay";
}

export interface ReputationSummary {
  agentName: string;
  score: number;
  totalTasks: number;
  averageQuality: number;
  lastActivity: string;
}

export interface ReputationConstants {
  DEFAULT_SCORE: number;
  SUCCESS_INCREMENT: number;
  FAILURE_DECREMENT: number;
  QUALITY_THRESHOLD: number;
  DECAY_RATE: number;
  DECAY_FLOOR: number;
  MAX_HISTORY: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SCORE = 0.5;
const SUCCESS_INCREMENT = 0.05;
const FAILURE_DECREMENT = 0.2;
const QUALITY_THRESHOLD = 0.7;
const DECAY_RATE = 0.01; // per day
const DECAY_FLOOR = 0.3;
const MAX_HISTORY = 50;
const NAMESPACE = "reputation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / msPerDay;
}

function makeDefaultRecord(agentName: string): ReputationRecord {
  const now = new Date().toISOString();
  return {
    agentName,
    score: DEFAULT_SCORE,
    totalTasks: 0,
    successfulTasks: 0,
    failedTasks: 0,
    totalQuality: 0,
    lastActivity: now,
    lastUpdated: now,
    history: [],
  };
}

// ---------------------------------------------------------------------------
// ReputationManager
// ---------------------------------------------------------------------------

export class ReputationManager {
  private persistence: PersistenceManager;

  constructor(persistence?: PersistenceManager) {
    this.persistence = persistence ?? getDefaultPersistenceManager();
  }

  // -------------------------------------------------------------------------
  // Core
  // -------------------------------------------------------------------------

  /**
   * Record the outcome of a task execution for an agent.
   *
   * 1. Load record (or create default at 0.5)
   * 2. Apply time decay since lastActivity
   * 3. Determine success/failure based on qualityScore >= QUALITY_THRESHOLD
   * 4. Apply asymmetric delta (+0.05 or -0.2), clamp to [0, 1]
   * 5. Update counters, append to history (capped at MAX_HISTORY)
   * 6. Persist to .memory/reputation/{agentName}.json
   */
  async recordOutcome(
    agentName: string,
    taskId: string,
    qualityScore: number
  ): Promise<ReputationRecord> {
    const record = await this.loadRecord(agentName);
    const now = new Date().toISOString();

    // Apply time decay since last activity
    this.applyDecay(record, now);

    // Determine success/failure
    const isSuccess = qualityScore >= QUALITY_THRESHOLD;
    const delta = isSuccess ? SUCCESS_INCREMENT : -FAILURE_DECREMENT;

    record.score = clamp(record.score + delta, 0, 1);
    record.totalTasks++;
    record.totalQuality += qualityScore;

    if (isSuccess) {
      record.successfulTasks++;
    } else {
      record.failedTasks++;
    }

    // Append to history (capped)
    record.history.push({
      timestamp: now,
      taskId,
      qualityScore,
      delta,
      reason: isSuccess ? "success" : "failure",
    });
    if (record.history.length > MAX_HISTORY) {
      record.history = record.history.slice(-MAX_HISTORY);
    }

    record.lastActivity = now;
    record.lastUpdated = now;

    await this.saveRecord(record);
    return record;
  }

  /**
   * Get an agent's reputation score with on-read decay (not persisted).
   */
  async getScore(agentName: string): Promise<number> {
    const record = await this.loadRecord(agentName);
    const now = new Date().toISOString();

    // Apply decay in-memory only (avoids write amplification)
    const days = daysBetween(record.lastActivity, now);
    if (days > 0) {
      const decayAmount = days * DECAY_RATE;
      return Math.max(DECAY_FLOOR, record.score - decayAmount);
    }
    return record.score;
  }

  /**
   * Get the full reputation record for an agent, or null if none exists.
   */
  async getRecord(agentName: string): Promise<ReputationRecord | null> {
    const result = await this.persistence.retrieve(NAMESPACE, agentName);
    if (!result.success || !result.data) {
      return null;
    }
    return result.data as unknown as ReputationRecord;
  }

  /**
   * Get summary scores for all tracked agents.
   */
  async getAllScores(): Promise<ReputationSummary[]> {
    const list = await this.persistence.list(NAMESPACE);
    const summaries: ReputationSummary[] = [];

    for (const key of list.keys) {
      const result = await this.persistence.retrieve(NAMESPACE, key);
      if (result.success && result.data) {
        const record = result.data as unknown as ReputationRecord;
        summaries.push({
          agentName: record.agentName,
          score: record.score,
          totalTasks: record.totalTasks,
          averageQuality:
            record.totalTasks > 0
              ? record.totalQuality / record.totalTasks
              : 0,
          lastActivity: record.lastActivity,
        });
      }
    }

    return summaries;
  }

  // -------------------------------------------------------------------------
  // Routing
  // -------------------------------------------------------------------------

  /**
   * Sort candidates by reputation (descending).
   * For "critical" priority, filter out agents below 0.7 score
   * (falls back to all candidates if none qualify).
   */
  async selectAgent(
    candidates: string[],
    priority?: "low" | "normal" | "high" | "critical"
  ): Promise<string[]> {
    const scored: Array<{ name: string; score: number }> = [];

    for (const name of candidates) {
      const score = await this.getScore(name);
      scored.push({ name, score });
    }

    scored.sort((a, b) => b.score - a.score);

    if (priority === "critical") {
      const qualified = scored.filter((s) => s.score >= QUALITY_THRESHOLD);
      if (qualified.length > 0) {
        return qualified.map((s) => s.name);
      }
    }

    return scored.map((s) => s.name);
  }

  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------

  /**
   * Reset an agent's reputation to default.
   */
  async resetAgent(agentName: string): Promise<void> {
    const record = makeDefaultRecord(agentName);
    await this.saveRecord(record);
  }

  /**
   * Return the constants used by this manager.
   */
  getConstants(): ReputationConstants {
    return {
      DEFAULT_SCORE,
      SUCCESS_INCREMENT,
      FAILURE_DECREMENT,
      QUALITY_THRESHOLD,
      DECAY_RATE,
      DECAY_FLOOR,
      MAX_HISTORY,
    };
  }

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------

  private async loadRecord(agentName: string): Promise<ReputationRecord> {
    const result = await this.persistence.retrieve(NAMESPACE, agentName);
    if (result.success && result.data) {
      return result.data as unknown as ReputationRecord;
    }
    return makeDefaultRecord(agentName);
  }

  private async saveRecord(record: ReputationRecord): Promise<void> {
    await this.persistence.store(
      NAMESPACE,
      record.agentName,
      record as unknown as Record<string, unknown>,
      ["reputation", record.agentName]
    );
  }

  /**
   * Apply time decay to a record in-place.
   */
  private applyDecay(record: ReputationRecord, now: string): void {
    const days = daysBetween(record.lastActivity, now);
    if (days <= 0) return;

    const decayAmount = days * DECAY_RATE;
    if (decayAmount > 0) {
      record.score = Math.max(DECAY_FLOOR, record.score - decayAmount);
    }
  }
}
