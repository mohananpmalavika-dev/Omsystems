/**
 * KryptoVision Automated QA Types
 */

export type QABrowserType = "chromium" | "firefox" | "webkit";

export type QADeviceProfile =
  | "Desktop 1920x1080"
  | "Desktop 1440x900"
  | "Desktop 1366x768"
  | "Tablet 1024x768"
  | "Tablet 768x1024"
  | "Mobile 390x844"
  | "Mobile 360x800";

export type QARunStatus =
  | "QUEUED"
  | "STARTING"
  | "AUTHENTICATING"
  | "CRAWLING"
  | "ANALYZING"
  | "GENERATING_REPORT"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "PAUSED";

export type QAAuthStatus =
  | "NOT_REQUIRED"
  | "SUCCESS"
  | "INVALID_CREDENTIALS"
  | "MFA_REQUIRED"
  | "CAPTCHA_PRESENT"
  | "LOGIN_TIMEOUT"
  | "SERVER_ERROR"
  | "AUTH_SESSION_UNSTABLE"
  | "UNKNOWN_LOGIN_FAILURE";

export type QASeverity = "CRITICAL" | "MAJOR" | "MINOR";

export type QAIssueCategory =
  | "API_FAILURE"
  | "CONSOLE_ERROR"
  | "BROKEN_NAVIGATION"
  | "BLANK_PAGE"
  | "DESTRUCTIVE_BLOCKED"
  | "ACCESSIBILITY"
  | "RESPONSIVE_OVERFLOW"
  | "PERFORMANCE_SLOW"
  | "AUTH_ERROR"
  | "CRASH";

export type QASafetyClassification =
  | "SAFE"
  | "POTENTIALLY_MUTATING"
  | "DESTRUCTIVE"
  | "UNKNOWN";

export type QAActionType =
  | "click"
  | "navigate"
  | "fill"
  | "select"
  | "tab_switch"
  | "dialog_open"
  | "dialog_close"
  | "escape_press"
  | "form_submit";

export interface QARunOptions {
  autoDiscover?: boolean;
  recordVideo?: boolean;
  captureScreenshots?: boolean;
  captureTrace?: boolean;
  captureConsole?: boolean;
  captureNetwork?: boolean;
  testLinks?: boolean;
  testTabs?: boolean;
  testDialogs?: boolean;
  testFormsSafe?: boolean;
  detectBlankPages?: boolean;
  detectDuplicates?: boolean;
  detectAccessibility?: boolean;
  testResponsive?: boolean;
  // Advanced options
  allowedDomains?: string[];
  blockedPaths?: string[];
  ignoreSelectors?: string[];
  allowedDestructive?: string[];
  loginSelectorsOverride?: {
    usernameSelector?: string;
    passwordSelector?: string;
    submitSelector?: string;
  };
  crawlDelayMs?: number;
  maxActions?: number;
  authTimeoutSec?: number;
  screenshotMode?: "all" | "errors_only" | "key_milestones";
  videoResolution?: "1280x720" | "1920x1080" | "800x600";
  retentionDays?: number;
  testEnvironmentTag?: "DEV" | "TEST" | "STAGING" | "DEMO" | "PRODUCTION";
}

export interface QARunConfig {
  id: string;
  targetUrl: string;
  startingPath?: string;
  username?: string;
  password?: string;
  userRole?: string;
  browser?: QABrowserType;
  deviceProfile?: QADeviceProfile;
  maxPages?: number;
  maxDepth?: number;
  pageTimeoutSec?: number;
  options?: QARunOptions;
  tenantId?: string;
  createdBy?: string;
}

export interface QAScoreBreakdown {
  availabilityNavigation: number; // 25%
  functionalUi: number;           // 20%
  apiReliability: number;         // 20%
  consoleStability: number;       // 10%
  performance: number;            // 10%
  accessibility: number;          // 5%
  responsiveUi: number;           // 5%
  coverage: number;               // 5%
}

