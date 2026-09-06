/**
 * QA Run Master Worker
 *
 * Coordinates the full end-to-end automated crawling, recording,
 * discovery, safety inspection, accessibility audit, and report generation.
 */

import { EventEmitter } from "node:events";
import type { Page, BrowserContext, Browser } from "@playwright/test";
import type {
  QARunConfig,
  QARunStatus,
  QARunProgressEvent,
  QAPageNode,
  QAFlowEdge,
  QAActionItem,
} from "../types/qa.types.js";
import { BrowserManager } from "../browser/browser-manager.js";
import { LoginDetector } from "../auth/login-detector.js";
import { LoginExecutor } from "../auth/login-executor.js";
import { AuthValidator } from "../auth/auth-validator.js";
import { UrlPolicy } from "../safety/url-policy.js";
import { DestructiveActionClassifier } from "../safety/destructive-action-classifier.js";
import { FormClassifier } from "../safety/form-classifier.js";
import { PageFingerprintEngine } from "../crawler/page-fingerprint.js";
import { CrawlQueue } from "../crawler/crawl-queue.js";
import { ElementDiscovery } from "../discovery/element-discovery.js";
import { TabDiscovery } from "../discovery/tab-discovery.js";
import { DialogDiscovery } from "../discovery/dialog-discovery.js";
import { ConsoleCollector } from "../collectors/console-collector.js";
import { NetworkCollector } from "../collectors/network-collector.js";
import { PerformanceCollector } from "../collectors/performance-collector.js";
import { ScreenshotManager } from "../recorder/screenshot-manager.js";
import { VideoRecorder } from "../recorder/video-recorder.js";
import { TraceManager } from "../recorder/trace-manager.js";
import { AxeRunner } from "../accessibility/axe-runner.js";
import { BlankPageDetector } from "../analysis/blank-page-detector.js";
import { BrokenNavigationDetector } from "../analysis/broken-navigation-detector.js";
import { IssueClassifier } from "../analysis/issue-classifier.js";
import { CoverageCalculator } from "../analysis/coverage-calculator.js";
import { ScoreCalculator } from "../analysis/score-calculator.js";
import { HtmlReportGenerator } from "../reporting/html-report.js";
import { JsonReportGenerator } from "../reporting/json-report.js";
import { ArtifactStorage } from "../storage/artifact-storage.js";

export class QARunWorker extends EventEmitter {
  public status: QARunStatus = "QUEUED";
  public isPaused = false;
  public isCancelled = false;

  private config: QARunConfig;
  private browserManager: BrowserManager;
  private storage: ArtifactStorage;
  private urlPolicy: UrlPolicy;
  private safetyClassifier: DestructiveActionClassifier;
  private formClassifier: FormClassifier;
  private fingerprintEngine: PageFingerprintEngine;
  private crawlQueue: CrawlQueue;
  private elementDiscovery: ElementDiscovery;
  private tabDiscovery: TabDiscovery;
  private dialogDiscovery: DialogDiscovery;
  private consoleCollector: ConsoleCollector;
  private networkCollector: NetworkCollector;
  private performanceCollector: PerformanceCollector;
  private screenshotManager: ScreenshotManager;
  private videoRecorder: VideoRecorder;
  private traceManager: TraceManager;
  private axeRunner: AxeRunner;
  private blankDetector: BlankPageDetector;
  private brokenNavDetector: BrokenNavigationDetector;
  private issueClassifier: IssueClassifier;

  // Run artifacts & entities
  private pageNodes: Map<string, QAPageNode> = new Map();
  private flowEdges: QAFlowEdge[] = [];
  private executedActions: QAActionItem[] = [];
  private totalDiscoveredInteractive = 0;
  private totalTestedInteractive = 0;
  private safetyBlockedCount = 0;

