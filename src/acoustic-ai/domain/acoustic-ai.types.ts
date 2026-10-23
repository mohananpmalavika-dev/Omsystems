/**
 * Acoustic AI Domain Types (Audio Anomaly Detection & Camera Blind-Spot Intelligence)
 *
 * Covers:
 * 1. Glass breaking detection (ഗ്ലാസ് പൊട്ടുന്ന ശബ്ദം)
 * 2. Screaming / Aggression detection (അലർച്ച / നിലവിളി)
 * 3. Gunshot / Blast detection (വെടിശബ്ദം / സ്ഫോടനം)
 * 4. Shutter tamper / Structural breach detection (ഷട്ടർ തകർക്കുന്ന ശബ്ദം / മെറ്റൽ ഇംപാക്റ്റ്)
 * 5. Camera blind-spot spatial mapping & automated PTZ camera slew
 */

export type AcousticSignature =
  | 'glass_break'
  | 'screaming_aggression'
  | 'gunshot_blast'
  | 'shutter_tamper_breach'
  | 'acoustic_spike'
  | 'high_noise';

export type AcousticSeverity = 'P1' | 'P2' | 'P3' | 'P4';
export type AcousticEventStatus = 'detected' | 'acknowledged' | 'verified_threat' | 'false_positive';
export type BlindSpotSectorType =
  | 'rear_corridor'
  | 'exterior_shutter'
  | 'cash_vault_side'
  | 'atm_vestibule'
  | 'partition_blind_spot'
  | 'stairwell'
  | 'custom';

export interface AcousticDspFeatures {
  peakDbFS: number;
  rmsDbFS: number;
  crestFactorDb: number;
  snrDb: number;
  zeroCrossingRate: number;
  spectralCentroidHz: number;
  highLowRatio: number;
  midBandEnergyRatio: number;
  metallicResonanceIndex: number;
  attackTimeMs: number;
  decayTimeMs: number;
  isClipping: boolean;
  waveformSnippet: number[];
}

export interface AcousticClassificationResult {
  signature: AcousticSignature;
  confidence: number;
  severity: AcousticSeverity;
  isThreat: boolean;
  dspFeatures: AcousticDspFeatures;
  description: string;
  detectedCharacteristics: string[];
}

export interface AcousticRule {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  camera_id?: string | null;
  name: string;
  description?: string | null;
  enabled: boolean;
  enabled_signatures: AcousticSignature[];
  min_confidence: number;
  glass_sensitivity: number;
  scream_sensitivity: number;
  gunshot_sensitivity: number;
  shutter_sensitivity: number;
  blind_spot_auto_ptz: boolean;
  cross_camera_alert: boolean;
  cooldown_seconds: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAcousticRuleInput {
  tenantId: string;
  branchId?: string | null;
  cameraId?: string | null;
  name: string;
  description?: string;
  enabled?: boolean;
  enabledSignatures?: AcousticSignature[];
  minConfidence?: number;
  glassSensitivity?: number;
  screamSensitivity?: number;
  gunshotSensitivity?: number;
  shutterSensitivity?: number;
  blindSpotAutoPtz?: boolean;
  crossCameraAlert?: boolean;
  cooldownSeconds?: number;
}

export interface AcousticBlindSpot {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  camera_id: string;
  zone_name: string;
  sector_type: BlindSpotSectorType;
  azimuth_angle_deg: number;
  estimated_distance_m: number;
  target_ptz_camera_id?: string | null;
  target_ptz_preset_id?: number | null;
  target_ptz_pan_tilt?: { pan: number; tilt: number; zoom: number };
  is_active: boolean;
  notes?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBlindSpotInput {
  tenantId: string;
  branchId?: string | null;
  cameraId: string;
  zoneName: string;
  sectorType?: BlindSpotSectorType;
  azimuthAngleDeg: number;
  estimatedDistanceM?: number;
  targetPtzCameraId?: string | null;
  targetPtzPresetId?: number;
  targetPtzPanTilt?: { pan: number; tilt: number; zoom: number };
  isActive?: boolean;
  notes?: string;
}

export interface AcousticAnomalyEvent {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  camera_id: string;
  rule_id?: string | null;
  signature: AcousticSignature;
  severity: AcousticSeverity;
  confidence: number;
  is_blind_spot: boolean;
  blind_spot_sector?: string | null;
  triangulated_azimuth_deg?: number | null;
  ptz_slew_triggered: boolean;
  ptz_target_camera_id?: string | null;
  ptz_preset_recalled?: number | null;
  cross_alerted_camera_ids: string[];
  peak_dbfs: number;
  rms_dbfs: number;
  crest_factor_db: number;
  snr_db: number;
  spectral_centroid_hz: number;
  zero_crossing_rate: number;
  attack_time_ms: number;
  decay_time_ms: number;
  waveform: number[];
  audio_snippet_url?: string | null;
  status: AcousticEventStatus;
  details: Record<string, any>;
  notes?: string | null;
  acknowledged_by?: string | null;
  acknowledged_at?: Date | null;
  detected_at: Date;
  created_at: Date;
}

export interface IngestAudioChunkInput {
  tenantId: string;
  branchId?: string;
  cameraId: string;
  channelNumber?: number;
  sampleRate?: number;
  samples?: number[] | Float32Array;
  base64Pcm?: string;
  visualTargetInFov?: boolean;
  cameraAzimuthAngleDeg?: number;
  timestamp?: number;
}

export interface AcousticFleetStats {
  totalEvents24h: number;
  activeThreatCount: number;
  blindSpotEventCount: number;
  ptzSlewCommandsTriggered: number;
  signatureCounts: Record<AcousticSignature, number>;
  averageConfidence: number;
  averageNoiseFloorDbFS: number;
}
