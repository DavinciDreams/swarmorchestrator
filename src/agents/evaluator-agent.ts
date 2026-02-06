/**
 * Evaluator Agent - Specialized for quality assessment and feedback
 * Mirrors SunBurpBot's evaluator for consistent quality control
 */

import { BaseAgent, AgentConfig } from "./base-agent.js";
import { getProjectContextString } from "../utils/project-context.js";
import type { TaskType } from "./task-agent.js";

export interface EvaluationCriteria {
  name: string;
  description: string;
  weight: number;
}

export interface EvaluationResult {
  score: number;
  feedback: string[];
  passedCriteria: string[];
  failedCriteria: string[];
  recommendations: string[];
}

export interface TaskEvaluation {
  taskId: string;
  evaluation: EvaluationResult;
  timestamp: Date;
  evaluatorId: string;
}

/** Task types that should use document-oriented evaluation criteria */
const DOCUMENT_TASK_TYPES: Set<string> = new Set([
  "research", "documentation",
]);

const CODE_CRITERIA: EvaluationCriteria[] = [
  { name: "Completeness", description: "All requirements addressed", weight: 0.25 },
  { name: "Correctness", description: "Implementation is accurate", weight: 0.25 },
  { name: "Quality", description: "Code quality and best practices", weight: 0.2 },
  { name: "Security", description: "No security vulnerabilities", weight: 0.15 },
  { name: "Performance", description: "Efficient implementation", weight: 0.15 },
];

const DOCUMENT_CRITERIA: EvaluationCriteria[] = [
  { name: "Completeness", description: "All required topics and sections are covered", weight: 0.25 },
  { name: "Accuracy", description: "Facts, claims, and references are correct and well-sourced", weight: 0.25 },
  { name: "Structure", description: "Logical organization, clear headings, smooth flow between sections", weight: 0.2 },
  { name: "Clarity", description: "Writing is clear, concise, and accessible to the target audience", weight: 0.15 },
  { name: "Depth", description: "Sufficient analysis, synthesis, and insight beyond surface-level coverage", weight: 0.15 },
];

const DEFAULT_CRITERIA = CODE_CRITERIA;

export class EvaluatorAgent extends BaseAgent {
  private criteria: EvaluationCriteria[];

  constructor(config?: Partial<AgentConfig>, criteria?: EvaluationCriteria[]) {
    super("evaluator-agent", {
      model: "haiku",
      maxTokens: 4096,
      allowedTools: ["Read", "Grep"],
      permissionMode: "bypassPermissions",
      ...config,
    });

    this.criteria = criteria || DEFAULT_CRITERIA;
  }

  /**
   * Evaluate task output against requirements.
   * When taskType is provided, criteria are automatically selected to match
   * the output type (e.g. research/documentation use document criteria).
   */
  async evaluateTask(
    taskId: string,
    taskDescription: string,
    requirements: string[],
    outputPath: string,
    taskType?: TaskType
  ): Promise<TaskEvaluation> {
    const activeCriteria = this.resolveCriteria(taskType);
    const systemPrompt = this.buildSystemPrompt(activeCriteria, taskType);
    const userPrompt = this.buildEvaluationPrompt(taskDescription, requirements, outputPath);

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    const evaluation = this.parseEvaluation(response, requirements);

    return {
      taskId,
      evaluation,
      timestamp: new Date(),
      evaluatorId: this.getName(),
    };
  }

  /**
   * Evaluate code quality
   */
  async evaluateCodeQuality(filePath: string): Promise<EvaluationResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Evaluate the code quality of: ${filePath}

Read the file and assess against these criteria:
1. Code organization and structure
2. Naming conventions
3. Error handling
4. Documentation/comments
5. Testability
6. Security considerations

Provide a quality score (0.0-1.0) and specific feedback.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseEvaluation(response, []);
  }

  /**
   * Evaluate swarm output quality
   */
  async evaluateSwarmOutput(
    swarmId: string,
    expectedOutput: string,
    actualOutput: string
  ): Promise<EvaluationResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Evaluate swarm output quality:

Swarm ID: ${swarmId}

Expected Output:
${expectedOutput}

Actual Output:
${actualOutput}

Compare the outputs and assess:
1. Accuracy - Does actual match expected?
2. Completeness - Are all requirements met?
3. Quality - Is the output well-formed?
4. Consistency - Is it internally consistent?

