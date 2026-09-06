import { describe, it, expect } from "vitest";
import { PageFingerprintEngine } from "../../qa-engine/src/crawler/page-fingerprint.js";
import { CrawlQueue } from "../../qa-engine/src/crawler/crawl-queue.js";
import { CoverageCalculator } from "../../qa-engine/src/analysis/coverage-calculator.js";
import { ScoreCalculator } from "../../qa-engine/src/analysis/score-calculator.js";
import { IssueClassifier } from "../../qa-engine/src/analysis/issue-classifier.js";

describe("QA Crawler - Page Fingerprint Engine", () => {
  const engine = new PageFingerprintEngine();

  it("should strip volatile query parameters like timestamps and cachebusters", () => {
    const raw1 = "https://demo.kryptonlogic.com/cameras?branch=101&_=1720000000";
    const raw2 = "https://demo.kryptonlogic.com/cameras?_=1729999999&branch=101";

    const norm1 = engine.normalizeUrl(raw1);
    const norm2 = engine.normalizeUrl(raw2);

    expect(norm1.normalizedPath).toBe("/cameras");
    expect(norm1.normalizedUrl).toBe(norm2.normalizedUrl);
    expect(norm1.normalizedUrl).not.toContain("_=");
  });

  it("should normalize trailing slashes consistently", () => {
    const withSlash = engine.normalizeUrl("https://demo.kryptonlogic.com/alerts/");
    const withoutSlash = engine.normalizeUrl("https://demo.kryptonlogic.com/alerts");

    expect(withSlash.normalizedPath).toBe("/alerts");
    expect(withSlash.normalizedUrl).toBe(withoutSlash.normalizedUrl);
  });
});

describe("QA Crawler - Crawl Queue Prioritization & Limits", () => {
  it("should prioritize navigation over buttons and forms", () => {
    const queue = new CrawlQueue({ maxPages: 50, maxDepth: 5 });

    // Enqueue in mixed order
    queue.enqueue({
      id: "action-form",
      sourcePageUrl: "/cameras",
      depth: 1,
      actionType: "form_submit",
      selector: "form",
      label: "Search form",
      category: "form",
    });

    queue.enqueue({
      id: "action-button",
      sourcePageUrl: "/cameras",
      depth: 1,
      actionType: "click",
      selector: "button",
      label: "Action button",
      category: "button",
    });

    queue.enqueue({
      id: "action-nav",
      sourcePageUrl: "/dashboard",
      depth: 1,
      actionType: "click",
      selector: "nav a",
      label: "Cameras Nav",
      category: "nav",
    });

    // Highest priority (nav) should pop first
    const first = queue.dequeue();
    expect(first?.category).toBe("nav");

    const second = queue.dequeue();
    expect(second?.category).toBe("button");

    const third = queue.dequeue();
    expect(third?.category).toBe("form");
  });

  it("should enforce maxDepth limit", () => {
    const queue = new CrawlQueue({ maxDepth: 2 });
    const enqueued = queue.enqueue({
      id: "deep-action",
      sourcePageUrl: "/page-3",
      depth: 3,
      actionType: "click",
      selector: "a",
      label: "Deep link",
      category: "link",
    });

    expect(enqueued).toBe(false);
  });

  it("should detect queue exhaustion when limits are met", () => {
    const queue = new CrawlQueue({ maxPages: 2 });
    queue.markPageVisited("/page-1");
    queue.markPageVisited("/page-2");

    expect(queue.isExhausted()).toBe(true);
    expect(queue.getExhaustionReason()).toContain("maximum page limit");
  });
});

describe("QA Analysis - Coverage Calculator", () => {
  it("should accurately calculate page and interaction coverage percentages", () => {
    const coverage = CoverageCalculator.calculate({
      pagesDiscovered: 100,
      pagesTested: 92,
      interactiveDiscovered: 500,
      interactiveTested: 410,
      safetyBlockedCount: 15,
    });

    expect(coverage.pageCoveragePct).toBe(92);
    expect(coverage.interactionCoveragePct).toBe(82);
    expect(coverage.safetyBlockedCount).toBe(15);
  });
});

describe("QA Analysis - Score Calculator", () => {
  it("should compute high score for clean run with good timings", () => {
    const result = ScoreCalculator.calculate({
      criticalIssues: 0,
      majorIssues: 0,
      minorIssues: 2,
      brokenNavCount: 0,
      blankPagesCount: 0,
      apiFailuresCount: 0,
      consoleErrorsCount: 0,
      averageLoadTimeMs: 1200,
      accessibilityIssuesCount: 2,
      pageCoveragePct: 95,
      interactionCoveragePct: 90,
    });

    expect(result.overallScore).toBeGreaterThanOrEqual(90);
    expect(result.breakdown.availabilityNavigation).toBe(100);
    expect(result.breakdown.apiReliability).toBe(100);
  });

  it("should penalize score when critical defects are present", () => {
    const result = ScoreCalculator.calculate({
      criticalIssues: 3,
      majorIssues: 5,
      minorIssues: 4,
      brokenNavCount: 1,
      blankPagesCount: 1,
      apiFailuresCount: 4,
      consoleErrorsCount: 8,
      averageLoadTimeMs: 4500,
      accessibilityIssuesCount: 10,
      pageCoveragePct: 70,
      interactionCoveragePct: 60,
    });

    expect(result.overallScore).toBeLessThan(60);
  });
});

describe("QA Analysis - Issue Classifier", () => {
  it("should deduplicate identical occurrences and format standard IDs", () => {
    const classifier = new IssueClassifier();

    const i1 = classifier.recordApiFailure("run-1", "/cameras", "/api/cameras", 500, 950);
    const i2 = classifier.recordApiFailure("run-1", "/cameras", "/api/cameras", 500, 1100);

    expect(i1.id).toBe("QA-ISSUE-001");
    expect(i2.id).toBe("QA-ISSUE-001");
    expect(i2.occurrences).toBe(2);
    expect(classifier.getAllIssues().length).toBe(1);
    expect(classifier.getCounts().critical).toBe(2);
  });
});
