/**
 * Swarm-Based Background Workers
 *
 * These workers use the swarm to chunk and distribute work across multiple
 * agents rather than trying to do everything in a single agent call.
 * This solves timeout issues and enables parallel processing.
 */

export { AuditWorker } from "./audit.js";
export { MapWorker } from "./map.js";
export { OptimizeWorker } from "./optimize.js";
export { TestGapsWorker } from "./testgaps.js";
export { createSwarmWorker, type SwarmWorkerConfig } from "./base.js";
