/**
 * Acoustic AI Service
 *
 * Coordinates end-to-end acoustic anomaly detection:
 * - Real-time PCM buffer analysis and DSP classification
 * - Blind-spot spatial correlation and automated PTZ camera slew commands
 * - Forensic audit logging and multi-camera cross alerting
 */

import type { ControlPlaneStore } from '../../control-plane-store.js';
import type {
  AcousticAnomalyEvent,
  AcousticBlindSpot,
  AcousticFleetStats,
  AcousticRule,
  AcousticSignature,
  CreateAcousticRuleInput,
  CreateBlindSpotInput,
  IngestAudioChunkInput,
} from '../domain/acoustic-ai.types.js';
import { AcousticAiRepository } from '../repositories/acoustic-ai.repository.js';
import { AcousticBlindSpotCorrelator } from './acoustic-blind-spot-correlator.js';
import { AcousticClassifier } from './acoustic-classifier.js';

export class AcousticAiService {
  constructor(
    private readonly repo: AcousticAiRepository,
    private readonly store?: ControlPlaneStore
  ) {}

  /**
   * Evaluates a live audio chunk from camera microphone or edge stream
   */
  async processAudioChunk(input: IngestAudioChunkInput): Promise<{
    hasAnomaly: boolean;
    event?: AcousticAnomalyEvent;
    classification?: any;
    blindSpotResult?: any;
  }> {
    const {
      tenantId,
      branchId,
      cameraId,
      sampleRate = 16000,
      samples: rawSamples,
      base64Pcm,
      visualTargetInFov = false,
      cameraAzimuthAngleDeg,
    } = input;

    // 1. Decode samples
    let samples: Float32Array;
    if (rawSamples instanceof Float32Array) {
      samples = rawSamples;
    } else if (Array.isArray(rawSamples)) {
      samples = new Float32Array(rawSamples);
    } else if (base64Pcm) {
      const buffer = Buffer.from(base64Pcm, 'base64');
      const int16 = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
      samples = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        samples[i] = (int16[i] ?? 0) / 32768.0;
      }
    } else {
      return { hasAnomaly: false };
    }

    // 2. Fetch active rule for camera
    const rules = await this.repo.listRules(tenantId, { branchId, cameraId });
    const rule = rules.find(r => r.enabled);

    // 3. Classify with AcousticClassifier DSP Engine
    const classification = AcousticClassifier.classify(samples, sampleRate, rule);
    if (!classification || !classification.isThreat) {
      return { hasAnomaly: false, classification };
    }

    // Check if signature is enabled in rule
    if (rule && !rule.enabled_signatures.includes(classification.signature)) {
      return { hasAnomaly: false, classification };
    }

    // 4. Correlate with Camera Blind Spots
    const blindSpots = await this.repo.listBlindSpots(tenantId, cameraId);
    const adjacentCameraIds = await this.resolveAdjacentCameraIds(tenantId, branchId, cameraId);

    const blindSpotResult = AcousticBlindSpotCorrelator.correlate({
      cameraId,
      classification,
      registeredBlindSpots: blindSpots,
      visualTargetInFov,
      estimatedAzimuthDeg: cameraAzimuthAngleDeg,
      adjacentCameraIds,
    });

