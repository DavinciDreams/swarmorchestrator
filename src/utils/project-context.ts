/**
 * Project Context Utility
 *
 * Provides project scoping and path validation for the orchestrator.
 * Ensures all tasks stay within the designated project boundary.
 */

import * as path from "node:path";

let _projectRoot: string | null = null;

/**
 * Set the project root for the current session.
 * All path operations will be validated against this root.
 */
export function setProjectRoot(root: string): void {
  _projectRoot = path.resolve(root);
}

/**
 * Get the current project root.
 * Throws if not set.
 */
export function getProjectRoot(): string {
  if (!_projectRoot) {
    throw new Error(
      "Project root not set. Call setProjectRoot() before using project context."
    );
  }
  return _projectRoot;
}

/**
 * Check if a path is within the project root.
 * Returns true if the path is a child of the project root.
 */
export function isWithinProject(targetPath: string): boolean {
  if (!_projectRoot) return false;
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(_projectRoot);
}

/**
 * Validate that a path is within the project root.
 * Throws if the path is outside the project boundary.
 */
export function validatePath(targetPath: string): string {
  const root = getProjectRoot();
  const resolved = path.resolve(targetPath);

  if (!resolved.startsWith(root)) {
    throw new Error(
      `SCOPE VIOLATION: Path "${resolved}" is outside project boundary.\n` +
      `Project root: ${root}\n` +
      `All tasks must operate within the project directory.`
    );
  }

  return resolved;
}

/**
 * Convert an absolute path to a relative path from project root.
 * Returns the original path if it's already relative or outside the project.
 */
export function toRelativePath(absolutePath: string): string {
  if (!_projectRoot) return absolutePath;
  const resolved = path.resolve(absolutePath);
  if (resolved.startsWith(_projectRoot)) {
    return path.relative(_projectRoot, resolved) || ".";
  }
  return absolutePath;
}

/**
 * Convert a relative path to an absolute path from project root.
 */
export function toAbsolutePath(relativePath: string): string {
  const root = getProjectRoot();
  if (path.isAbsolute(relativePath)) {
    return validatePath(relativePath);
  }
  return path.join(root, relativePath);
}

/**
 * Extract paths from a task description and validate them.
 * Returns an array of paths found in the text.
 */
export function extractAndValidatePaths(text: string): {
  valid: string[];
  invalid: string[];
} {
  // Match common path patterns
  const pathPatterns = [
    /(?:^|[\s"'`])(\/?(?:home|usr|var|tmp|etc|opt)\/[^\s"'`]+)/g,
    /(?:^|[\s"'`])(\.{1,2}\/[^\s"'`]+)/g,
    /(?:^|[\s"'`])([a-zA-Z]:\\[^\s"'`]+)/g,
  ];

  const found = new Set<string>();

  for (const pattern of pathPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      found.add(match[1]);
    }
  }

  const valid: string[] = [];
  const invalid: string[] = [];

  for (const p of found) {
    try {
      validatePath(p);
      valid.push(p);
    } catch {
      invalid.push(p);
    }
  }

  return { valid, invalid };
}

/**
 * Generate a project context string for including in task descriptions.
 */
export function getProjectContextString(): string {
  const root = getProjectRoot();
  return (
    `PROJECT CONTEXT:\n` +
    `- Project Root: ${root}\n` +
    `- All file operations must stay within this directory\n` +
    `- Use relative paths from project root when possible\n`
  );
}
