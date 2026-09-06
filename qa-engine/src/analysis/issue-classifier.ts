/**
 * Issue Classifier
 *
 * Normalizes, prioritizes, and classifies QA issues into standardized findings.
 */

import type { QAIssue, QASeverity, QAIssueCategory } from "../types/qa.types.js";

export class IssueClassifier {
  private issueIndex = 0;
  private issues: Map<string, QAIssue> = new Map();

  /**
   * Register a new issue or increment occurrence of an identical issue
   */
  recordIssue(issue: Omit<QAIssue, "id" | "occurrences" | "firstSeenAt" | "createdAt">): QAIssue {
    const dedupKey = `${issue.severity}:${issue.category}:${issue.pageUrl}:${issue.title.slice(0, 100)}`;
    const existing = this.issues.get(dedupKey);

    if (existing) {
      existing.occurrences++;
      return existing;
    }

    this.issueIndex++;
    const id = `QA-ISSUE-${String(this.issueIndex).padStart(3, "0")}`;
    const now = new Date().toISOString();

    const newIssue: QAIssue = {
      ...issue,
      id,
      occurrences: 1,
      firstSeenAt: now,
      createdAt: now,
    };

    this.issues.set(dedupKey, newIssue);
    return newIssue;
  }

  /**
   * Helper to create issue from failed API call
   */
  recordApiFailure(runId: string, pageUrl: string, endpoint: string, status: number, durationMs: number): QAIssue {
    const isCritical = status >= 500;
    const severity: QASeverity = isCritical ? "CRITICAL" : "MAJOR";

    return this.recordIssue({
      runId,
      severity,
      category: "API_FAILURE",
      title: `API returned HTTP ${status} for ${endpoint}`,
      pageUrl,
      expected: "HTTP 200 OK with valid JSON response",
      actual: `HTTP ${status} failure in ${durationMs}ms`,
      details: { endpoint, status, durationMs },
    });
  }

  /**
   * Helper to create issue from console error
   */
  recordConsoleError(runId: string, pageUrl: string, errorText: string, stack?: string): QAIssue {
    const isUncaughtCrash = /uncaught|typeerror|referenceerror/i.test(errorText);
    const severity: QASeverity = isUncaughtCrash ? "MAJOR" : "MINOR";

    return this.recordIssue({
      runId,
      severity,
      category: "CONSOLE_ERROR",
      title: `JavaScript exception: ${errorText.slice(0, 120)}`,
      pageUrl,
      expected: "Clean console execution without uncaught exceptions",
      actual: errorText.slice(0, 300),
      details: { stack },
    });
  }

  /**
   * Helper to record broken navigation / 404
   */
  recordBrokenNavigation(
    runId: string,
    fromPage: string,
    action: string,
    destination: string,
    reason: string
  ): QAIssue {
    return this.recordIssue({
      runId,
      severity: "MAJOR",
      category: "BROKEN_NAVIGATION",
      title: `Broken Navigation to ${destination}`,
      pageUrl: destination,
      actionDescription: `Action on ${fromPage}: ${action}`,
      expected: "Destination page loads successfully without error screens",
      actual: reason,
      details: { fromPage, action, destination },
    });
  }

  /**
   * Helper to record blank screen
   */
  recordBlankPage(runId: string, pageUrl: string, reason: string): QAIssue {
    return this.recordIssue({
      runId,
      severity: "CRITICAL",
      category: "BLANK_PAGE",
      title: `Blank or Crashed Page detected on ${pageUrl}`,
      pageUrl,
      expected: "Meaningful interactive content renders within grace period",
      actual: reason,
    });
  }

  /**
   * Helper to record blocked destructive action
   */
  recordBlockedDestructive(runId: string, pageUrl: string, elementText: string, reason: string): QAIssue {
    return this.recordIssue({
      runId,
      severity: "CRITICAL",
      category: "DESTRUCTIVE_BLOCKED",
      title: `Safety Engine blocked execution of destructive action: "${elementText}"`,
      pageUrl,
      actionDescription: `Attempted action: "${elementText}"`,
      expected: "Action blocked by automated safety policy",
      actual: reason,
    });
  }

  /**
   * Return all classified issues
   */
  getAllIssues(): QAIssue[] {
    return Array.from(this.issues.values());
  }

  /**
   * Return counts by severity
   */
  getCounts(): { critical: number; major: number; minor: number } {
    let critical = 0;
    let major = 0;
    let minor = 0;

    for (const issue of this.issues.values()) {
      if (issue.severity === "CRITICAL") critical += issue.occurrences;
      else if (issue.severity === "MAJOR") major += issue.occurrences;
      else minor += issue.occurrences;
    }

    return { critical, major, minor };
  }
}
