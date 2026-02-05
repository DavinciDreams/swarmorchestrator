/**
 * Swarm-Based Test Coverage Gap Worker
 *
 * Analyzes the codebase to identify files and exports missing test coverage:
 * 1. Matches source files to corresponding test files
 * 2. Identifies exported functions/classes without test references
 * 3. Flags shallow test files with few assertions
 * 4. Chunks work across swarm agents for parallel analysis
 */

import { createSwarmWorker, chunkByDirectory, type WorkerResult } from "./base.js";
import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";

export interface TestGap {
  file: string;
  type: "no-test-file" | "missing-export-test" | "shallow-tests";
  priority: "high" | "medium" | "low";
  description: string;
  exports?: string[];
  testFile?: string;
  assertionCount?: number;
}

export interface TestGapsResult {
  gaps: TestGap[];
  summary: {
    totalSourceFiles: number;
    testedFiles: number;
    untestedFiles: number;
    coveragePercent: number;
    missingExportTests: number;
    shallowTestFiles: number;
  };
  priorityFiles: string[];
  timestamp: string;
}

/**
 * Creates a swarm-based test coverage gap worker
 */
export async function TestGapsWorker(projectRoot: string) {
  const worker = await createSwarmWorker({
    name: "testgaps",
    model: "sonnet",
    maxConcurrency: 4,
    chunkTimeoutMs: 120000,
    topology: "hierarchical-mesh",
  });

  return {
    async run(): Promise<TestGapsResult> {
      console.log("[testgaps] Starting swarm-based test coverage analysis...");

      // 1. Gather source and test files
      const sourceFiles = await gatherSourceFiles(projectRoot);
      const testFiles = await gatherTestFiles(projectRoot);
      console.log(`[testgaps] Found ${sourceFiles.length} source files, ${testFiles.length} test files`);

      if (sourceFiles.length === 0) {
        return {
          gaps: [],
          summary: {
            totalSourceFiles: 0,
            testedFiles: 0,
            untestedFiles: 0,
            coveragePercent: 100,
            missingExportTests: 0,
            shallowTestFiles: 0,
          },
          priorityFiles: [],
          timestamp: new Date().toISOString(),
        };
      }

      // 2. Build test file lookup for matching
      const testFileSet = new Set(testFiles.map((f) => path.relative(projectRoot, f)));

      // 3. Chunk source files for parallel analysis
      const chunks = chunkByDirectory(sourceFiles, 8);
      console.log(`[testgaps] Split into ${chunks.length} chunks`);

      // 4. Initialize swarm
      const swarmId = await worker.initSwarm();

      try {
        // 5. Process chunks in parallel
        const result = await worker.processChunks(chunks, async (chunk) => {
          return analyzeChunk(chunk, projectRoot, testFileSet);
        });

        // 6. Aggregate
        const aggregated = aggregateGaps(result, sourceFiles.length);
        console.log(
          `[testgaps] Analysis complete: ${aggregated.summary.untestedFiles} untested files, ` +
            `${aggregated.summary.coveragePercent.toFixed(0)}% coverage`,
        );

        // 7. Store and cleanup
        await worker.storeResults(`testgaps-${Date.now()}`, aggregated);
        await worker.shutdown(swarmId);

        return aggregated;
      } catch (err) {
        console.error("[testgaps] Test gap analysis failed:", err);
        await worker.shutdown(swarmId).catch(() => {});
        throw err;
      }
    },
  };
}

/**
 * Gather all source files (excluding tests, configs, generated)
 */
async function gatherSourceFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];
  const extensions = [".ts", ".js", ".tsx", ".jsx"];
  const ignoreDirs = ["node_modules", ".git", "dist", "build", ".next", "coverage", "__tests__"];

  async function walk(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (
            extensions.includes(ext) &&
            !isTestFile(entry.name) &&
            !isConfigFile(entry.name)
          ) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await walk(projectRoot);
  return files;
}

/**
 * Gather all test files
 */
async function gatherTestFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];
  const extensions = [".ts", ".js", ".tsx", ".jsx"];
  const ignoreDirs = ["node_modules", ".git", "dist", "build", ".next", "coverage"];

  async function walk(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext) && isTestFile(entry.name)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await walk(projectRoot);
  return files;
}

function isTestFile(filename: string): boolean {
  return (
    filename.includes(".test.") ||
    filename.includes(".spec.") ||
    filename.includes("__test__")
  );
}

function isConfigFile(filename: string): boolean {
  const configs = [
    "jest.config",
    "vitest.config",
    "tsconfig",
    "eslint",
    ".eslintrc",
    "prettier",
    ".prettierrc",
    "babel.config",
    "webpack.config",
    "vite.config",
    "rollup.config",
    "next.config",
  ];
  return configs.some((c) => filename.includes(c));
}

/**
 * Analyze a chunk of source files for test coverage gaps
 */
