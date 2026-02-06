/**
 * Execution Layer Constants and Utilities
 *
 * Defines the two-layer architecture for swarm orchestration:
 * - MCP Layer: Infrastructure management (agents, topology, health)
 * - SDK Layer: Task execution (code generation, audits, quality)
 *
 * See docs/ARCHITECTURE_TWO_LAYER.md for design rationale
 */

export const LAYERS = {
  MCP: 'mcp_infrastructure',
  SDK: 'sdk_execution',
  ORCHESTRATOR: 'orchestrator'
} as const;

export type Layer = typeof LAYERS[keyof typeof LAYERS];

export const STATE_DIRS = {
  MCP: '.claude-flow/infrastructure',
  SDK: '.memory/execution',
  ORCHESTRATOR: '.orchestrator'
} as const;

export const LOG_NAMESPACES = {
  MCP: 'mcp_infrastructure',
  SDK: 'sdk_execution',
  ORCHESTRATOR: 'orchestrator'
} as const;

/**
 * Tool name prefixes for each layer
 */
export const TOOL_PREFIXES = {
  MCP: 'mcp_',
  SDK: 'sdk_',
  ORCHESTRATOR: ''  // No prefix for orchestrator tools
} as const;

/**
 * Layer responsibilities - what each layer should handle
 */
export const LAYER_RESPONSIBILITIES = {
  MCP: [
    'agent_lifecycle',
    'swarm_topology',
    'health_monitoring',
    'load_balancing',
    'consensus_voting',
    'persistent_storage',
    'infrastructure_metrics'
  ],
  SDK: [
    'code_generation',
    'file_operations',
    'bash_commands',
    'quality_evaluation',
    'iterative_refinement',
    'security_audits',
    'pattern_learning',
    'background_workers'
  ],
  ORCHESTRATOR: [
    'task_decomposition',
    'progress_tracking',
    'routing_decisions',
    'todo_management',
    'context_management'
  ]
} as const;

/**
 * Determine which layer should handle a given operation
 */
export function determineLayer(operation: string): Layer {
  const lowerOp = operation.toLowerCase();

  // Check MCP responsibilities
  if (
    lowerOp.includes('agent') ||
    lowerOp.includes('swarm') ||
    lowerOp.includes('spawn') ||
    lowerOp.includes('terminate') ||
    lowerOp.includes('health') ||
    lowerOp.includes('topology') ||
    lowerOp.includes('scale') ||
    lowerOp.includes('consensus') ||
    lowerOp.includes('load_balance')
  ) {
    return LAYERS.MCP;
  }

  // Check SDK responsibilities
  if (
    lowerOp.includes('code') ||
    lowerOp.includes('file') ||
    lowerOp.includes('write') ||
    lowerOp.includes('read') ||
    lowerOp.includes('edit') ||
    lowerOp.includes('bash') ||
    lowerOp.includes('audit') ||
    lowerOp.includes('quality') ||
    lowerOp.includes('generate') ||
    lowerOp.includes('refactor') ||
    lowerOp.includes('optimize')
  ) {
    return LAYERS.SDK;
  }

  // Default to orchestrator for coordination tasks
  return LAYERS.ORCHESTRATOR;
}

/**
 * Validate that a tool is being used in the correct layer
 */
export function validateLayerUsage(
  toolName: string,
  context: { layer?: Layer; agentType?: string; operation?: string }
): { valid: boolean; warning?: string } {
  // Extract layer from tool name prefix
  let toolLayer: Layer;
  if (toolName.startsWith(TOOL_PREFIXES.MCP)) {
    toolLayer = LAYERS.MCP;
  } else if (toolName.startsWith(TOOL_PREFIXES.SDK)) {
    toolLayer = LAYERS.SDK;
  } else {
    toolLayer = LAYERS.ORCHESTRATOR;
  }

  // If context specifies a layer, check for violations
  if (context.layer && context.layer !== toolLayer) {
    // Special exception: SDK can use MCP for persistent storage
    if (
      context.layer === LAYERS.SDK &&
      toolLayer === LAYERS.MCP &&
      (toolName.includes('memory_store') || toolName.includes('memory_retrieve'))
    ) {
      return { valid: true }; // Allow storage operations
    }

    return {
      valid: false,
      warning: `Layer violation: ${toolLayer} tool (${toolName}) called from ${context.layer} context`
    };
  }

  return { valid: true };
}

/**
 * Get the appropriate state directory for a layer
 */
export function getStateDir(layer: Layer): string {
  switch (layer) {
    case LAYERS.MCP:
      return STATE_DIRS.MCP;
    case LAYERS.SDK:
      return STATE_DIRS.SDK;
    case LAYERS.ORCHESTRATOR:
      return STATE_DIRS.ORCHESTRATOR;
    default:
      return '.swarm'; // Fallback for shared state
  }
}

/**
 * Get the appropriate log namespace for a layer
 */
export function getLogNamespace(layer: Layer): string {
  switch (layer) {
    case LAYERS.MCP:
      return LOG_NAMESPACES.MCP;
    case LAYERS.SDK:
      return LOG_NAMESPACES.SDK;
    case LAYERS.ORCHESTRATOR:
      return LOG_NAMESPACES.ORCHESTRATOR;
    default:
      return 'unknown';
  }
}

/**
 * Check if a tool belongs to a specific layer
 */
export function isLayerTool(toolName: string, layer: Layer): boolean {
  switch (layer) {
    case LAYERS.MCP:
      return toolName.startsWith(TOOL_PREFIXES.MCP);
    case LAYERS.SDK:
      return toolName.startsWith(TOOL_PREFIXES.SDK);
    case LAYERS.ORCHESTRATOR:
      return !toolName.startsWith(TOOL_PREFIXES.MCP) &&
             !toolName.startsWith(TOOL_PREFIXES.SDK);
    default:
      return false;
  }
}
