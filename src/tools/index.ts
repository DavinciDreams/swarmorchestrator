export { swarmTools } from "./swarm.js";
export { agentTools } from "./agents.js";
export { taskTools } from "./tasks.js";
export { memoryTools } from "./memory.js";
export { workflowTools } from "./workflows.js";

import { swarmTools } from "./swarm.js";
import { agentTools } from "./agents.js";
import { taskTools } from "./tasks.js";
import { memoryTools } from "./memory.js";
import { workflowTools } from "./workflows.js";

/** All orchestrator tools combined. */
export const allTools = [
  ...swarmTools,
  ...agentTools,
  ...taskTools,
  ...memoryTools,
  ...workflowTools,
];
