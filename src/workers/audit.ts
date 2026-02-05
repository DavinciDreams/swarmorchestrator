/**
 * Swarm-Based Security Audit Worker
 *
 * Instead of analyzing the entire codebase in one shot (which times out),
 * this worker:
 * 1. Chunks the codebase by directory/complexity
 * 2. Spawns security-focused agents to analyze each chunk
 * 3. Aggregates findings into a unified security report
 */

import { createSwarmWorker, chunkByDirectory, type WorkerResult } from "./base.js";
import { callMcpTool } from "../mcp/client.js";
import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";

export interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  file: string;
  line?: number;
  description: string;
  recommendation?: string;
}

export interface AuditResult {
  status: "clean" | "warning" | "critical";
  riskScore: number;
  findings: SecurityFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  chunksAnalyzed: number;
  timestamp: string;
}

/**
 * Creates a swarm-based security audit worker
 */
export async function AuditWorker(projectRoot: string) {
  const worker = await createSwarmWorker({
    name: "audit",
    model: "sonnet", // Use sonnet for security analysis - haiku is too weak
    maxConcurrency: 4, // 4 parallel security agents
    chunkTimeoutMs: 180000, // 3 min per chunk
    topology: "hierarchical", // Queen coordinates security findings
  });

  return {
    /**
     * Run full security audit using swarm
     */
    async run(): Promise<AuditResult> {
      console.log("[audit] Starting swarm-based security audit...");

      // 1. Gather all source files
      const sourceFiles = await gatherSourceFiles(projectRoot);
      console.log(`[audit] Found ${sourceFiles.length} source files to analyze`);

      if (sourceFiles.length === 0) {
        return {
          status: "clean",
          riskScore: 0,
          findings: [],
          summary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
          chunksAnalyzed: 0,
          timestamp: new Date().toISOString(),
        };
      }

      // 2. Chunk by directory for parallel analysis
      const chunks = chunkByDirectory(sourceFiles, 8); // 8 files per chunk max
      console.log(`[audit] Split into ${chunks.length} chunks for parallel analysis`);

      // 3. Initialize swarm
      const swarmId = await worker.initSwarm();
      console.log(`[audit] Initialized security swarm: ${swarmId}`);

      try {
        // 4. Process chunks in parallel
        const result = await worker.processChunks(chunks, async (chunk, idx) => {
          return analyzeChunk(chunk, idx, projectRoot);
        });

        // 5. Aggregate findings
        const aggregated = aggregateFindings(result);
        console.log(`[audit] Audit complete: ${aggregated.summary.total} findings`);

        // 6. Store results
        await worker.storeResults(`audit-${Date.now()}`, aggregated);

        // 7. Shutdown swarm
        await worker.shutdown(swarmId);

        return aggregated;
      } catch (err) {
        console.error("[audit] Audit failed:", err);
        await worker.shutdown(swarmId).catch(() => {});
        throw err;
      }
    },
  };
}

/**
 * Gather all source files in the project
 */
