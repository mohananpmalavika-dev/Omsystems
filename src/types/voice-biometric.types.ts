/**
 * Voice Biometric Authentication Types
 * 
 * Type definitions for voice-based speaker identification and authentication.
 */

export type VoiceAuthMethod =
  | "speaker_identification"    // Identify user from voice alone
  | "speaker_verification"      // Verify claimed identity with voice
  | "voice_mfa"                 // Voice as additional factor
  | "voice_passphrase"          // Voice + specific passphrase
  | "challenge_response";       // Challenge-response for liveness

export type VoiceEnrollmentStatus =
  | "pending"           // Enrollment initiated
  | "in_progress"       // Recording samples
  | "completed"         // Enrollment successful
  | "failed"            // Failed quality checks
  | "expired"           // Needs re-enrollment
  | "revoked";          // Profile revoked

export type VoiceAuthResult =
  | "success"           // Authentication successful
  | "rejected"          // Voice didn't match
  | "low_confidence"    // Below confidence threshold
  | "quality_failed"    // Poor audio quality
  | "liveness_failed"   // Liveness check failed
  | "replay_detected"   // Replay attack detected
  | "synthetic_detected" // Synthetic/deepfake detected
  | "profile_expired"   // Profile needs re-enrollment
  | "account_locked";   // Account locked

export interface VoiceProfile {
  id: string;
  userId: string;
  tenantId: string;
  
  // Enrollment metadata
  enrollmentStatus: VoiceEnrollmentStatus;
  enrollmentCompletedAt?: Date;
  samplesCount: number;
  minimumSamplesRequired: number;
  
  // Voice embedding (not typically exposed in API)
  speakerEmbeddingVector?: number[];
  embeddingModelVersion: string;
  embeddingConfidenceScore?: number;
  
  // Quality metrics
  averageSnrDb?: number;
  averageDurationSeconds?: number;
  enrollmentQualityScore?: number;
  
  // Security and consent
  consentGiven: boolean;
  consentTimestamp?: Date;
  consentIpAddress?: string;
  passphraseRequired: boolean;
  
  // Lifecycle
  expiresAt?: Date;
  lastUsedAt?: Date;
  successfulAuthCount: number;
  failedAuthCount: number;
  
  createdAt: Date;
  updatedAt: Date;
  createdByUserId?: string;
}

export interface VoiceEnrollmentSample {
  id: string;
  voiceProfileId: string;
  userId: string;
  tenantId: string;
  
  // Sample metadata
  sampleSequence: number;
  audioDurationSeconds: number;
  sampleRateHz: number;
  audioFormat: string;
  
  // Audio storage
  audioBlobUri?: string;
  audioBlobSizeBytes?: number;
  audioHash: string;
  
  // Quality metrics
  snrDb?: number;
  speechDetected: boolean;
  silenceRatio?: number;
  clippingDetected: boolean;
  
  // Embedding
  sampleEmbedding?: number[];
  embeddingConfidence?: number;
  
  // Quality checks
  qualityPassed: boolean;
  qualityScore?: number;
  qualityFailureReasons?: string[];
  
  recordedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface VoiceAuthenticationAttempt {
  id: string;
  tenantId: string;
  userId?: string;
  voiceProfileId?: string;
  
  // Authentication details
  authMethod: VoiceAuthMethod;
  authResult: VoiceAuthResult;
  confidenceScore?: number;
  similarityScore?: number;
  thresholdRequired?: number;
  
  // Audio metadata
  audioDurationSeconds?: number;
  audioQualityScore?: number;
  snrDb?: number;
  
  // Security checks
  livenessCheckPassed?: boolean;
  livenessConfidence?: number;
  replayProbability?: number;
  syntheticProbability?: number;
  
  // Session information
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  
  // Additional context
  passphraseVerified?: boolean;
  challengeText?: string;
  mfaVerified?: boolean;
  
  // Failure details
  failureReason?: string;
  failureDetails?: Record<string, any>;
  
  attemptedAt: Date;
  processingDurationMs?: number;
}

export interface VoiceAuthenticationSettings {
  tenantId: string;
  
  // Feature flags
  enabled: boolean;
  requireLivenessCheck: boolean;
  requireAntiSpoofing: boolean;
  allowVoiceOnlyLogin: boolean;
  requireMfa: boolean;
  
  // Thresholds
  similarityThreshold: number;  // 0.0 to 1.0
  livenessThreshold: number;
  qualityThreshold: number;
  
  // Enrollment requirements
  minimumEnrollmentSamples: number;
  maximumEnrollmentSamples: number;
  enrollmentExpiryDays?: number;
  
  // Security settings
  maxFailedAttempts: number;
  lockoutDurationMinutes: number;
  sessionTimeoutMinutes: number;
  
  // Models
  embeddingModelName: string;
  embeddingDimension: number;
  antiSpoofingModelName?: string;
  
  // Audit and compliance
  retainAudioSamples: boolean;
  audioRetentionDays?: number;
  requireConsent: boolean;
  
  createdAt: Date;
  updatedAt: Date;
  updatedByUserId?: string;
}

export interface VoiceAntiSpoofingLog {
  id: string;
  authenticationAttemptId: string;
  tenantId: string;
  
  // Detection results
  isSpoofed: boolean;
  spoofingType?: "replay" | "synthetic" | "deepfake" | "voice-conversion";
  detectionConfidence: number;
  
  // Analysis details
  spectralAnalysis?: Record<string, any>;
  temporalAnalysis?: Record<string, any>;
  modelScores?: Record<string, number>;
  
  suspiciousFeatures?: string[];
  
