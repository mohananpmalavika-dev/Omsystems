/**
 * Model Manifest
 * 
 * Canonical definitions for all inference models. This is the single source of truth
 * for model configuration, labels, and preprocessing parameters.
 * 
 * Benefits:
 * - Centralized model configuration
 * - Type-safe label mappings
 * - Consistent preprocessing across detectors
 * - Easy model versioning and updates
 */

import type { InferenceCapability } from './specialty-inference-provider.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Model manifest entry
 */
export interface ModelManifest {
  id: string;
  capability: InferenceCapability;
  modelPath: string;
  modelPathEnvironment?: string; // Environment variable override

  input: {
    width: number;
    height: number;
    channels: number;
  };

  labels: Record<number, string>; // classId -> className
  confidenceThreshold: number;
  nmsThreshold: number;

  version: string;
  description?: string;
}

// ============================================================================
// Equipment Type Definitions
// ============================================================================

/**
 * Canonical industrial equipment types
 * These match the domain model used by IndustrialAnalytics
 */
export type IndustrialEquipmentType =
  | 'forklift'
  | 'pallet_jack'
  | 'reach_truck'
  | 'overhead_crane'
  | 'gantry_crane'
  | 'mobile_crane'
  | 'excavator'
  | 'bulldozer'
  | 'loader'
  | 'conveyor_belt'
  | 'assembly_line'
  | 'cnc_machine'
  | 'lathe'
  | 'mill'
  | 'welding_equipment'
  | 'press_machine'
  | 'agv'
  | 'robot_arm'
  | 'other_machinery';

// ============================================================================
// Model Manifests
// ============================================================================

/**
 * Industrial Equipment Detection Model
 * 
 * Custom YOLOv8 model trained on industrial equipment
 * Expected to be deployed at: /models/industrial-equipment.onnx
 */
export const INDUSTRIAL_EQUIPMENT_MODEL: ModelManifest = {
  id: 'industrial-equipment-v1',
  capability: 'industrial_equipment_detection',

  modelPath:
    process.env.INDUSTRIAL_EQUIPMENT_MODEL_PATH ??
    '/models/industrial/equipment-detector.onnx',
  modelPathEnvironment: 'INDUSTRIAL_EQUIPMENT_MODEL_PATH',

  input: {
    width: 640,
    height: 640,
    channels: 3,
  },

  // Class labels for equipment detection
  // Note: These must match the training data labels
  labels: {
    0: 'forklift',
    1: 'pallet_jack',
    2: 'reach_truck',
    3: 'overhead_crane',
    4: 'excavator',
    5: 'bulldozer',
    6: 'loader',
    7: 'conveyor_belt',
    8: 'cnc_machine',
    9: 'agv',
    10: 'robot_arm',
    11: 'welding_equipment',
    12: 'press_machine',
    13: 'other_machinery',
  },

  confidenceThreshold: 0.45, // Lower threshold for industrial safety
  nmsThreshold: 0.5,

  version: '1.0.0',
  description: 'Industrial equipment detector for factory safety monitoring',
};

/**
 * PPE Detection Model
 */
export const PPE_MODEL: ModelManifest = {
  id: 'ppe-detector-v1',
  capability: 'ppe_detection',

  modelPath:
    process.env.PPE_MODEL_PATH ??
    '/models/safety/ppe-detector.onnx',
  modelPathEnvironment: 'PPE_MODEL_PATH',

  input: {
    width: 640,
    height: 640,
    channels: 3,
  },

  labels: {
    0: 'helmet',
    1: 'no-helmet',
    2: 'vest',
    3: 'no-vest',
    4: 'gloves',
    5: 'no-gloves',
    6: 'goggles',
    7: 'mask',
  },

  confidenceThreshold: 0.6,
  nmsThreshold: 0.45,

  version: '1.0.0',
  description: 'Personal protective equipment (PPE) detector',
};

/**
 * Fire and Smoke Detection Model
 */
export const FIRE_SMOKE_MODEL: ModelManifest = {
  id: 'fire-smoke-v1',
  capability: 'fire_smoke_detection',

  modelPath:
    process.env.FIRE_SMOKE_MODEL_PATH ??
    '/models/safety/fire-smoke-detector.onnx',
  modelPathEnvironment: 'FIRE_SMOKE_MODEL_PATH',

  input: {
    width: 640,
    height: 640,
    channels: 3,
  },

  labels: {
    0: 'fire',
    1: 'smoke',
  },

  confidenceThreshold: 0.65, // Higher threshold for critical safety events
  nmsThreshold: 0.5,

  version: '1.0.0',
  description: 'Fire and smoke detector for emergency response',
};

/**
 * Weapon Detection Model
 */
export const WEAPON_MODEL: ModelManifest = {
  id: 'weapon-detector-v1',
  capability: 'weapon_detection',

  modelPath:
    process.env.WEAPON_MODEL_PATH ??
    '/models/security/weapon-detector.onnx',
  modelPathEnvironment: 'WEAPON_MODEL_PATH',

  input: {
    width: 640,
    height: 640,
    channels: 3,
  },

  labels: {
    0: 'handgun',
    1: 'rifle',
    2: 'knife',
    3: 'bat',
  },

  confidenceThreshold: 0.7, // High threshold to reduce false positives
  nmsThreshold: 0.5,

  version: '1.0.0',
  description: 'Weapon detector for security monitoring',
};

