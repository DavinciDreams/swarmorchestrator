/**
 * Swarm-Based Codebase Mapping Worker
 *
 * Maps the codebase structure using swarm agents to:
 * 1. Index files and their relationships
 * 2. Build dependency graphs
 * 3. Identify entry points and hot paths
 */

import { createSwarmWorker, chunkByDirectory } from "./base.js";
import * as fs from "node:fs";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";

export interface FileInfo {
  path: string;
  lines: number;
  imports: string[];
  exports: string[];
  type: "source" | "config" | "test" | "docs";
}

export interface CodebaseMap {
  files: FileInfo[];
  entryPoints: string[];
  dependencies: Record<string, string[]>;
  modules: string[];
  timestamp: string;
}

export async function MapWorker(projectRoot: string) {
  const worker = await createSwarmWorker({
    name: "map",
    model: "haiku", // Mapping is simpler, haiku is fine
    maxConcurrency: 6,
    chunkTimeoutMs: 60000, // 1 min per chunk
    topology: "mesh", // Peer-to-peer for parallel file processing
  });

  return {
    async run(): Promise<CodebaseMap> {
      console.log("[map] Starting swarm-based codebase mapping...");

      // 1. Gather all files
      const allFiles = await gatherAllFiles(projectRoot);
      console.log(`[map] Found ${allFiles.length} files to map`);

      if (allFiles.length === 0) {
        return {
          files: [],
          entryPoints: [],
          dependencies: {},
          modules: [],
          timestamp: new Date().toISOString(),
        };
      }

      // 2. Chunk by directory
      const chunks = chunkByDirectory(allFiles, 15);
      console.log(`[map] Split into ${chunks.length} chunks`);

      // 3. Initialize swarm
      const swarmId = await worker.initSwarm();

      try {
        // 4. Process chunks
        const result = await worker.processChunks(chunks, async (chunk) => {
          return mapChunk(chunk, projectRoot);
        });

        // 5. Aggregate
        const aggregated = aggregateMap(result, projectRoot);
        console.log(`[map] Mapped ${aggregated.files.length} files`);

        // 6. Store results
        await worker.storeResults(`map-${Date.now()}`, aggregated);

        // 7. Also store in metrics for statusline
        const metricsPath = path.join(projectRoot, ".claude-flow/metrics/codebase-map.json");
        await mkdir(path.dirname(metricsPath), { recursive: true });
        await writeFile(metricsPath, JSON.stringify(aggregated, null, 2));

        await worker.shutdown(swarmId);
        return aggregated;
      } catch (err) {
        console.error("[map] Mapping failed:", err);
        await worker.shutdown(swarmId).catch(() => {});
        throw err;
      }
    },
  };
}

async function gatherAllFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];
  const ignoreDirs = ["node_modules", ".git", "dist", "build", ".next", "coverage", ".claude-flow"];

  async function walk(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name) && !entry.name.startsWith(".")) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip inaccessible
    }
  }

  await walk(projectRoot);
  return files;
}

async function mapChunk(files: string[], projectRoot: string): Promise<FileInfo[]> {
  const mapped: FileInfo[] = [];

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const relativePath = path.relative(projectRoot, filePath);
      const lines = content.split("\n").length;

      // Determine file type
      let type: FileInfo["type"] = "source";
      if (filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("__tests__")) {
        type = "test";
      } else if (filePath.endsWith(".md") || filePath.endsWith(".txt")) {
        type = "docs";
      } else if (
        filePath.includes("config") ||
        filePath.endsWith(".json") ||
        filePath.endsWith(".yaml") ||
        filePath.endsWith(".yml")
      ) {
        type = "config";
      }

      // Extract imports
      const imports: string[] = [];
      const importRegex = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }

      // Extract exports
      const exports: string[] = [];
      const exportRegex = /export\s+(?:default\s+)?(?:const|let|var|function|class|type|interface)\s+(\w+)/g;
      while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }

      mapped.push({
        path: relativePath,
        lines,
        imports,
        exports,
        type,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return mapped;
}

function aggregateMap(result: any, projectRoot: string): CodebaseMap {
  const allFiles: FileInfo[] = [];

  for (const chunk of result.results) {
    if (chunk.success && Array.isArray(chunk.data)) {
      allFiles.push(...(chunk.data as FileInfo[]));
    }
  }

  // Build dependency graph
  const dependencies: Record<string, string[]> = {};
  for (const file of allFiles) {
    dependencies[file.path] = file.imports.filter((imp) => !imp.startsWith(".") === false);
  }

  // Find entry points (files not imported by others)
  const importedFiles = new Set<string>();
  for (const file of allFiles) {
    for (const imp of file.imports) {
      if (imp.startsWith(".")) {
        const resolved = resolveImport(file.path, imp);
        importedFiles.add(resolved);
      }
    }
  }

  const entryPoints = allFiles
    .filter((f) => f.type === "source" && !importedFiles.has(f.path))
    .map((f) => f.path);

  // Extract module directories
  const modules = [...new Set(allFiles.map((f) => f.path.split("/")[0]))].filter(
    (m) => !m.includes("."),
  );

  return {
    files: allFiles,
    entryPoints,
    dependencies,
    modules,
    timestamp: new Date().toISOString(),
  };
}

function resolveImport(fromFile: string, importPath: string): string {
  const fromDir = path.dirname(fromFile);
  let resolved = path.join(fromDir, importPath);

  // Try common extensions
  for (const ext of ["", ".ts", ".js", ".tsx", ".jsx", "/index.ts", "/index.js"]) {
    const candidate = resolved + ext;
    if (candidate.endsWith(".ts") || candidate.endsWith(".js")) {
      return candidate;
    }
  }

  return resolved;
}
