/**
 * Human Analytics Module
 * Comprehensive person detection, tracking, behavior analysis, and journey reconstruction
 */

// Core types
export * from "./types.js";

// Capability management
export * from "./capability-status.js";

// Tracking
export { TrackerAdapter } from "./tracking/tracker-adapter.js";

// Behavior detection
export { FightDetector } from "./behavior/fight-detector.js";
export { PanicDetector } from "./behavior/panic-detector.js";

// Counting
export { LineCrossingEngine } from "./counting/line-crossing-engine.js";
export { OccupancyLedger } from "./counting/occupancy-ledger.js";

// Journey reconstruction
export { JourneyMatcher } from "./journeys/journey-matcher.js";

// Main pipeline
export { HumanAnalyticsPipeline } from "./orchestration/human-analytics-pipeline.js";
export type {
  HumanAnalyticsPipelineConfig,
  PipelineResult,
} from "./orchestration/human-analytics-pipeline.js";

// API routes
export { registerHumanAnalyticsRoutes } from "./api/human-analytics.routes.js";
