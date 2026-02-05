/**
 * Parameter Utilities
 *
 * Helper functions for handling optional parameters in tool calls.
 */

/**
 * Filters out undefined values from an object, creating a clean params object
 * for spreading into function arguments.
 *
 * This eliminates the need for repeated `...(param ? { param } : {})` patterns.
 *
 * @example
 * // Before:
 * callTool({
 *   required,
 *   ...(optional1 ? { optional1 } : {}),
 *   ...(optional2 ? { optional2 } : {}),
 * });
 *
 * // After:
 * callTool({
 *   required,
 *   ...optionalParams({ optional1, optional2 }),
 * });
 *
 * @param obj - Object with potentially undefined values
 * @returns New object with only defined values
 */
export function optionalParams<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