export interface QASummaryStats {
  pagesDiscovered: number;
  pagesTested: number;
  pageCoveragePct: number;
  interactiveDiscovered: number;
  interactiveTested: number;
  interactionCoveragePct: number;
  criticalIssues: number;
  majorIssues: number;
  minorIssues: number;
  consoleErrors: number;
  apiFailures: number;
  brokenNavigation: number;
  blankPages: number;
  accessibilityIssues: number;
  totalDurationMs: number;
}

export interface QAPageNode {
  id: string;
  runId: string;
  url: string;
  path: string;
  title: string;
  pageHash: string;
  depth: number;
  status: "TESTED" | "FAILED" | "BLOCKED" | "NOT_TESTED" | "PERMISSION_DENIED";
  loadTimeMs: number;
  domContentLoadedMs?: number;
  networkIdleMs?: number;
  isBlank: boolean;
  screenshotPath?: string;
  elementCount: number;
  interactiveCount: number;
  testedInteractiveCount: number;
  discoveredAt: string;
  crawledAt?: string;
}

export interface QAActionItem {
  id: string;
  runId: string;
  pageId?: string;
  actionType: QAActionType;
  selector: string;
  elementText: string;
  ariaLabel?: string;
  role?: string;
  isSafe: boolean;
  safetyClassification: QASafetyClassification;
  status: "EXECUTED" | "BLOCKED" | "FAILED" | "SKIPPED";
  loadTimeMs?: number;
  screenshotBefore?: string;
  screenshotAfter?: string;
  createdAt: string;
}

export interface QAFlowEdge {
  id: string;
  runId: string;
  fromPageId: string;
  toPageId: string;
  actionId?: string;
  label: string;
  edgeType: "navigation" | "tab" | "modal" | "link" | "redirect";
  createdAt: string;
}

export interface QAIssue {
  id: string;
  runId: string;
  pageId?: string;
  severity: QASeverity;
  category: QAIssueCategory;
  title: string;
  pageUrl: string;
  actionDescription?: string;
  expected?: string;
  actual?: string;
  screenshotPath?: string;
  videoTimestampSec?: number;
  tracePath?: string;
  details?: Record<string, any>;
  occurrences: number;
  firstSeenAt: string;
  createdAt: string;
}

export interface QAConsoleEvent {
  id: string;
  runId: string;
  pageUrl: string;
  severity: "error" | "warn" | "info";
  message: string;
  stack?: string;
  occurrences: number;
  timestamp: string;
}

export interface QANetworkEvent {
  id: string;
  runId: string;
  pageUrl: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  resourceType?: string;
  failureReason?: string;
  occurrences: number;
  timestamp: string;
}

export interface QAArtifact {
  id: string;
  runId: string;
  artifactType: "video" | "screenshot" | "trace" | "report_html" | "report_json" | "report_pdf" | "log";
  fileName: string;
  filePath: string;
  fileSizeBytes?: number;
  mimeType?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface QAAccessibilityViolation {
  id: string;
  runId: string;
  pageUrl: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  ruleId: string;
  description: string;
  helpUrl?: string;
  nodes: Array<{
    html: string;
    target: string[];
    failureSummary?: string;
  }>;
  createdAt: string;
}

export interface QAPerformanceMetric {
  id: string;
  runId: string;
  pageUrl: string;
  domContentLoadedMs: number;
  loadMs: number;
  networkIdleMs: number;
  firstMeaningfulPaintMs?: number;
  rating: "Good" | "Warning" | "Slow" | "Critical";
  createdAt: string;
}

export interface QARunProgressEvent {
  runId: string;
  type: "status" | "log" | "page_discovered" | "page_crawled" | "action_executed" | "issue_detected" | "completed" | "error";
  status: QARunStatus;
  message: string;
  currentPage?: string;
  currentAction?: string;
  pagesDiscovered: number;
  pagesTested: number;
  actionsExecuted: number;
  issuesCount: {
    critical: number;
    major: number;
    minor: number;
  };
  timestamp: string;
}