async function gatherSourceFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];
  const extensions = [".ts", ".js", ".tsx", ".jsx", ".mjs", ".cjs"];
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
          if (extensions.includes(ext)) {
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
 * Analyze a chunk of files for security issues
 */
async function analyzeChunk(
  files: string[],
  chunkIndex: number,
  projectRoot: string,
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  for (const filePath of files) {
    try {
      const content = await readFile(filePath, "utf-8");
      const relativePath = path.relative(projectRoot, filePath);
      const lines = content.split("\n");

      // Run security checks
      findings.push(...checkHardcodedSecrets(relativePath, lines));
      findings.push(...checkInjectionVulns(relativePath, lines));
      findings.push(...checkInsecurePatterns(relativePath, lines));
    } catch {
      // Skip unreadable files
    }
  }

  // Also dispatch to swarm agent for deeper analysis if chunk is complex
  if (files.length > 3) {
    const fileList = files.map((f) => path.relative(projectRoot, f)).join(", ");
    try {
      const result = await callMcpTool("coordination_orchestrate", {
        task: `Analyze these files for security vulnerabilities: ${fileList}.
               Look for: hardcoded secrets, SQL injection, XSS, command injection,
               insecure deserialization, path traversal. Return JSON array of findings.`,
        strategy: "parallel",
        timeout: 60000,
      });
      // Parse and merge swarm findings
      const parsed = safeParseFindings(result);
      findings.push(...parsed);
    } catch {
      // Continue with static analysis results
    }
  }

  return findings;
}

/**
 * Check for hardcoded secrets
 */
function checkHardcodedSecrets(file: string, lines: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const patterns = [
    { regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/i, type: "hardcoded-password" },
    { regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]+['"]/i, type: "hardcoded-api-key" },
    { regex: /(?:secret|token)\s*[:=]\s*['"][^'"]+['"]/i, type: "hardcoded-secret" },
    { regex: /(?:private[_-]?key)\s*[:=]/i, type: "hardcoded-private-key" },
    { regex: /sk-[a-zA-Z0-9]{20,}/i, type: "exposed-openai-key" },
    { regex: /sk-ant-[a-zA-Z0-9-]+/i, type: "exposed-anthropic-key" },
  ];

  lines.forEach((line, idx) => {
    // Skip comments and example files
    if (line.trim().startsWith("//") || line.trim().startsWith("#")) return;
    if (file.includes(".example") || file.includes(".sample")) return;

    for (const { regex, type } of patterns) {
      if (regex.test(line)) {
        findings.push({
          severity: type.includes("key") ? "critical" : "high",
          type,
          file,
          line: idx + 1,
          description: `Potential ${type.replace(/-/g, " ")} detected`,
          recommendation: "Use environment variables instead of hardcoding secrets",
        });
      }
    }
  });

  return findings;
}

/**
 * Check for injection vulnerabilities
 */
function checkInjectionVulns(file: string, lines: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const patterns = [
    { regex: /eval\s*\([^)]*\$/, type: "code-injection", severity: "critical" as const },
    { regex: /exec\s*\([^)]*\+/, type: "command-injection", severity: "critical" as const },
    { regex: /spawn\s*\([^)]*\+/, type: "command-injection", severity: "high" as const },
    { regex: /innerHTML\s*=/, type: "xss-risk", severity: "medium" as const },
    { regex: /dangerouslySetInnerHTML/, type: "xss-risk", severity: "medium" as const },
    { regex: /\.query\s*\([^)]*\+/, type: "sql-injection", severity: "critical" as const },
    { regex: /\.execute\s*\([^)]*\+/, type: "sql-injection", severity: "critical" as const },
  ];

  lines.forEach((line, idx) => {
    for (const { regex, type, severity } of patterns) {
      if (regex.test(line)) {
        findings.push({
          severity,
          type,
          file,
          line: idx + 1,
          description: `Potential ${type.replace(/-/g, " ")} vulnerability`,
          recommendation: "Use parameterized queries and input validation",
        });
      }
    }
  });

  return findings;
}

/**
 * Check for other insecure patterns
 */
function checkInsecurePatterns(file: string, lines: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  lines.forEach((line, idx) => {
    // Insecure randomness
    if (/Math\.random\(\)/.test(line) && /(?:token|key|secret|password)/i.test(line)) {
      findings.push({
        severity: "medium",
        type: "insecure-randomness",
        file,
        line: idx + 1,
        description: "Math.random() used for security-sensitive operation",
        recommendation: "Use crypto.randomBytes() or crypto.randomUUID()",
      });
    }

    // Disabled security
    if (/rejectUnauthorized\s*:\s*false/.test(line)) {
      findings.push({
        severity: "high",
        type: "ssl-verification-disabled",
        file,
        line: idx + 1,
        description: "SSL certificate verification disabled",
        recommendation: "Enable SSL verification in production",
      });
    }

    // CORS wildcard
    if (/(?:Access-Control-Allow-Origin|cors).*\*/.test(line)) {
      findings.push({
        severity: "medium",
        type: "cors-wildcard",
        file,
        line: idx + 1,
        description: "CORS allows all origins",
        recommendation: "Restrict CORS to specific trusted domains",
      });
    }
  });

  return findings;
}

/**
 * Safely parse findings from swarm response
 */
function safeParseFindings(response: string): SecurityFinding[] {
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (f) =>
          f &&
          typeof f.severity === "string" &&
          typeof f.type === "string" &&
          typeof f.file === "string",
      );
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Aggregate findings from all chunks
 */
function aggregateFindings(result: WorkerResult): AuditResult {
  const allFindings: SecurityFinding[] = [];

  for (const chunk of result.results) {
    if (chunk.success && Array.isArray(chunk.data)) {
      allFindings.push(...(chunk.data as SecurityFinding[]));
    }
  }

  // Deduplicate by file+line+type
  const seen = new Set<string>();
  const dedupedFindings = allFindings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Calculate summary
  const summary = {
    critical: dedupedFindings.filter((f) => f.severity === "critical").length,
    high: dedupedFindings.filter((f) => f.severity === "high").length,
    medium: dedupedFindings.filter((f) => f.severity === "medium").length,
    low: dedupedFindings.filter((f) => f.severity === "low").length,
    total: dedupedFindings.length,
  };

  // Calculate risk score (0-100)
  const riskScore = Math.min(
    100,
    summary.critical * 25 + summary.high * 10 + summary.medium * 3 + summary.low,
  );

  // Determine status
  let status: AuditResult["status"] = "clean";
  if (summary.critical > 0 || riskScore > 50) {
    status = "critical";
  } else if (summary.high > 0 || riskScore > 20) {
    status = "warning";
  }

  return {
    status,
    riskScore,
    findings: dedupedFindings,
    summary,
    chunksAnalyzed: result.completedChunks,
    timestamp: new Date().toISOString(),
  };
}
