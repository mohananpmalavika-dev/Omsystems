/**
 * Vehicle Analytics Module Exports
 * Main entry point for vehicle analytics system
 */
// Core Services
export { VehicleAnalyticsService } from './vehicle-analytics.service.js';
// Tracking
export { VehicleTracker } from './tracking/vehicle-tracker.js';
// Color Classification
export { DominantColorClassifier, resolveVehicleColor } from './color/vehicle-color-classifier.js';
// Plate Detection
export { YoloPlateDetector, translateBoundingBox, calculatePlateQuality, } from './detection/license-plate-detector.js';
// ANPR Pipeline
export { BasicPlateRectifier } from './anpr/plate-rectifier.js';
export { PaddlePlateRecognizer, MockPlateRecognizer } from './anpr/paddle-ocr-adapter.js';
export { PlateNormalizer } from './anpr/plate-normalizer.js';
export { PlateConsensus, isReliableConsensus, getConfidenceLevel } from './anpr/plate-consensus.js';
// Persistence
export { DefaultVehicleEventFactory } from './persistence/vehicle-event.model.js';
export { InMemoryVehicleEventRepository } from './persistence/vehicle-event.repository.js';
export { PostgresVehicleEventRepository, VEHICLE_EVENTS_SCHEMA, } from './persistence/postgres-vehicle-event.repository.js';
// Journey Reconstruction
export { VehicleJourneyService } from './journey/vehicle-journey.service.js';
// Watchlist
export { VehicleWatchlistService } from './watchlist/vehicle-watchlist.service.js';
// Monitoring
export { VehicleAnalyticsMetrics, InMemoryMetricsCollector, QualityMonitor } from './monitoring/vehicle-analytics-metrics.js';