  constructor(config: QARunConfig) {
    super();
    this.config = config;
    this.storage = new ArtifactStorage(config.id);
    this.browserManager = new BrowserManager();
    this.urlPolicy = new UrlPolicy(
      config.targetUrl,
      config.options?.allowedDomains,
      config.options?.blockedPaths
    );
    this.safetyClassifier = new DestructiveActionClassifier(config.options?.allowedDestructive);
    this.formClassifier = new FormClassifier();
    this.fingerprintEngine = new PageFingerprintEngine();
    this.crawlQueue = new CrawlQueue({
      maxPages: config.maxPages ?? 250,
      maxDepth: config.maxDepth ?? 10,
      maxActions: config.options?.maxActions ?? 1000,
      maxRuntimeMs: (config.pageTimeoutSec ?? 30) * 1000 * 100,
    });
    this.elementDiscovery = new ElementDiscovery();
    this.tabDiscovery = new TabDiscovery();
    this.dialogDiscovery = new DialogDiscovery();
    this.consoleCollector = new ConsoleCollector();
    this.networkCollector = new NetworkCollector();
    this.performanceCollector = new PerformanceCollector();
    this.screenshotManager = new ScreenshotManager(this.storage.directory);
    this.videoRecorder = new VideoRecorder(this.storage.directory);
    this.traceManager = new TraceManager(this.storage.directory);
    this.axeRunner = new AxeRunner();
    this.blankDetector = new BlankPageDetector();
    this.brokenNavDetector = new BrokenNavigationDetector();
    this.issueClassifier = new IssueClassifier();
  }

  /**
   * Emit progress event
   */
  private emitProgress(
    type: QARunProgressEvent["type"],
    message: string,
    currentPage?: string,
    currentAction?: string
  ): void {
    const issuesCount = this.issueClassifier.getCounts();
    const event: QARunProgressEvent = {
      runId: this.config.id,
      type,
      status: this.status,
      message,
      currentPage,
      currentAction,
      pagesDiscovered: this.crawlQueue.visitedPageCount + this.crawlQueue.size,
      pagesTested: this.pageNodes.size,
      actionsExecuted: this.executedActions.length,
      issuesCount,
      timestamp: new Date().toISOString(),
    };
    this.emit("progress", event);
  }

  /**
   * Pause execution
   */
  pause(): void {
    this.isPaused = true;
    this.status = "PAUSED";
    this.emitProgress("status", "Audit paused by administrator");
  }

  /**
   * Resume execution
   */
  resume(): void {
    this.isPaused = false;
    this.status = "CRAWLING";
    this.emitProgress("status", "Audit resumed by administrator");
  }

  /**
   * Cancel execution and kill browser processes
   */
  async cancel(): Promise<void> {
    this.isCancelled = true;
    this.status = "CANCELLED";
    this.emitProgress("status", "Audit cancelled by administrator");
    await this.browserManager.close();
  }

  /**
   * Main Execution Entry Point
   */
  async execute(): Promise<{
    status: QARunStatus;
    score: number;
    issuesCount: { critical: number; major: number; minor: number };
    summary: any;
    error?: string;
  }> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // 1. STARTING
      this.status = "STARTING";
      this.emitProgress("status", "Initializing browser engine and isolated context...");

      const launched = await this.browserManager.launch({
        browserType: this.config.browser || "chromium",
        deviceProfile: this.config.deviceProfile || "Desktop 1920x1080",
        recordVideo: this.config.options?.recordVideo ?? true,
        videoDir: this.videoRecorder.directory,
        enableTrace: this.config.options?.captureTrace ?? true,
        timeoutMs: (this.config.pageTimeoutSec ?? 30) * 1000,
      });

      browser = launched.browser;
      context = launched.context;
      page = launched.page;

      // Attach collectors
      this.consoleCollector.attach(page);
      this.networkCollector.attach(page);

      // 2. AUTHENTICATING
      this.status = "AUTHENTICATING";
      const startUrl = new URL(this.config.startingPath || "/", this.config.targetUrl).toString();
      this.emitProgress("status", `Navigating to target ${startUrl}...`, startUrl);

      const navResponse = await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch((e) => {
        this.issueClassifier.recordBrokenNavigation(this.config.id, "Root", "Initial Navigation", startUrl, e.message);
        return null;
      });

