/**
 * Inference Module
 *
 * Central export for all inference-related functionality
 */
export { BaseInferenceProvider, CapabilityUnavailableError, InferenceError, InferenceMetrics, letterboxResize, restoreBoundingBox, calculateIoU, nonMaximumSuppression, } from './specialty-inference-provider.js';
// Registry
export { InferenceRegistry, getInferenceRegistry, resetInferenceRegistry, } from './inference-registry.js';
export { INDUSTRIAL_EQUIPMENT_MODEL, PPE_MODEL, FIRE_SMOKE_MODEL, WEAPON_MODEL, MODEL_MANIFESTS, getModelManifest, getModelManifestByCapability, getModelManifestsByCapability, mapClassToEquipmentType, validateModelManifest, checkModelDeployment, getAllModelDeploymentStatus, } from './model-manifest.js';
export { ObservationBus, getObservationBus, resetObservationBus, createObservation, publishEquipmentObservation, publishPersonObservation, publishVehicleObservation, publishPPEObservation, publishFireSmokeObservation, } from './observation-bus.js';
// Providers
export { OnnxObjectDetector } from './providers/onnx-object-detector.js';
export { IndustrialEquipmentDetector, createIndustrialEquipmentDetector, } from './providers/industrial-equipment-detector.js';
