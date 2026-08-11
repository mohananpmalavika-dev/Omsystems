/**
 * Industrial Equipment Detector
 * 
 * Specialty detector for industrial equipment (forklifts, cranes, loaders, etc.)
 * Wraps ONNX object detector with equipment-specific normalization and validation.
 */

import { OnnxObjectDetector } from './onnx-object-detector.js';
import {
  INDUSTRIAL_EQUIPMENT_MODEL,
  mapClassToEquipmentType,
  type IndustrialEquipmentType,
} from '../model-manifest.js';
import type {
  InferenceInput,
  InferenceOptions,
  RawDetection,
} from '../specialty-inference-provider.js';
import {
  publishEquipmentObservation,
  type EquipmentObservation,
} from '../observation-bus.js';

// ============================================================================
// Industrial Equipment Detector
// ============================================================================

export class IndustrialEquipmentDetector extends OnnxObjectDetector {
  constructor() {
    super(INDUSTRIAL_EQUIPMENT_MODEL);
  }

  /**
   * Detect equipment and publish to observation bus
   */
  async detectAndPublish(
    input: InferenceInput,
    options?: InferenceOptions
  ): Promise<EquipmentObservation[]> {
    const rawDetections = await this.detect(input, options);

    const equipmentObservations = rawDetections.map((detection) =>
      this.normalizeDetection(detection, input)
    );

    // Publish to observation bus
    for (const equipment of equipmentObservations) {
      publishEquipmentObservation(
        equipment,
        {
          tenantId: input.tenantId,
          cameraId: input.cameraId,
          branchId: input.branchId,
          timestamp: input.timestamp,
        },
        {
          detector: 'industrial-equipment-detector',
          model: INDUSTRIAL_EQUIPMENT_MODEL.id,
          version: INDUSTRIAL_EQUIPMENT_MODEL.version,
          confidence: equipment.confidence,
        }
      );
    }

    return equipmentObservations;
  }

  /**
   * Normalize raw detection to equipment observation
   */
  private normalizeDetection(
    detection: RawDetection,
    context: InferenceInput
  ): EquipmentObservation {
    const equipmentType = mapClassToEquipmentType(detection.className);

    return {
      equipmentType,
      confidence: detection.confidence,
      bbox: detection.bbox,
      attributes: {
        // Additional attributes will be added by tracker
      },
    };
  }

  /**
   * Validate equipment type
   */
  isValidEquipmentType(type: string): type is IndustrialEquipmentType {
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

    return validTypes.includes(type as IndustrialEquipmentType);
  }

  /**
   * Get equipment type metadata
   */
  getEquipmentMetadata(type: IndustrialEquipmentType) {
    const metadata: Record<
      IndustrialEquipmentType,
      {
        category: string;
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
        requiresOperator: boolean;
        typicalSpeed: string;
      }
    > = {
      forklift: {
        category: 'mobile_equipment',
        riskLevel: 'high',
        requiresOperator: true,
        typicalSpeed: '0-20 km/h',
      },
      pallet_jack: {
        category: 'mobile_equipment',
        riskLevel: 'medium',
        requiresOperator: true,
        typicalSpeed: '0-8 km/h',
      },
      reach_truck: {
        category: 'mobile_equipment',
        riskLevel: 'high',
        requiresOperator: true,
        typicalSpeed: '0-15 km/h',
      },
      overhead_crane: {
        category: 'lifting_equipment',
        riskLevel: 'critical',
        requiresOperator: true,
        typicalSpeed: '0-2 m/s',
      },
      gantry_crane: {
        category: 'lifting_equipment',
        riskLevel: 'critical',
        requiresOperator: true,
        typicalSpeed: '0-2 m/s',
      },
      mobile_crane: {
        category: 'lifting_equipment',
        riskLevel: 'critical',
        requiresOperator: true,
        typicalSpeed: '0-30 km/h',
      },
      excavator: {
        category: 'heavy_equipment',
        riskLevel: 'critical',
        requiresOperator: true,
        typicalSpeed: '0-10 km/h',
      },
      bulldozer: {
        category: 'heavy_equipment',
        riskLevel: 'critical',
        requiresOperator: true,
        typicalSpeed: '0-12 km/h',
      },
      loader: {
        category: 'heavy_equipment',
        riskLevel: 'high',
        requiresOperator: true,
        typicalSpeed: '0-25 km/h',
      },
      conveyor_belt: {
        category: 'stationary_equipment',
        riskLevel: 'medium',
        requiresOperator: false,
        typicalSpeed: '0.5-2 m/s',
      },
      assembly_line: {
        category: 'stationary_equipment',
        riskLevel: 'medium',
        requiresOperator: false,
        typicalSpeed: '0.2-1 m/s',
      },
      cnc_machine: {
        category: 'manufacturing_equipment',
        riskLevel: 'high',
        requiresOperator: true,
        typicalSpeed: 'N/A',
      },
      lathe: {
        category: 'manufacturing_equipment',
        riskLevel: 'high',
        requiresOperator: true,
        typicalSpeed: 'N/A',
      },
      mill: {
        category: 'manufacturing_equipment',
        riskLevel: 'high',
        requiresOperator: true,
        typicalSpeed: 'N/A',
      },
      welding_equipment: {
        category: 'manufacturing_equipment',
        riskLevel: 'high',
        requiresOperator: true,
        typicalSpeed: 'N/A',
      },
      press_machine: {
        category: 'manufacturing_equipment',
        riskLevel: 'critical',
        requiresOperator: true,
        typicalSpeed: 'N/A',
      },
      agv: {
        category: 'autonomous_equipment',
        riskLevel: 'medium',
        requiresOperator: false,
        typicalSpeed: '0-5 km/h',
      },
      robot_arm: {
        category: 'autonomous_equipment',
        riskLevel: 'high',
        requiresOperator: false,
        typicalSpeed: '0-2 m/s',
      },
      other_machinery: {
        category: 'other',
        riskLevel: 'medium',
        requiresOperator: true,
        typicalSpeed: 'N/A',
      },
    };

    return metadata[type];
  }
}

/**
 * Create and initialize industrial equipment detector
 */
export async function createIndustrialEquipmentDetector(): Promise<IndustrialEquipmentDetector> {
  const detector = new IndustrialEquipmentDetector();
  await detector.initialize();
  return detector;
}
