/**
 * Evaluator Agent - Dynamic quality assessment with coordination-aware feedback
 *
 * Instead of hardcoded criteria sets, the evaluator infers appropriate evaluation
 * criteria from the task description and output format (e.g. marketing campaign,
 * philosophical argument, API code, research paper). Feedback is shaped by
 * recommendations from the agent coordination system (reputation scores,
 * historical patterns) rather than generated in isolation.
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

/** Context supplied by the agent coordination system to shape evaluation feedback. */
export interface CoordinationContext {
  /** Reputation score (0-1) of the agent that produced the output */
  agentReputationScore?: number;
  /** Names of historical patterns that matched this task */
  appliedPatterns?: string[];
  /** Free-form recommendations from the coordination layer */
  coordinatorRecommendations?: string[];
}

export class EvaluatorAgent extends BaseAgent {
  private criteriaOverride: EvaluationCriteria[] | null;

  constructor(config?: Partial<AgentConfig>, criteria?: EvaluationCriteria[]) {
    super("evaluator-agent", {
      model: "haiku",
      maxTokens: 4096,
      allowedTools: ["Read", "Grep"],
      permissionMode: "bypassPermissions",
      ...config,
    });

    this.criteriaOverride = criteria ?? null;
  }

  /**
   * Evaluate task output against dynamically inferred criteria.
   *
   * The evaluator analyses the task description to determine the output format
   * (code, marketing copy, philosophical essay, API design, etc.) and generates
   * evaluation criteria tailored to that format.  When a `CoordinationContext`
   * is provided the feedback incorporates reputation data and pattern
   * recommendations from the coordination layer.
   */
  async evaluateTask(
    taskId: string,
    taskDescription: string,
    requirements: string[],
    outputPath: string,
    taskType?: TaskType,
    coordination?: CoordinationContext
  ): Promise<TaskEvaluation> {
    // If the caller set explicit criteria, use those; otherwise infer dynamically
    const activeCriteria = this.criteriaOverride
      ?? await this.inferCriteria(taskDescription, taskType);

    const systemPrompt = this.buildSystemPrompt(activeCriteria, coordination);
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
    const systemPrompt = this.buildSystemPrompt(await this.inferCriteria(`code file: ${filePath}`));
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
    const systemPrompt = this.buildSystemPrompt(await this.inferCriteria(`swarm output comparison`));
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
   * Set custom evaluation criteria (overrides dynamic inference)
   */
  setCriteria(criteria: EvaluationCriteria[]): void {
    this.criteriaOverride = criteria;
  }

  /**
   * Clear custom criteria override, reverting to dynamic inference.
   */
  clearCriteriaOverride(): void {
    this.criteriaOverride = null;
  }

  /**
   * Get current criteria override, or null if using dynamic inference.
   */
  getCriteriaOverride(): EvaluationCriteria[] | null {
    return this.criteriaOverride ? [...this.criteriaOverride] : null;
  }

  /**
   * Dynamically infer evaluation criteria from the task description.
   *
   * Asks the LLM to classify the output format and return 3-6 weighted
   * criteria appropriate for that format. Falls back to a sensible default
   * if parsing fails.
   */
  private async inferCriteria(
    taskDescription: string,
    taskType?: string
  ): Promise<EvaluationCriteria[]> {
    const prompt = `Given this task, determine the output format and return evaluation criteria.

TASK TYPE: ${taskType ?? "unknown"}
TASK: ${taskDescription}

First identify the output format (e.g. source code, marketing campaign, philosophical argument,
research paper, API design, creative writing, business plan, technical documentation, data analysis, etc.).

Then return 3-6 evaluation criteria as a JSON array. Each criterion needs:
- "name": short label
- "description": what it measures
- "weight": number between 0 and 1 (all weights must sum to 1.0)

Choose criteria that genuinely matter for this specific output format.
For example a marketing campaign needs Persuasiveness and Audience Fit,
while a philosophical argument needs Logical Validity and Conceptual Clarity.

Respond ONLY with the JSON array, no other text.`;

    try {
      const response = await this.executeWithContext(
        "You are a criteria-inference engine. Return ONLY a valid JSON array.",
        prompt
      );
      const parsed = JSON.parse(this.extractJson(response));
      if (Array.isArray(parsed) && parsed.length >= 2) {
        // Validate and normalise weights
        const total = parsed.reduce((s: number, c: { weight?: number }) => s + (c.weight ?? 0), 0);
        return parsed.map((c: { name?: string; description?: string; weight?: number }) => ({
          name: String(c.name ?? "Unnamed"),
          description: String(c.description ?? ""),
          weight: total > 0 ? (c.weight ?? 0) / total : 1 / parsed.length,
        }));
      }
    } catch {
      // Fall through to default
    }

    // Sensible fallback when inference fails
    return [
      { name: "Completeness", description: "All requirements addressed", weight: 0.3 },
      { name: "Correctness", description: "Output is accurate and valid", weight: 0.3 },
      { name: "Quality", description: "Well-crafted and appropriate for the format", weight: 0.2 },
      { name: "Coherence", description: "Internally consistent and logically structured", weight: 0.2 },
    ];
  }

  /**
   * Extract a JSON array from a response that may contain markdown fences or preamble.
   */
  private extractJson(response: string): string {
    // Try to find a JSON array in the response
    const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) return arrayMatch[0];
    return response.trim();
  }

  private buildSystemPrompt(
    activeCriteria?: EvaluationCriteria[],
    coordination?: CoordinationContext
  ): string {
    let projectContext = "";
    try {
      projectContext = getProjectContextString();
    } catch {
      // Project root not set
    }

    const criteria = activeCriteria ?? [
      { name: "Completeness", description: "All requirements addressed", weight: 0.3 },
      { name: "Correctness", description: "Output is accurate and valid", weight: 0.3 },
      { name: "Quality", description: "Well-crafted and appropriate", weight: 0.2 },
      { name: "Coherence", description: "Internally consistent", weight: 0.2 },
    ];
    const criteriaList = criteria
      .map((c) => `- ${c.name} (${(c.weight * 100).toFixed(0)}%): ${c.description}`)
      .join("\n");

    // Build coordination context section when available
    let coordinationSection = "";
    if (coordination) {
      const parts: string[] = [];
      if (coordination.agentReputationScore !== undefined) {
        parts.push(
          `Agent reputation score: ${coordination.agentReputationScore.toFixed(2)} — ` +
          `${coordination.agentReputationScore >= 0.7 ? "trusted agent, focus on output quality" : "lower-trust agent, scrutinise correctness carefully"}.`
        );
      }
      if (coordination.appliedPatterns?.length) {
        parts.push(`Historical patterns applied: ${coordination.appliedPatterns.join(", ")}.`);
      }
      if (coordination.coordinatorRecommendations?.length) {
        parts.push(
          "Coordinator recommendations (incorporate into your feedback):\n" +
          coordination.coordinatorRecommendations.map((r) => `  - ${r}`).join("\n")
        );
      }
      if (parts.length) {
        coordinationSection = `\nCoordination Context:\n${parts.join("\n")}\n`;
      }
    }

    return `You are a Quality Evaluation Agent. Your evaluation criteria are dynamically tailored
to the specific output format of this task. Evaluate the output ONLY against the criteria listed
below — do not import criteria from other domains.

${projectContext}

Evaluation Criteria:
${criteriaList}
${coordinationSection}
Your responsibilities:
1. Objectively evaluate outputs against the listed criteria and requirements
2. Provide specific, actionable feedback appropriate to the output format
3. Calculate weighted quality scores
4. When coordination context is provided, incorporate those recommendations into your feedback

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