    // 5. Persist forensic event
    const event = await this.repo.recordEvent({
      tenant_id: tenantId,
      branch_id: branchId ?? null,
      camera_id: cameraId,
      rule_id: rule?.id ?? null,
      signature: classification.signature,
      severity: classification.severity,
      confidence: classification.confidence,
      is_blind_spot: blindSpotResult.isBlindSpot,
      blind_spot_sector: blindSpotResult.sectorName ?? null,
      triangulated_azimuth_deg: blindSpotResult.triangulatedAzimuthDeg ?? null,
      ptz_slew_triggered: blindSpotResult.ptzSlewTriggered,
      ptz_target_camera_id: blindSpotResult.ptzTargetCameraId ?? null,
      ptz_preset_recalled: blindSpotResult.ptzPresetRecalled ?? null,
      cross_alerted_camera_ids: blindSpotResult.crossAlertedCameraIds,
      peak_dbfs: classification.dspFeatures.peakDbFS,
      rms_dbfs: classification.dspFeatures.rmsDbFS,
      crest_factor_db: classification.dspFeatures.crestFactorDb,
      snr_db: classification.dspFeatures.snrDb,
      spectral_centroid_hz: classification.dspFeatures.spectralCentroidHz,
      zero_crossing_rate: classification.dspFeatures.zeroCrossingRate,
      attack_time_ms: classification.dspFeatures.attackTimeMs,
      decay_time_ms: classification.dspFeatures.decayTimeMs,
      waveform: classification.dspFeatures.waveformSnippet,
      status: 'detected',
      details: {
        description: classification.description,
        detectedCharacteristics: classification.detectedCharacteristics,
        blindSpotReason: blindSpotResult.reason,
        highLowRatio: classification.dspFeatures.highLowRatio,
        metallicResonanceIndex: classification.dspFeatures.metallicResonanceIndex,
      },
      detected_at: new Date(),
    });

    return {
      hasAnomaly: true,
      event,
      classification,
      blindSpotResult,
    };
  }

  /**
   * Generates a calibrated synthetic anomaly signal and runs end-to-end evaluation
   */
  async simulateAnomaly(
    tenantId: string,
    branchId: string | undefined,
    cameraId: string,
    signature: AcousticSignature,
    options?: {
      visualTargetInFov?: boolean;
      azimuthDeg?: number;
    }
  ): Promise<{ event: AcousticAnomalyEvent; classification: any; blindSpotResult: any }> {
    const samples = AcousticClassifier.generateSyntheticSignature(signature, 500, 16000);
    const result = await this.processAudioChunk({
      tenantId,
      branchId,
      cameraId,
      sampleRate: 16000,
      samples,
      visualTargetInFov: options?.visualTargetInFov ?? false,
      cameraAzimuthAngleDeg: options?.azimuthDeg,
    });

    if (!result.event) {
      throw new Error(`Simulation failed to trigger acoustic signature [${signature}]`);
    }

    return {
      event: result.event,
      classification: result.classification,
      blindSpotResult: result.blindSpotResult,
    };
  }

  // ==================== REPOSITORY PASS-THROUGHS ====================

  async listRules(tenantId: string, filter?: { branchId?: string; cameraId?: string }): Promise<AcousticRule[]> {
    return this.repo.listRules(tenantId, filter);
  }

  async createRule(input: CreateAcousticRuleInput): Promise<AcousticRule> {
    return this.repo.createRule(input);
  }

  async listBlindSpots(tenantId: string, cameraId?: string): Promise<AcousticBlindSpot[]> {
    return this.repo.listBlindSpots(tenantId, cameraId);
  }

  async createBlindSpot(input: CreateBlindSpotInput): Promise<AcousticBlindSpot> {
    return this.repo.createBlindSpot(input);
  }

  async listEvents(tenantId: string, filters?: any): Promise<AcousticAnomalyEvent[]> {
    return this.repo.listEvents(tenantId, filters);
  }

  async acknowledgeEvent(id: string, acknowledgedBy: string, notes?: string): Promise<AcousticAnomalyEvent | null> {
    return this.repo.acknowledgeEvent(id, acknowledgedBy, notes);
  }

  async getStats(tenantId: string): Promise<AcousticFleetStats> {
    return this.repo.getFleetStats(tenantId);
  }

  private async resolveAdjacentCameraIds(
    tenantId: string,
    branchId?: string,
    cameraId?: string
  ): Promise<string[]> {
    if (this.store && branchId) {
      try {
        const cameras = await (this.store as any).listCameras?.(tenantId, branchId);
        if (Array.isArray(cameras)) {
          return cameras.map(c => c.id).filter(id => id !== cameraId);
        }
      } catch (err) {
        // Ignore and fallback
      }
    }
    return ['cam-adjacent-hallway', 'cam-ptz-courtyard'];
  }
}