      // Screenshot after initial arrival
      if (this.config.options?.captureScreenshots ?? true) {
        await this.screenshotManager.capture(page, { label: "initial-landing" });
      }

      // Detect login
      const loginDetector = new LoginDetector();
      const loginSignals = await loginDetector.detect(page, this.config.options?.loginSelectorsOverride);

      if (loginSignals.isLoginPage && this.config.username && this.config.password) {
        this.emitProgress("status", "Login page detected. Submitting credentials...", page.url(), "Login Submission");

        const executor = new LoginExecutor();
        await executor.execute(
          page,
          loginSignals,
          { username: this.config.username, password: this.config.password },
          (this.config.options?.authTimeoutSec ?? 15) * 1000
        );

        const validator = new AuthValidator();
        const authResult = await validator.validate(
          page,
          context,
          startUrl,
          (this.config.options?.authTimeoutSec ?? 15) * 1000
        );

        if (!authResult.isAuthenticated) {
          this.status = "FAILED";
          this.emitProgress("error", `Authentication blocker: ${authResult.status} - ${authResult.message}`);
          this.issueClassifier.recordIssue({
            runId: this.config.id,
            severity: "CRITICAL",
            category: "AUTH_ERROR",
            title: `Authentication Failed: ${authResult.status}`,
            pageUrl: page.url(),
            expected: "Successful authentication leading to application dashboard",
            actual: authResult.message,
          });
          await this.finishAndGenerateReports(page);
          return {
            status: "FAILED",
            score: 20,
            issuesCount: this.issueClassifier.getCounts(),
            summary: null,
            error: authResult.message,
          };
        }

        this.emitProgress("status", "Authentication verified successfully!", page.url());
        if (this.config.options?.captureScreenshots ?? true) {
          await this.screenshotManager.capture(page, { label: "dashboard-authenticated" });
        }
      }

      // 3. CRAWLING
      this.status = "CRAWLING";
      const rootUrl = page.url();
      this.crawlQueue.markPageVisited(rootUrl);

      // Inspect initial page
      await this.processCurrentPage(page, rootUrl, 0);

      // BFS exploration loop
      while (this.crawlQueue.size > 0 && !this.crawlQueue.isExhausted() && !this.isCancelled) {
        // Handle pause
        while (this.isPaused && !this.isCancelled) {
          await new Promise((r) => setTimeout(r, 500));
        }
        if (this.isCancelled) break;

        const nextAction = this.crawlQueue.dequeue();
        if (!nextAction) break;

        const delay = this.config.options?.crawlDelayMs ?? 150;
        if (delay > 0) await page.waitForTimeout(delay);

        await this.executeAction(page, nextAction);
      }

      // 4. ANALYZING
      this.status = "ANALYZING";
      this.emitProgress("status", "Analyzing crawler telemetry, issues, and coverage...");

      // 5. GENERATING_REPORT
      this.status = "GENERATING_REPORT";
      this.emitProgress("status", "Generating audit artifacts, session video, trace, and HTML reports...");

      this.status = "COMPLETED";
      const result = await this.finishAndGenerateReports(page);
      this.emitProgress("completed", `QA Audit completed! Overall Score: ${result.score}/100`);