  detectedAt: Date;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface StartVoiceEnrollmentRequest {
  userId: string;
  tenantId: string;
  consentGiven: boolean;
  passphraseRequired?: boolean;
  passphrase?: string;
}

export interface StartVoiceEnrollmentResponse {
  voiceProfileId: string;
  minimumSamplesRequired: number;
  maximumSamplesAllowed: number;
  message: string;
}

export interface SubmitEnrollmentSampleRequest {
  voiceProfileId: string;
  audioData: Buffer | ArrayBuffer;  // Audio file data
  audioFormat: string;              // 'wav', 'webm', 'mp3'
  sampleRateHz: number;
  durationSeconds: number;
}

export interface SubmitEnrollmentSampleResponse {
  sampleId: string;
  sampleSequence: number;
  qualityPassed: boolean;
  qualityScore: number;
  qualityIssues?: string[];
  snrDb?: number;
  samplesCompleted: number;
  samplesRequired: number;
  enrollmentComplete: boolean;
  message: string;
}

export interface CompleteEnrollmentRequest {
  voiceProfileId: string;
}

export interface CompleteEnrollmentResponse {
  success: boolean;
  voiceProfileId: string;
  enrollmentQualityScore: number;
  message: string;
}

export interface VoiceAuthenticationRequest {
  audioData: Buffer | ArrayBuffer;
  audioFormat: string;
  authMethod: VoiceAuthMethod;
  
  // Optional fields depending on method
  userId?: string;              // For speaker_verification
  passphrase?: string;          // For voice_passphrase
  challengeResponse?: string;   // For challenge_response
  otpCode?: string;             // For voice_mfa
}

export interface VoiceAuthenticationResponse {
  success: boolean;
  authResult: VoiceAuthResult;
  userId?: string;
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
  
  // Match details
  confidenceScore?: number;
  similarityScore?: number;
  
  // Security check results
  livenessCheckPassed?: boolean;
  antiSpoofingPassed?: boolean;
  
  message: string;
  failureReason?: string;
}

export interface GetVoiceProfileRequest {
  userId: string;
  tenantId: string;
}

export interface GetVoiceProfileResponse {
  profile?: VoiceProfile;
  isActive: boolean;
  needsReEnrollment: boolean;
  message: string;
}

export interface RevokeVoiceProfileRequest {
  voiceProfileId: string;
  reason?: string;
}

export interface RevokeVoiceProfileResponse {
  success: boolean;
  message: string;
}

export interface VoiceAuthAnalyticsRequest {
  tenantId: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  authResult?: VoiceAuthResult;
  limit?: number;
  offset?: number;
}

export interface VoiceAuthAnalyticsResponse {
  attempts: VoiceAuthenticationAttempt[];
  summary: {
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    successRate: number;
    livenessFailures: number;
    spoofingAttempts: number;
    averageConfidenceScore: number;
  };
}

// ============================================================================
// Voice Processing Types
// ============================================================================

export interface AudioFeatures {
  duration: number;
  sampleRate: number;
  channels: number;
  snr?: number;
  silenceRatio?: number;
  clippingDetected: boolean;
  speechDetected: boolean;
  energyLevel?: number;
  processingMetadata?: {
    appliedFilters: string[];
    originalDuration: number;
    processedDuration: number;
  };
}

export interface SpeakerEmbedding {
  vector: number[];
  dimension: number;
  modelVersion: string;
  confidence: number;
}

export interface VoiceQualityCheck {
  passed: boolean;
  score: number;
  issues: Array<{
    type: "snr" | "duration" | "clipping" | "silence" | "speech_quality";
    severity: "error" | "warning";
    message: string;
  }>;
}

export interface AntiSpoofingResult {
  isSpoofed: boolean;
  spoofingType?: "replay" | "synthetic" | "deepfake" | "voice-conversion";
  confidence: number;
  details: {
    spectralAnomalies?: string[];
    temporalInconsistencies?: string[];
    modelScores?: Record<string, number>;
    suspiciousFeatures?: string[];
    riskLevel?: "low" | "medium" | "high" | "critical";
    detectionMethod?: string;
  };
}

export interface LivenessCheckResult {
  passed: boolean;
  confidence: number;
  method: "challenge_response" | "active_detection" | "passive_detection";
  details?: Record<string, any>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface VoiceAuthConfig {
  // Model paths
  embeddingModelPath: string;
  vadModelPath?: string;
  antiSpoofingModelPath?: string;
  
  // Processing settings
  targetSampleRate: number;
  minAudioDuration: number;
  maxAudioDuration: number;
  minSnr: number;
  
  // Embedding settings
  embeddingDimension: number;
  normalizeEmbeddings: boolean;
  
  // Thresholds
  similarityThreshold: number;
  livenessThreshold: number;
  qualityThreshold: number;
  
  // Storage
  audioStoragePath?: string;
  retainEnrollmentSamples: boolean;
  encryptAudioFiles: boolean;
}

export const DEFAULT_VOICE_AUTH_CONFIG: VoiceAuthConfig = {
  embeddingModelPath: process.env.VOICE_EMBEDDING_MODEL_PATH || "models/voice/ecapa-tdnn-512.onnx",
  vadModelPath: process.env.VOICE_VAD_MODEL_PATH,
  antiSpoofingModelPath: process.env.VOICE_ANTISPOOFING_MODEL_PATH,
  
  targetSampleRate: 16000,
  minAudioDuration: 2.0,
  maxAudioDuration: 30.0,
  minSnr: 15.0,
  
  embeddingDimension: 512,
  normalizeEmbeddings: true,
  
  similarityThreshold: 0.75,
  livenessThreshold: 0.80,
  qualityThreshold: 0.60,
  
  retainEnrollmentSamples: false,
  encryptAudioFiles: true,
};
