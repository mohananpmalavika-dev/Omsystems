/**
 * Coverage Calculator
 *
 * Calculates Page Coverage, Interaction Coverage, Navigation Coverage,
 * and categorizes reasons for unvisited or untested components.
 */

export interface CoverageStats {
  pagesDiscovered: number;
  pagesTested: number;
  pageCoveragePct: number;
  interactiveDiscovered: number;
  interactiveTested: number;
  interactionCoveragePct: number;
  safetyBlockedCount: number;
  permissionDeniedCount: number;
}

export class CoverageCalculator {
  /**
   * Calculate coverage percentages
   */
  static calculate(data: {
    pagesDiscovered: number;
    pagesTested: number;
    interactiveDiscovered: number;
    interactiveTested: number;
    safetyBlockedCount?: number;
    permissionDeniedCount?: number;
  }): CoverageStats {
    const pageCoveragePct =
      data.pagesDiscovered > 0
        ? Math.round((data.pagesTested / data.pagesDiscovered) * 1000) / 10
        : 100;

    const interactionCoveragePct =
      data.interactiveDiscovered > 0
        ? Math.round((data.interactiveTested / data.interactiveDiscovered) * 1000) / 10
        : 100;

    return {
      pagesDiscovered: data.pagesDiscovered,
      pagesTested: data.pagesTested,
      pageCoveragePct: Math.min(100, Math.max(0, pageCoveragePct)),
      interactiveDiscovered: data.interactiveDiscovered,
      interactiveTested: data.interactiveTested,
      interactionCoveragePct: Math.min(100, Math.max(0, interactionCoveragePct)),
      safetyBlockedCount: data.safetyBlockedCount ?? 0,
      permissionDeniedCount: data.permissionDeniedCount ?? 0,
    };
  }
}