async function analyzeChunk(
  files: string[],
  projectRoot: string,
  testFileSet: Set<string>,
): Promise<TestGap[]> {
  const gaps: TestGap[] = [];

  for (const filePath of files) {
    try {
      const relativePath = path.relative(projectRoot, filePath);
      const content = await readFile(filePath, "utf-8");

      // 1. Check if a corresponding test file exists
      const testPath = findTestFile(relativePath, testFileSet);
      if (!testPath) {
        const exports = extractExports(content);
        gaps.push({
          file: relativePath,
          type: "no-test-file",
          priority: exports.length > 3 ? "high" : exports.length > 0 ? "medium" : "low",
          description: `No test file found for ${relativePath} (${exports.length} exports)`,
          exports,
        });
        continue;
      }

      // 2. Check if exports are referenced in the test file
      const testContent = await safeReadFile(path.join(projectRoot, testPath));
      if (testContent) {
        const exports = extractExports(content);
        const untestedExports = exports.filter(
          (e) => !testContent.includes(e),
        );
        if (untestedExports.length > 0) {
          gaps.push({
            file: relativePath,
            type: "missing-export-test",
            priority: untestedExports.length > 2 ? "high" : "medium",
            description: `${untestedExports.length}/${exports.length} exports not referenced in tests`,
            exports: untestedExports,
            testFile: testPath,
          });
        }

        // 3. Check for shallow tests
        const assertionCount = countAssertions(testContent);
        if (assertionCount < 2 && exports.length > 1) {
          gaps.push({
            file: relativePath,
            type: "shallow-tests",
            priority: "medium",
            description: `Test file has only ${assertionCount} assertion(s) for ${exports.length} exports`,
            testFile: testPath,
            assertionCount,
          });
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return gaps;
}

/**
 * Find the test file for a given source file
 */
function findTestFile(sourcePath: string, testFileSet: Set<string>): string | null {
  const ext = path.extname(sourcePath);
  const base = sourcePath.slice(0, -ext.length);

  // Common test file patterns
  const candidates = [
    `${base}.test${ext}`,
    `${base}.spec${ext}`,
    // __tests__ directory
    path.join(path.dirname(sourcePath), "__tests__", path.basename(base) + ext),
    path.join(path.dirname(sourcePath), "__tests__", path.basename(base) + `.test${ext}`),
    // tests/ sibling directory
    sourcePath.replace(/^src\//, "tests/").replace(ext, `.test${ext}`),
    sourcePath.replace(/^src\//, "test/").replace(ext, `.test${ext}`),
  ];

  for (const candidate of candidates) {
    if (testFileSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Extract exported names from a source file
 */
function extractExports(content: string): string[] {
  const exports: string[] = [];
  const seen = new Set<string>();

  // export function name
  const funcPattern = /export\s+(?:async\s+)?function\s+(\w+)/g;
  // export const/let/var name
  const constPattern = /export\s+(?:const|let|var)\s+(\w+)/g;
  // export class name
  const classPattern = /export\s+class\s+(\w+)/g;
  // export interface/type name
  const typePattern = /export\s+(?:interface|type)\s+(\w+)/g;
  // export default
  const defaultPattern = /export\s+default\s+(?:function|class)?\s*(\w+)?/g;

  for (const pattern of [funcPattern, constPattern, classPattern, typePattern, defaultPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      if (name && !seen.has(name)) {
        seen.add(name);
        exports.push(name);
      }
    }
  }

  return exports;
}

/**
 * Count assertions in a test file
 */
function countAssertions(testContent: string): number {
  const patterns = [
    /expect\s*\(/g,
    /assert\s*[\.(]/g,
    /\.toBe\s*\(/g,
    /\.toEqual\s*\(/g,
    /\.toMatch\s*\(/g,
    /\.toThrow\s*\(/g,
    /\.toContain\s*\(/g,
    /\.toHaveBeenCalled/g,
    /\.rejects\./g,
    /\.resolves\./g,
  ];

  let count = 0;
  for (const pattern of patterns) {
    const matches = testContent.match(pattern);
    if (matches) count += matches.length;
  }

  // Avoid double-counting (expect(...).toBe() counts as 1, not 2)
  const expectCount = (testContent.match(/expect\s*\(/g) || []).length;
  return Math.max(count - expectCount, expectCount);
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Aggregate gaps from all chunks
 */
function aggregateGaps(result: WorkerResult, totalSourceFiles: number): TestGapsResult {
  const allGaps: TestGap[] = [];

  for (const chunk of result.results) {
    if (chunk.success && Array.isArray(chunk.data)) {
      allGaps.push(...(chunk.data as TestGap[]));
    }
  }

  const untestedFiles = allGaps.filter((g) => g.type === "no-test-file").length;
  const testedFiles = totalSourceFiles - untestedFiles;
  const coveragePercent = totalSourceFiles > 0 ? (testedFiles / totalSourceFiles) * 100 : 100;

  const summary = {
    totalSourceFiles,
    testedFiles,
    untestedFiles,
    coveragePercent,
    missingExportTests: allGaps.filter((g) => g.type === "missing-export-test").length,
    shallowTestFiles: allGaps.filter((g) => g.type === "shallow-tests").length,
  };

  // Priority files: high-priority gaps sorted by export count
  const priorityFiles = allGaps
    .filter((g) => g.priority === "high")
    .sort((a, b) => (b.exports?.length ?? 0) - (a.exports?.length ?? 0))
    .slice(0, 10)
    .map((g) => g.file);

  return {
    gaps: allGaps,
    summary,
    priorityFiles,
    timestamp: new Date().toISOString(),
  };
}
