/**
 * Video Capacity Management System
 * 
 * Exports all components for capacity-aware video wall scheduling
 */

// Types
export type {
  VideoCodec,
  HardwareAccelerationState,
  ViewerCapacity,
  ViewerResourceBudget,
  StreamType,
  StreamProfile,
  StreamCost,
  CameraPlaybackMode,
  CameraPriorityClass,
  DegradationReason,
  CameraPlaybackState,
  ScheduledCamera,
  ScheduleReason,
  PlaybackMetrics,
  PlaybackLease,
  DecoderHandle,
  DecoderBudget,
  CameraContext,
  CapacityBenchmarkResult,
  CameraDeviceState,
  TileGeometry,
} from "./types";

// Stream Utilities
export {
  calculateStreamCost,
  scoreCamera,
  getCameraPriorityClass,
  getPriorityValue,
  canAdmitStream,
  canAdmitToEmergencyPool,
  consumeBudget,
  releaseBudget,
  chooseStreamProfile,
  canPreempt,
  detectSupportedCodecs,
  selectPreferredCodec,
} from "./stream-utils";

// Viewer Capacity Manager
export {
  ViewerCapacityManager,
  getViewerCapacityManager,
  resetViewerCapacityManager,
} from "./viewer-capacity-manager";

// Stream Scheduler
export {
  StreamScheduler,
  getStreamScheduler,
  resetStreamScheduler,
} from "./stream-scheduler";

// Decoder Pool
export {
  DecoderPool,
  getDecoderPool,
  resetDecoderPool,
} from "./decoder-pool";
export type { DecoderPoolCallbacks } from "./decoder-pool";

// Snapshot Service
export {
  SnapshotService,
  extractVideoSnapshot,
  VideoSnapshotCache,
  getSnapshotService,
  getVideoSnapshotCache,
  resetSnapshotServices,
} from "./snapshot-service";
export type {
  SnapshotMetadata,
  SnapshotServiceCallbacks,
} from "./snapshot-service";
