/**
 * BFSI Audio Hardware & Ingestion Governance Service
 * 
 * Enforces hardware prerequisites and privacy compliance before acoustic security alerts fire:
 * 1. Verifies camera audio capability (AAC, G.711, PCM) or external microphone channel.
 * 2. Confirms active branch audio surveillance privacy policy & consent registration.
 * 3. Enforces test clip calibration (glass-break, gunshot, scream) before production activation.
 * 4. Fails closed when audio stream is absent, muted, or uncalibrated.
 */

export interface CameraAudioCapability {
  cameraId: string;
  branchId: string;
  tenantId: string;
  hasMicrophone: boolean;
  microphoneType: "camera_builtin" | "external_ip_mic" | "analog_input";
  audioCodec: "AAC" | "G711U" | "G711A" | "PCM";
  samplingRateHz: number;
  hardwareVerifiedAt?: Date;
  hardwareVerifiedBy?: string;
}

export interface BranchAudioConsentPolicy {
  branchId: string;
  tenantId: string;
  consentSignedAt: Date;
  consentSignedBy: string; // Branch Manager / Compliance Officer
  noticeDisplayedAtPremises: boolean;
  noticeLanguage: string[];
  recordingRetentionDays: number; // typically 30-90 days
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
}

export interface AudioCalibrationTestClip {
  clipId: string;
  cameraId: string;
  eventType: "glass_break" | "gunshot" | "scream";
  durationSeconds: number;
  snrDb: number;
  crestFactorDb: number;
  detectedConfidence: number;
  passed: boolean;
  verifiedAt: Date;
}

export class AudioHardwareGovernanceService {
  private readonly capabilities = new Map<string, CameraAudioCapability>();
  private readonly branchPolicies = new Map<string, BranchAudioConsentPolicy>();
  private readonly calibrationClips = new Map<string, AudioCalibrationTestClip[]>();

  registerCameraAudio(cap: CameraAudioCapability): void {
    if (!cap.hasMicrophone) {
      throw new Error("camera_lacks_microphone_hardware");
    }
    if (cap.samplingRateHz < 8000) {
      throw new Error("sampling_rate_below_acoustic_minimum");
    }
    this.capabilities.set(cap.cameraId, cap);
  }

  registerBranchConsent(policy: BranchAudioConsentPolicy): void {
    if (!policy.noticeDisplayedAtPremises) {
      throw new Error("statutory_audio_surveillance_notice_not_displayed");
    }
    if (policy.recordingRetentionDays <= 0 || policy.recordingRetentionDays > 180) {
      throw new Error("invalid_audio_retention_days");
    }
    this.branchPolicies.set(policy.branchId, policy);
  }

  registerCalibrationClip(clip: AudioCalibrationTestClip): void {
    if (clip.detectedConfidence < 0.8 || !clip.passed) {
      throw new Error("audio_calibration_clip_failed_threshold");
    }
    const list = this.calibrationClips.get(clip.cameraId) ?? [];
    list.push(clip);
    this.calibrationClips.set(clip.cameraId, list);
  }

  /**
   * Evaluates whether acoustic alerts can be safely and lawfully enabled for a camera.
   */
  canEnableAcousticAlerts(cameraId: string, branchId: string): {
    canEnable: boolean;
    reasons: string[];
  } {
    const reasons: string[] = [];

    // 1. Hardware verification
    const cap = this.capabilities.get(cameraId);
    if (!cap || !cap.hasMicrophone) {
      reasons.push("NO_MICROPHONE_HARDWARE: Camera or channel does not provide microphone audio");
    }

    // 2. Branch consent / privacy policy
    const policy = this.branchPolicies.get(branchId);
    if (!policy || policy.status !== "ACTIVE") {
      reasons.push("NO_ACTIVE_AUDIO_CONSENT: Branch audio privacy policy not executed or notice not displayed");
    }

    // 3. Calibration clips test
    const clips = this.calibrationClips.get(cameraId) ?? [];
    const testedEvents = new Set(clips.filter((c) => c.passed).map((c) => c.eventType));
    const requiredEvents: Array<"glass_break" | "gunshot" | "scream"> = ["glass_break", "gunshot", "scream"];
    for (const req of requiredEvents) {
      if (!testedEvents.has(req)) {
        reasons.push(`MISSING_AUDIO_CALIBRATION: Test clip not verified for event type '${req}'`);
      }
    }

    return {
      canEnable: reasons.length === 0,
      reasons,
    };
  }
}