Provide a score (0.0-1.0) and detailed feedback.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseEvaluation(response, []);
  }

  /**
   * Generate improvement suggestions appropriate to the task type.
   * For research/documentation tasks, suggestions focus on content quality
   * rather than code quality.
   */
  async generateImprovementSuggestions(
    evaluation: EvaluationResult,
    taskType?: TaskType
  ): Promise<string[]> {
    if (evaluation.score >= 0.9) {
      return ["Output meets quality standards. No significant improvements needed."];
    }

    const activeCriteria = this.resolveCriteria(taskType);
    const systemPrompt = this.buildSystemPrompt(activeCriteria, taskType);

    const contextNote = DOCUMENT_TASK_TYPES.has(taskType || "")
      ? "This is a document/research output — suggestions must focus on content, structure, accuracy, and clarity. Do NOT suggest code changes, unit tests, input validation, security hardening, or other software engineering practices."
      : "";

    const userPrompt = `Based on this evaluation, generate improvement suggestions:

Score: ${evaluation.score}
Failed Criteria: ${evaluation.failedCriteria.join(", ") || "None"}
Feedback:
${evaluation.feedback.map((f) => `- ${f}`).join("\n")}

${contextNote}

Provide specific, actionable suggestions to address each failed criterion.
Prioritize by impact and ease of implementation.`;

    const response = await this.executeWithContext(systemPrompt, userPrompt);
    return this.parseSuggestions(response);
  }

  /**
   * Set custom evaluation criteria
   */
  setCriteria(criteria: EvaluationCriteria[]): void {
    this.criteria = criteria;
  }

  /**
   * Get current criteria
   */
  getCriteria(): EvaluationCriteria[] {
    return [...this.criteria];
  }

  /**
   * Select the right criteria set for the given task type.
   * If custom criteria were set via setCriteria(), those always take priority.
   * Otherwise, document task types get DOCUMENT_CRITERIA and everything else gets CODE_CRITERIA.
   */
  private resolveCriteria(taskType?: string): EvaluationCriteria[] {
    // Custom criteria set by the caller always win
    if (this.criteria !== DEFAULT_CRITERIA) {
      return this.criteria;
    }
    if (taskType && DOCUMENT_TASK_TYPES.has(taskType)) {
      return DOCUMENT_CRITERIA;
    }
    return CODE_CRITERIA;
  }

  private buildSystemPrompt(
    activeCriteria?: EvaluationCriteria[],
    taskType?: string
  ): string {
    let projectContext = "";
    try {
      projectContext = getProjectContextString();
    } catch {
      // Project root not set
    }

    const criteria = activeCriteria || this.criteria;
    const criteriaList = criteria
      .map((c) => `- ${c.name} (${(c.weight * 100).toFixed(0)}%): ${c.description}`)
      .join("\n");

    const isDocumentTask = taskType && DOCUMENT_TASK_TYPES.has(taskType);

    const roleDescription = isDocumentTask
      ? `You are a Document Quality Evaluation Agent responsible for assessing research and documentation outputs.

IMPORTANT: You are evaluating a written document, NOT source code. All feedback and recommendations
must be about the document's content, structure, accuracy, clarity, and depth. Do NOT suggest
code-related improvements such as input validation, unit tests, error handling, security hardening,
performance optimization, API endpoints, linting, or any software engineering practices.`
      : `You are a Quality Evaluation Agent responsible for assessing task outputs and providing constructive feedback.`;

    return `${roleDescription}

${projectContext}

Evaluation Criteria:
${criteriaList}

Your responsibilities:
1. Objectively evaluate outputs against requirements
2. Provide specific, actionable feedback
3. Calculate weighted quality scores
4. Identify areas for improvement
5. Generate improvement recommendations

Response format for evaluations:
SCORE: <0.0-1.0>
PASSED: <comma-separated list of passed criteria>
FAILED: <comma-separated list of failed criteria>
FEEDBACK:
- <specific feedback item 1>
- <specific feedback item 2>
RECOMMENDATIONS:
- <improvement suggestion 1>
- <improvement suggestion 2>`;
  }

  private buildEvaluationPrompt(
    taskDescription: string,
    requirements: string[],
    outputPath: string
  ): string {
    return `Evaluate the task output:

TASK: ${taskDescription}

REQUIREMENTS:
${requirements.map((r) => `- ${r}`).join("\n")}

OUTPUT PATH: ${outputPath}

First, read the output file using the Read tool.
Then evaluate against the criteria and requirements.
Provide your evaluation in the specified format.`;
  }

  private parseEvaluation(response: string, requirements: string[]): EvaluationResult {
    const lines = response.split("\n");
    let score = 0.7; // Default score
    const passedCriteria: string[] = [];
    const failedCriteria: string[] = [];
    const feedback: string[] = [];
    const recommendations: string[] = [];

    let currentSection = "";

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("SCORE:")) {
        const scoreMatch = trimmed.match(/SCORE:\s*([\d.]+)/);
        if (scoreMatch) {
          score = parseFloat(scoreMatch[1]);
        }
      } else if (trimmed.startsWith("PASSED:")) {
        const passed = trimmed.substring("PASSED:".length).trim();
        passedCriteria.push(...passed.split(",").map((s) => s.trim()).filter((s) => s));
      } else if (trimmed.startsWith("FAILED:")) {
        const failed = trimmed.substring("FAILED:".length).trim();
        failedCriteria.push(...failed.split(",").map((s) => s.trim()).filter((s) => s));
      } else if (trimmed === "FEEDBACK:") {
        currentSection = "feedback";
      } else if (trimmed === "RECOMMENDATIONS:") {
        currentSection = "recommendations";
      } else if (trimmed.startsWith("-")) {
        const item = trimmed.substring(1).trim();
        if (currentSection === "feedback") {
          feedback.push(item);
        } else if (currentSection === "recommendations") {
          recommendations.push(item);
        }
      }
    }

    // Clamp score between 0 and 1
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      feedback,
      passedCriteria,
      failedCriteria,
      recommendations,
    };
  }

  private parseSuggestions(response: string): string[] {
    const suggestions: string[] = [];
    const lines = response.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("-") || trimmed.match(/^\d+\./)) {
        const suggestion = trimmed.replace(/^[-\d.]+\s*/, "").trim();
        if (suggestion) {
          suggestions.push(suggestion);
        }
      }
    }

    return suggestions.length > 0 ? suggestions : ["Review the evaluation feedback and address failed criteria."];
  }
}
