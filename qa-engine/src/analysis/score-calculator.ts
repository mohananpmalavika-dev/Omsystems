/**
 * QA Score Calculator
 *
 * Implements weighted scoring across 8 operational pillars:
 * 1. Availability / Navigation (25%)
 * 2. Functional UI (20%)
 * 3. API Reliability (20%)
 * 4. Console Stability (10%)
 * 5. Performance (10%)
 * 6. Accessibility (5%)
 * 7. Responsive UI (5%)
 * 8. Coverage (5%)
 */

import type { QAScoreBreakdown } from "../types/qa.types";

export interface ScoreInput {
  criticalIssues: number;
  majorIssues: number;
  minorIssues: number;
  brokenNavCount: number;
  blankPagesCount: number;
  apiFailuresCount: number;
  consoleErrorsCount: number;
  averageLoadTimeMs: number;
  accessibilityIssuesCount: number;
  responsiveIssuesCount?: number;
  pageCoveragePct: number;
  interactionCoveragePct: number;
}

export class ScoreCalculator {
  /**
   * Calculate subscores and overall score (0 to 100)
   */
  static calculate(input: ScoreInput): { overallScore: number; breakdown: QAScoreBreakdown } {
    // 1. Availability & Navigation (25%)
    let availability = 100;
    availability -= input.brokenNavCount * 25;
    availability -= input.blankPagesCount * 30;
    availability = Math.max(0, Math.min(100, availability));

    // 2. Functional UI (20%)
    let functionalUi = 100;
    functionalUi -= input.criticalIssues * 20;
    functionalUi -= input.majorIssues * 8;
    functionalUi = Math.max(0, Math.min(100, functionalUi));

    // 3. API Reliability (20%)
    let apiReliability = 100;
    apiReliability -= input.apiFailuresCount * 10;
    apiReliability = Math.max(0, Math.min(100, apiReliability));

    // 4. Console Stability (10%)
    let consoleStability = 100;
    consoleStability -= input.consoleErrorsCount * 5;
    consoleStability = Math.max(0, Math.min(100, consoleStability));

    // 5. Performance (10%)
    let performance = 100;
    if (input.averageLoadTimeMs > 8000) {
      performance = 40;
    } else if (input.averageLoadTimeMs > 4000) {
      performance = 65;
    } else if (input.averageLoadTimeMs > 2000) {
      performance = 85;
    }
    performance = Math.max(0, Math.min(100, performance));

    // 6. Accessibility (5%)
    let accessibility = 100;
    accessibility -= input.accessibilityIssuesCount * 2;
    accessibility = Math.max(0, Math.min(100, accessibility));

    // 7. Responsive UI (5%)
    let responsiveUi = 100;
    if (input.responsiveIssuesCount) {
      responsiveUi -= input.responsiveIssuesCount * 15;
    }
    responsiveUi = Math.max(0, Math.min(100, responsiveUi));

    // 8. Coverage (5%)
    const coverage = Math.round((input.pageCoveragePct * 0.6) + (input.interactionCoveragePct * 0.4));

    const breakdown: QAScoreBreakdown = {
      availabilityNavigation: availability,
      functionalUi,
      apiReliability,
      consoleStability,
      performance,
      accessibility,
      responsiveUi,
      coverage,
    };

    // Calculate weighted sum
    const weightedSum =
      availability * 0.25 +
      functionalUi * 0.20 +
      apiReliability * 0.20 +
      consoleStability * 0.10 +
      performance * 0.10 +
      accessibility * 0.05 +
      responsiveUi * 0.05 +
      coverage * 0.05;

    // Severe critical issues cap maximum score
    let overallScore = Math.round(weightedSum);
    if (input.criticalIssues > 0) {
      overallScore = Math.min(overallScore, Math.max(20, 85 - input.criticalIssues * 15));
    }

    overallScore = Math.max(0, Math.min(100, overallScore));

    return { overallScore, breakdown };
  }
}