// ============================================================================
// Registry
// ============================================================================

/**
 * All available model manifests
 */
export const MODEL_MANIFESTS: Record<string, ModelManifest> = {
  [INDUSTRIAL_EQUIPMENT_MODEL.id]: INDUSTRIAL_EQUIPMENT_MODEL,
  [PPE_MODEL.id]: PPE_MODEL,
  [FIRE_SMOKE_MODEL.id]: FIRE_SMOKE_MODEL,
  [WEAPON_MODEL.id]: WEAPON_MODEL,
};

/**
 * Get model manifest by ID
 */
export function getModelManifest(id: string): ModelManifest | undefined {
  return MODEL_MANIFESTS[id];
}

/**
 * Get model manifest by capability
 */
export function getModelManifestByCapability(
  capability: InferenceCapability
): ModelManifest | undefined {
  return Object.values(MODEL_MANIFESTS).find(
    (manifest) => manifest.capability === capability
  );
}

/**
 * Get all manifests for a capability (there may be multiple versions)
 */
export function getModelManifestsByCapability(
  capability: InferenceCapability
): ModelManifest[] {
  return Object.values(MODEL_MANIFESTS).filter(
    (manifest) => manifest.capability === capability
  );
}

/**
 * Map class name to equipment type (with validation)
 */
export function mapClassToEquipmentType(
  className: string
): IndustrialEquipmentType {
  // Direct mapping (snake_case to snake_case)
  const normalized = className.toLowerCase().replace(/-/g, '_');

  const validTypes: IndustrialEquipmentType[] = [
    'forklift',
    'pallet_jack',
    'reach_truck',
    'overhead_crane',
    'gantry_crane',
    'mobile_crane',
    'excavator',
    'bulldozer',
    'loader',
    'conveyor_belt',
    'assembly_line',
    'cnc_machine',
    'lathe',
    'mill',
    'welding_equipment',
    'press_machine',
    'agv',
    'robot_arm',
    'other_machinery',
  ];

  if (validTypes.includes(normalized as IndustrialEquipmentType)) {
    return normalized as IndustrialEquipmentType;
  }

  // Fallback for unmapped equipment
  console.warn(`Unknown equipment class '${className}', mapping to 'other_machinery'`);
  return 'other_machinery';
}

/**
 * Validate model manifest
 */
export function validateModelManifest(manifest: ModelManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id || !manifest.id.trim()) {
    errors.push('Model ID is required');
  }

  if (!manifest.capability) {
    errors.push('Capability is required');
  }

  if (!manifest.modelPath || !manifest.modelPath.trim()) {
    errors.push('Model path is required');
  }

  if (!manifest.input || manifest.input.width <= 0 || manifest.input.height <= 0) {
    errors.push('Invalid input dimensions');
  }

  if (!manifest.labels || Object.keys(manifest.labels).length === 0) {
    errors.push('Labels are required');
  }

  if (manifest.confidenceThreshold < 0 || manifest.confidenceThreshold > 1) {
    errors.push('Confidence threshold must be between 0 and 1');
  }

  if (manifest.nmsThreshold < 0 || manifest.nmsThreshold > 1) {
    errors.push('NMS threshold must be between 0 and 1');
  }

  return errors;
}

// ============================================================================
// Model Deployment Status
// ============================================================================

/**
 * Check if a model file exists
 */
export async function checkModelDeployment(
  manifest: ModelManifest
): Promise<{
  deployed: boolean;
  path: string;
  reason?: string;
}> {
  const fs = await import('fs');
  const path = await import('path');

  // Resolve model path (environment variable takes precedence)
  let modelPath = manifest.modelPath;
  if (manifest.modelPathEnvironment) {
    const envPath = process.env[manifest.modelPathEnvironment];
    if (envPath && envPath.trim()) {
      modelPath = envPath.trim();
    }
  }

  // Check if absolute path or relative
  if (!path.isAbsolute(modelPath)) {
    // Assume relative to models directory
    const modelsDir = process.env.MODELS_DIR || '/models';
    modelPath = path.join(modelsDir, modelPath);
  }

  // Check if file exists
  try {
    const stats = await fs.promises.stat(modelPath);
    if (!stats.isFile()) {
      return {
        deployed: false,
        path: modelPath,
        reason: 'Path exists but is not a file',
      };
    }

    if (stats.size === 0) {
      return {
        deployed: false,
        path: modelPath,
        reason: 'Model file is empty',
      };
    }

    return {
      deployed: true,
      path: modelPath,
    };
  } catch (error) {
    return {
      deployed: false,
      path: modelPath,
      reason: error instanceof Error ? error.message : 'File not found',
    };
  }
}

/**
 * Get deployment status for all models
 */
export async function getAllModelDeploymentStatus(): Promise<
  Record<
    string,
    {
      manifest: ModelManifest;
      deployed: boolean;
      path: string;
      reason?: string;
    }
  >
> {
  const results: Record<string, any> = {};

  const checks = Object.entries(MODEL_MANIFESTS).map(async ([id, manifest]) => {
    const deployment = await checkModelDeployment(manifest);
    results[id] = {
      manifest,
      ...deployment,
    };
  });

  await Promise.all(checks);
  return results;
}
