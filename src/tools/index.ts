export { sdkTools, shutdownCoordinator } from "./agent-sdk.js";
export { loggerTools } from "./logger.js";
export { localMemoryTools } from "./local-memory.js";

import { sdkTools } from "./agent-sdk.js";
import { loggerTools } from "./logger.js";
import { localMemoryTools } from "./local-memory.js";

/** All orchestrator tools combined (SDK execution + logging + local memory). */
export const allTools = [
  // Agent SDK execution tools
  ...sdkTools,
  // SDK logging and monitoring tools
  ...loggerTools,
  // Local memory tools
  ...localMemoryTools,
];
