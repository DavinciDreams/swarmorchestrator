export { swarmTools } from "./swarm.js";
export { agentTools } from "./agents.js";
export { taskTools } from "./tasks.js";
export { memoryTools } from "./memory.js";
export { workflowTools } from "./workflows.js";
export { sdkTools, shutdownCoordinator } from "./agent-sdk.js";
export { loggerTools } from "./logger.js";

import { swarmTools } from "./swarm.js";
import { agentTools } from "./agents.js";
import { taskTools } from "./tasks.js";
import { memoryTools } from "./memory.js";
import { workflowTools } from "./workflows.js";
import { sdkTools } from "./agent-sdk.js";
import { loggerTools } from "./logger.js";

/** All orchestrator tools combined (MCP + Agent SDK). */
export const allTools = [
  // MCP-based tools (Claude Flow)
  ...swarmTools,
  ...agentTools,
  ...taskTools,
  ...memoryTools,
  ...workflowTools,
  // Agent SDK execution tools
  ...sdkTools,
  // SDK logging and monitoring tools
  ...loggerTools,
];
