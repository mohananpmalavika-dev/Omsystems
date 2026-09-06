/**
 * KryptoVision QA Engine
 *
 * Automated User Flow Recorder & QA Crawler
 */

export * from "./types/qa.types";
export * from "./safety/credential-vault";
export * from "./safety/destructive-action-classifier";
export * from "./safety/form-classifier";
export * from "./safety/url-policy";
export * from "./browser/browser-manager";
export * from "./auth/login-detector";
export * from "./auth/login-executor";
export * from "./auth/auth-validator";
export * from "./crawler/page-fingerprint";
export * from "./crawler/crawl-queue";
export * from "./discovery/element-discovery";
export * from "./discovery/tab-discovery";
export * from "./discovery/dialog-discovery";
export * from "./collectors/console-collector";
export * from "./collectors/network-collector";
export * from "./collectors/performance-collector";
export * from "./recorder/screenshot-manager";
export * from "./recorder/video-recorder";
export * from "./recorder/trace-manager";
export * from "./accessibility/axe-runner";
export * from "./analysis/blank-page-detector";
export * from "./analysis/broken-navigation-detector";
export * from "./analysis/issue-classifier";
export * from "./analysis/coverage-calculator";
export * from "./analysis/score-calculator";
export * from "./reporting/html-report";
export * from "./reporting/json-report";
export * from "./storage/artifact-storage";
export * from "./workers/qa-run.worker";
export * from "./workers/qa-worker-pool";