      return {
        ...result,
        status: "COMPLETED",
      };
    } catch (err: any) {
      console.error("[QARunWorker] Run error:", err);
      this.status = "FAILED";
      this.emitProgress("error", `Crawler error: ${err.message}`);
      return {
        status: "FAILED",
        score: 0,
        issuesCount: this.issueClassifier.getCounts(),
        summary: null,
        error: err.message,
      };
    } finally {
      await this.browserManager.close();
    }
  }

  /**
   * Process and index a visited page
   */
  private async processCurrentPage(page: Page, currentUrl: string, depth: number): Promise<QAPageNode> {
    this.consoleCollector.setCurrentPage(currentUrl);
    this.networkCollector.setCurrentPage(currentUrl);

    const title = await page.title().catch(() => "Untitled");
    const fingerprint = await this.fingerprintEngine.generate(page);

    // Measure performance
    const perf = await this.performanceCollector.measurePage(page, this.config.id);

    // Check for blank page
    const blankCheck = await this.blankDetector.check(page, 1500);
    if (blankCheck.isBlank) {
      this.issueClassifier.recordBlankPage(this.config.id, currentUrl, blankCheck.reason || "Blank screen");
    }

    // Check broken navigation
    const brokenNav = await this.brokenNavDetector.check(page);
    if (brokenNav.isBroken) {
      this.issueClassifier.recordBrokenNavigation(
        this.config.id,
        "Previous Page",
        "Navigation",
        currentUrl,
        brokenNav.reason || "Error page"
      );
    }

    // Run accessibility audit
    if (this.config.options?.detectAccessibility ?? true) {
      await this.axeRunner.runAudit(page, this.config.id);
    }

    // Capture screenshot of new page
    let screenshotPath = "";
    if (this.config.options?.captureScreenshots ?? true) {
      screenshotPath = await this.screenshotManager.capture(page, {
        label: title || fingerprint.normalizedPath,
      });
    }

    // Discover interactive elements
    const elements = await this.elementDiscovery.discover(page);
    this.totalDiscoveredInteractive += elements.length;

    const pageNode: QAPageNode = {
      id: `page-${this.pageNodes.size + 1}`,
      runId: this.config.id,
      url: currentUrl,
      path: fingerprint.normalizedPath,
      title,
      pageHash: fingerprint.structuralHash,
      depth,
      status: brokenNav.isBroken ? "FAILED" : blankCheck.isBlank ? "FAILED" : "TESTED",
      loadTimeMs: perf.loadMs,
      domContentLoadedMs: perf.domContentLoadedMs,
      networkIdleMs: perf.networkIdleMs,
      isBlank: blankCheck.isBlank,
      screenshotPath,
      elementCount: blankCheck.elementCount,
      interactiveCount: elements.length,
      testedInteractiveCount: 0,
      discoveredAt: new Date().toISOString(),
      crawledAt: new Date().toISOString(),
    };

    this.pageNodes.set(currentUrl, pageNode);
    this.emitProgress("page_crawled", `Visited: ${title} (${fingerprint.normalizedPath})`, currentUrl);

    // Enqueue newly discovered safe actions & links
    if (this.config.options?.autoDiscover ?? true) {
      for (const el of elements) {
        // Enforce safety engine
        const safety = this.safetyClassifier.classify({
          text: el.text,
          ariaLabel: el.ariaLabel,
          role: el.role,
          href: el.href,
        });

        if (safety.classification === "DESTRUCTIVE") {
          this.safetyBlockedCount++;
          this.issueClassifier.recordBlockedDestructive(
            this.config.id,
            currentUrl,
            el.text || el.ariaLabel || "Button",
            safety.reason || "Destructive action blocked"
          );
          continue;
        }

        // Form check
        if (el.category === "form") {
          const formSafety = this.formClassifier.classify({
            submitButtonText: el.text,
          });
          if (!formSafety.canSubmit) continue;
        }

        // URL Policy check for links
        if (el.href) {
          const evalUrl = this.urlPolicy.evaluate(el.href, currentUrl);
          if (!evalUrl.isAllowed) continue;
          if (this.crawlQueue.isPageVisited(evalUrl.normalizedUrl)) continue;

          this.crawlQueue.enqueue({
            id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sourcePageUrl: currentUrl,
            targetUrl: evalUrl.normalizedUrl,
            depth: depth + 1,
            actionType: "click",
            selector: el.selector,
            label: el.text || el.ariaLabel || "Link",
            role: el.role,
            category: el.category,
          });
        } else if (el.category === "tab" || el.category === "button" || el.category === "dialog") {
          // Interactive controls on current page
          this.crawlQueue.enqueue({
            id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            sourcePageUrl: currentUrl,
            depth: depth + 1,
            actionType: el.category === "tab" ? "tab_switch" : el.category === "dialog" ? "dialog_open" : "click",
            selector: el.selector,
            label: el.text || el.ariaLabel || "Control",
            role: el.role,
            category: el.category,
          });
        }
      }
    }

    return pageNode;
  }

  /**
   * Execute an enqueued action
   */
  private async executeAction(page: Page, action: any): Promise<void> {
    const fromUrl = page.url();
    this.emitProgress("action_executed", `Testing: ${action.label} (${action.actionType})`, fromUrl, action.label);

    const sourceNode = this.pageNodes.get(fromUrl);
    if (sourceNode) {
      sourceNode.testedInteractiveCount++;
    }
    this.totalTestedInteractive++;
    this.crawlQueue.recordActionExecution();

    try {
      // 1. If targetUrl is an external/navigable URL and not yet visited, navigate
      if (action.targetUrl && action.targetUrl !== fromUrl) {
        await page.goto(action.targetUrl, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
        const toUrl = page.url();
        this.crawlQueue.markPageVisited(toUrl);

        let targetNode = this.pageNodes.get(toUrl);
        if (!targetNode) {
          targetNode = await this.processCurrentPage(page, toUrl, action.depth);
        }

        // Add user flow edge
        if (sourceNode && targetNode) {
          this.flowEdges.push({
            id: `edge-${this.flowEdges.length + 1}`,
            runId: this.config.id,
            fromPageId: sourceNode.id,
            toPageId: targetNode.id,
            label: action.label,
            edgeType: action.category === "tab" ? "tab" : action.category === "dialog" ? "modal" : "navigation",
            createdAt: new Date().toISOString(),
          });
        }
        return;
      }

      // 2. Interactive action on current page
      const locator = page.locator(action.selector).first();
      const isVisible = await locator.isVisible().catch(() => false);
      if (!isVisible) return;

      if (action.actionType === "tab_switch") {
        await locator.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
      } else if (action.actionType === "dialog_open") {
        await locator.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        // Inspect dialog
        const dialog = await this.dialogDiscovery.inspectActiveDialog(page);
        if (dialog) {
          await this.dialogDiscovery.safelyDismiss(page, dialog);
        }
      } else {
        await locator.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
      }

      // Check if URL changed as result of click
      const newUrl = page.url();
      if (newUrl !== fromUrl && !this.pageNodes.has(newUrl)) {
        this.crawlQueue.markPageVisited(newUrl);
        const targetNode = await this.processCurrentPage(page, newUrl, action.depth);
        if (sourceNode && targetNode) {
          this.flowEdges.push({
            id: `edge-${this.flowEdges.length + 1}`,
            runId: this.config.id,
            fromPageId: sourceNode.id,
            toPageId: targetNode.id,
            label: action.label,
            edgeType: "navigation",
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (err: any) {
      console.warn(`[QARunWorker] Action "${action.label}" failed:`, err.message);
    }
  }

  /**
   * Finalize crawl and produce reports
   */
  private async finishAndGenerateReports(page: Page): Promise<{
    status: QARunStatus;
    score: number;
    issuesCount: { critical: number; major: number; minor: number };
    summary: any;
  }> {
    // 1. Finalize Playwright trace
    if (this.config.options?.captureTrace ?? true) {
      await this.browserManager.stopTracing(this.traceManager.path);
    }

    // 2. Finalize video recording after page close
    let videoPath = "";
    if (this.config.options?.recordVideo ?? true) {
      const video = page ? page.video() : null;
      await page.close().catch(() => {});
      if (video) {
        const vid = await this.videoRecorder.finalizeWithVideo(video);
        videoPath = vid || "";
      }
    } else {
      await page.close().catch(() => {});
    }

    // 3. Calculate coverage & issues
    const coverage = CoverageCalculator.calculate({
      pagesDiscovered: Math.max(this.pageNodes.size, this.crawlQueue.visitedPageCount),
      pagesTested: this.pageNodes.size,
      interactiveDiscovered: this.totalDiscoveredInteractive,
      interactiveTested: this.totalTestedInteractive,
      safetyBlockedCount: this.safetyBlockedCount,
    });

    // Add API failures to issue classifier
    for (const net of this.networkCollector.getFailures(this.config.id)) {
      this.issueClassifier.recordApiFailure(this.config.id, net.pageUrl, net.url, net.status || 0, net.durationMs || 0);
    }

    // Add console errors to issue classifier
    for (const con of this.consoleCollector.getEvents(this.config.id)) {
      if (con.severity === "error") {
        this.issueClassifier.recordConsoleError(this.config.id, con.pageUrl, con.message, con.stack);
      }
    }

    const issuesCount = this.issueClassifier.getCounts();

    // 4. Calculate score
    const { overallScore, breakdown } = ScoreCalculator.calculate({
      criticalIssues: issuesCount.critical,
      majorIssues: issuesCount.major,
      minorIssues: issuesCount.minor,
      brokenNavCount: this.pageNodes.size > 0 ? Array.from(this.pageNodes.values()).filter((p) => p.status === "FAILED").length : 0,
      blankPagesCount: Array.from(this.pageNodes.values()).filter((p) => p.isBlank).length,
      apiFailuresCount: this.networkCollector.apiFailureCount,
      consoleErrorsCount: this.consoleCollector.errorCount,
      averageLoadTimeMs: this.performanceCollector.averageLoadTimeMs,
      accessibilityIssuesCount: 0,
      pageCoveragePct: coverage.pageCoveragePct,
      interactionCoveragePct: coverage.interactionCoveragePct,
    });

    const summaryStats = {
      pagesDiscovered: coverage.pagesDiscovered,
      pagesTested: coverage.pagesTested,
      pageCoveragePct: coverage.pageCoveragePct,
      interactiveDiscovered: coverage.interactiveDiscovered,
      interactiveTested: coverage.interactiveTested,
      interactionCoveragePct: coverage.interactionCoveragePct,
      criticalIssues: issuesCount.critical,
      majorIssues: issuesCount.major,
      minorIssues: issuesCount.minor,
      consoleErrors: this.consoleCollector.errorCount,
      apiFailures: this.networkCollector.apiFailureCount,
      brokenNavigation: Array.from(this.pageNodes.values()).filter((p) => p.status === "FAILED").length,
      blankPages: Array.from(this.pageNodes.values()).filter((p) => p.isBlank).length,
      accessibilityIssues: 0,
      totalDurationMs: 0,
    };

    // 5. Generate HTML and JSON reports
    const reportData = {
      config: this.config,
      stats: summaryStats,
      score: overallScore,
      breakdown,
      issues: this.issueClassifier.getAllIssues(),
      pages: Array.from(this.pageNodes.values()),
      edges: this.flowEdges,
      consoleEvents: this.consoleCollector.getEvents(this.config.id),
      networkEvents: this.networkCollector.getFailures(this.config.id),
      accessibility: [],
      performance: this.performanceCollector.getMetrics(this.config.id),
      screenshots: this.screenshotManager.getCaptured(),
      videoPath: videoPath ? `artifacts/${videoPath}` : undefined,
      tracePath: this.traceManager.exists() ? "artifacts/trace.zip" : undefined,
    };

    const htmlReport = HtmlReportGenerator.generate(reportData);
    this.storage.saveHtmlReport(htmlReport);

    const jsonReport = JsonReportGenerator.generate(reportData);
    this.storage.saveJsonReport(jsonReport);

    return {
      status: "COMPLETED",
      score: overallScore,
      issuesCount,
      summary: summaryStats,
    };
  }

  /**
   * Access collected entities for persistence
   */
  getEntities() {
    return {
      pages: Array.from(this.pageNodes.values()),
      actions: this.executedActions,
      edges: this.flowEdges,
      issues: this.issueClassifier.getAllIssues(),
      consoleEvents: this.consoleCollector.getEvents(this.config.id),
      networkEvents: this.networkCollector.getFailures(this.config.id),
      artifacts: this.storage.collectAllArtifacts(),
      score: 0,
    };
  }
}
