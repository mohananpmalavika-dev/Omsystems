/**
 * Inference Module
 * 
 * Central export for all inference-related functionality
 */

// Core types and interfaces
export type {
  InferenceCapability,
  InferenceInput,
  InferenceOptions,
  RawDetection,
  InferenceHealth,
  SpecialtyInferenceProvider,
  PreprocessedImage,
} from './specialty-inference-provider.js';

export {
  BaseInferenceProvider,
  CapabilityUnavailableError,
  InferenceError,
  InferenceMetrics,
  letterboxResize,
  restoreBoundingBox,
  calculateIoU,
  nonMaximumSuppression,
} from './specialty-inference-provider.js';

// Registry
export {
  InferenceRegistry,
  getInferenceRegistry,
  resetInferenceRegistry,
} from './inference-registry.js';

// Model manifests
export type {
  ModelManifest,
  IndustrialEquipmentType,
} from './model-manifest.js';

export {
  INDUSTRIAL_EQUIPMENT_MODEL,
  PPE_MODEL,
  FIRE_SMOKE_MODEL,
  WEAPON_MODEL,
  MODEL_MANIFESTS,
  getModelManifest,
  getModelManifestByCapability,
  getModelManifestsByCapability,
  mapClassToEquipmentType,
  validateModelManifest,
  checkModelDeployment,
  getAllModelDeploymentStatus,
} from './model-manifest.js';

// Observation bus
export type {
  ObservationEnvelope,
  ObservationType,
  ObservationSource,
  ObservationHandler,
  EquipmentObservation,
  PersonObservation,
  VehicleObservation,
  PPEObservation,
  FireSmokeObservation,
} from './observation-bus.js';

export {
  ObservationBus,
  getObservationBus,
  resetObservationBus,
  createObservation,
  publishEquipmentObservation,
  publishPersonObservation,
  publishVehicleObservation,
  publishPPEObservation,
  publishFireSmokeObservation,
} from './observation-bus.js';

// Providers
export { OnnxObjectDetector } from './providers/onnx-object-detector.js';
export {
  IndustrialEquipmentDetector,
  createIndustrialEquipmentDetector,
} from './providers/industrial-equipment-detector.js';
