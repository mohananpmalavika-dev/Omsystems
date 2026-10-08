/**
 * Vehicle Analytics Module Exports
 * Main entry point for vehicle analytics system
 */

// Core Services
export { VehicleAnalyticsService } from './vehicle-analytics.service.js';
export type { VehicleAnalyticsConfig, ProcessingResult } from './vehicle-analytics.service.js';

// Tracking
export { VehicleTracker } from './tracking/vehicle-tracker.js';
export type {
  VehicleDetection,
  VehicleTrackState,
  BoundingBox,
  TrackingConfig,
} from './tracking/vehicle-tracker.js';

// Color Classification
export { DominantColorClassifier, resolveVehicleColor } from './color/vehicle-color-classifier.js';
export type {
  VehicleColor,
  VehicleColorResult,
  VehicleColorClassifier,
  ImageMatrix,
} from './color/vehicle-color-classifier.js';

// Plate Detection
export {
  YoloPlateDetector,
  translateBoundingBox,
  calculatePlateQuality,
} from './detection/license-plate-detector.js';
export type {
  PlateDetection,
  PlateQualityMetrics,
  LicensePlateDetector,
} from './detection/license-plate-detector.js';

// ANPR Pipeline
export { BasicPlateRectifier } from './anpr/plate-rectifier.js';
export type { RectifiedPlate, PlateRectifier } from './anpr/plate-rectifier.js';

export { PaddlePlateRecognizer, MockPlateRecognizer } from './anpr/paddle-ocr-adapter.js';
export type { OcrRecognition, PlateRecognizer } from './anpr/paddle-ocr-adapter.js';

export { PlateNormalizer } from './anpr/plate-normalizer.js';
export type { NormalizedPlate, PlateFormat } from './anpr/plate-normalizer.js';

export { PlateConsensus, isReliableConsensus, getConfidenceLevel } from './anpr/plate-consensus.js';
export type { PlateObservation, PlateConsensusResult } from './anpr/plate-consensus.js';

// Persistence
export { DefaultVehicleEventFactory } from './persistence/vehicle-event.model.js';
export type {
  VehicleEvent,
  VehicleEventQuery,
  VehicleEventStats,
  PlateHistoryOptions,
  DateRange,
  VehicleSightedEvent,
} from './persistence/vehicle-event.model.js';

export type { VehicleEventRepository } from './persistence/vehicle-event.repository.js';
export { InMemoryVehicleEventRepository } from './persistence/vehicle-event.repository.js';

export {
  PostgresVehicleEventRepository,
  VEHICLE_EVENTS_SCHEMA,
} from './persistence/postgres-vehicle-event.repository.js';

// Journey Reconstruction
export { VehicleJourneyService } from './journey/vehicle-journey.service.js';
export type {
  VehicleJourney,
  JourneyAppearance,
  CameraTopology,
  CameraNode,
  CameraConnection,
  RouteValidation,
} from './journey/vehicle-journey.service.js';

// Watchlist
export { VehicleWatchlistService } from './watchlist/vehicle-watchlist.service.js';
export type {
  VehicleWatchlistEntry,
  WatchlistMatch,
  WatchlistMatchAlert,
} from './watchlist/vehicle-watchlist.service.js';

// Monitoring
export { VehicleAnalyticsMetrics, InMemoryMetricsCollector, QualityMonitor } from './monitoring/vehicle-analytics-metrics.js';
export type { MetricsCollector } from './monitoring/vehicle-analytics-metrics.js';
