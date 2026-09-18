/**
 * Voice Biometric Repository
 * 
 * Database operations for voice authentication system.
 */

import type { Pool, PoolClient } from "pg";
import type {
  VoiceProfile,
  VoiceEnrollmentSample,
  VoiceAuthenticationAttempt,
  VoiceAuthenticationSettings,
  VoiceAntiSpoofingLog,
  VoiceAuthMethod,
  VoiceAuthResult,
  VoiceEnrollmentStatus,
} from "../types/voice-biometric.types.js";

export class VoiceBiometricRepository {
  constructor(private pool: Pool) {}

  // ============================================================================
  // Voice Profile Operations
  // ============================================================================

  /**
   * Create a new voice profile
   */
  async createVoiceProfile(data: {
    userId: string;
    tenantId: string;
    embeddingModelVersion: string;
    minimumSamplesRequired: number;
    consentGiven: boolean;
    consentIpAddress?: string;
    passphraseRequired?: boolean;
    passphraseHash?: string;
    expiresAt?: Date;
    createdByUserId?: string;
  }): Promise<VoiceProfile> {
    const result = await this.pool.query(
      `INSERT INTO voice_profiles (
        user_id, tenant_id, embedding_model_version, minimum_samples_required,
        consent_given, consent_timestamp, consent_ip_address,
        passphrase_required, passphrase_hash, expires_at, created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        data.userId,
        data.tenantId,
        data.embeddingModelVersion,
        data.minimumSamplesRequired,
        data.consentGiven,
        data.consentGiven ? new Date() : null,
        data.consentIpAddress,
        data.passphraseRequired || false,
        data.passphraseHash,
        data.expiresAt,
        data.createdByUserId,
      ]
    );

    return this.mapVoiceProfile(result.rows[0]);
  }

  /**
   * Get voice profile by user ID
   */
  async getVoiceProfileByUserId(userId: string, tenantId: string): Promise<VoiceProfile | null> {
    const result = await this.pool.query(
      `SELECT * FROM voice_profiles WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );

    if (result.rows.length === 0) return null;
    return this.mapVoiceProfile(result.rows[0]);
  }

  /**
   * Get voice profile by ID
   */
  async getVoiceProfileById(profileId: string): Promise<VoiceProfile | null> {
    const result = await this.pool.query(
      `SELECT * FROM voice_profiles WHERE id = $1`,
      [profileId]
    );

    if (result.rows.length === 0) return null;
    return this.mapVoiceProfile(result.rows[0]);
  }

  /**
   * Update voice profile embedding and complete enrollment
   */
  async completeEnrollment(
    profileId: string,
    embeddingVector: number[],
    qualityScore: number,
    averageSnr?: number,
    averageDuration?: number,
    embeddingConfidence?: number
  ): Promise<void> {
    await this.pool.query(
      `UPDATE voice_profiles
       SET enrollment_status = 'completed',
           enrollment_completed_at = now(),
           speaker_embedding_vector = $2::vector,
           enrollment_quality_score = $3,
           average_snr_db = $4,
           average_duration_seconds = $5,
           embedding_confidence_score = $6,
           updated_at = now()
       WHERE id = $1`,
      [profileId, JSON.stringify(embeddingVector), qualityScore, averageSnr, averageDuration, embeddingConfidence]
    );
  }

  /**
   * Update voice profile status
   */
  async updateVoiceProfileStatus(profileId: string, status: VoiceEnrollmentStatus): Promise<void> {
    await this.pool.query(
      `UPDATE voice_profiles SET enrollment_status = $2, updated_at = now() WHERE id = $1`,
      [profileId, status]
    );
  }

  /**
   * Increment samples count
   */
  async incrementSamplesCount(profileId: string): Promise<void> {
    await this.pool.query(
      `UPDATE voice_profiles SET samples_count = samples_count + 1, updated_at = now() WHERE id = $1`,
      [profileId]
    );
  }

  /**
   * Update authentication statistics
   */
  async updateAuthStatistics(profileId: string, success: boolean): Promise<void> {
    const column = success ? "successful_auth_count" : "failed_auth_count";
    await this.pool.query(
      `UPDATE voice_profiles
       SET ${column} = ${column} + 1,
           last_used_at = CASE WHEN $2 THEN now() ELSE last_used_at END,
           updated_at = now()
       WHERE id = $1`,
      [profileId, success]
    );
  }

  /**
   * Revoke voice profile
   */
  async revokeVoiceProfile(profileId: string): Promise<void> {
    await this.pool.query(
      `UPDATE voice_profiles SET enrollment_status = 'revoked', updated_at = now() WHERE id = $1`,
      [profileId]
    );
  }

  /**
   * Find similar voice profiles (for speaker identification)
   */
  async findSimilarProfiles(
    tenantId: string,
    embeddingVector: number[],
    similarityThreshold: number,
    limit: number = 5
  ): Promise<Array<{ profile: VoiceProfile; similarity: number }>> {
    // Use pgvector cosine distance for similarity search
    const result = await this.pool.query(
      `SELECT *,
              1 - (speaker_embedding_vector <=> $1::vector) as similarity
       FROM voice_profiles
       WHERE tenant_id = $2
         AND enrollment_status = 'completed'
         AND (expires_at IS NULL OR expires_at > now())
         AND 1 - (speaker_embedding_vector <=> $1::vector) >= $3
       ORDER BY speaker_embedding_vector <=> $1::vector
       LIMIT $4`,
      [JSON.stringify(embeddingVector), tenantId, similarityThreshold, limit]
    );

    return result.rows.map(row => ({
      profile: this.mapVoiceProfile(row),
      similarity: parseFloat(row.similarity),
    }));
  }

  // ============================================================================
  // Enrollment Sample Operations
  // ============================================================================

  /**
   * Create enrollment sample
   */
  async createEnrollmentSample(data: {
    voiceProfileId: string;
    userId: string;
    tenantId: string;
    sampleSequence: number;
    audioDurationSeconds: number;
    sampleRateHz: number;
    audioFormat: string;
    audioBlobUri?: string;
    audioBlobSizeBytes?: number;
    audioHash: string;
    snrDb?: number;
    speechDetected: boolean;
    silenceRatio?: number;
    clippingDetected: boolean;
    sampleEmbedding?: number[];
    embeddingConfidence?: number;
    qualityPassed: boolean;
    qualityScore?: number;
    qualityFailureReasons?: string[];
    ipAddress?: string;
    userAgent?: string;
  }): Promise<VoiceEnrollmentSample> {
    const result = await this.pool.query(
      `INSERT INTO voice_enrollment_samples (
        voice_profile_id, user_id, tenant_id, sample_sequence,
        audio_duration_seconds, sample_rate_hz, audio_format,
        audio_blob_uri, audio_blob_size_bytes, audio_hash,
        snr_db, speech_detected, silence_ratio, clipping_detected,
        sample_embedding, embedding_confidence,
        quality_passed, quality_score, quality_failure_reasons,
        ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *`,
      [
        data.voiceProfileId,
        data.userId,
        data.tenantId,
        data.sampleSequence,
        data.audioDurationSeconds,
        data.sampleRateHz,
        data.audioFormat,
        data.audioBlobUri,
        data.audioBlobSizeBytes,
        data.audioHash,
        data.snrDb,
        data.speechDetected,
        data.silenceRatio,
        data.clippingDetected,
        data.sampleEmbedding ? JSON.stringify(data.sampleEmbedding) : null,
        data.embeddingConfidence,
        data.qualityPassed,
        data.qualityScore,
        data.qualityFailureReasons,
        data.ipAddress,
        data.userAgent,
      ]
    );

    return this.mapEnrollmentSample(result.rows[0]);
  }

  /**
   * Get enrollment samples for a profile
   */
  async getEnrollmentSamples(voiceProfileId: string): Promise<VoiceEnrollmentSample[]> {
    const result = await this.pool.query(
      `SELECT * FROM voice_enrollment_samples WHERE voice_profile_id = $1 ORDER BY sample_sequence`,
      [voiceProfileId]
    );

    return result.rows.map(row => this.mapEnrollmentSample(row));
  }

  /**
   * Get quality-passed samples for embedding aggregation
   */
  async getQualitySamples(voiceProfileId: string): Promise<VoiceEnrollmentSample[]> {
    const result = await this.pool.query(
      `SELECT * FROM voice_enrollment_samples
       WHERE voice_profile_id = $1 AND quality_passed = true
       ORDER BY sample_sequence`,
      [voiceProfileId]
    );

    return result.rows.map(row => this.mapEnrollmentSample(row));
  }

  // ============================================================================
  // Authentication Attempt Operations
  // ============================================================================

  /**
   * Record authentication attempt
   */
  async recordAuthAttempt(data: {
    tenantId: string;
    userId?: string;
    voiceProfileId?: string;
    authMethod: VoiceAuthMethod;
    authResult: VoiceAuthResult;
    confidenceScore?: number;
    similarityScore?: number;
    thresholdRequired?: number;
    audioDurationSeconds?: number;
    audioQualityScore?: number;
    snrDb?: number;
    livenessCheckPassed?: boolean;
    livenessConfidence?: number;
    replayProbability?: number;
    syntheticProbability?: number;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceFingerprint?: string;
    passphraseVerified?: boolean;
    challengeText?: string;
    mfaVerified?: boolean;
    failureReason?: string;
    failureDetails?: Record<string, any>;
    processingDurationMs?: number;
  }): Promise<VoiceAuthenticationAttempt> {
    const result = await this.pool.query(
      `INSERT INTO voice_authentication_attempts (
        tenant_id, user_id, voice_profile_id, auth_method, auth_result,
        confidence_score, similarity_score, threshold_required,
        audio_duration_seconds, audio_quality_score, snr_db,
        liveness_check_passed, liveness_confidence, replay_probability, synthetic_probability,
        session_id, ip_address, user_agent, device_fingerprint,
        passphrase_verified, challenge_text, mfa_verified,
        failure_reason, failure_details, processing_duration_ms
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *`,
      [
        data.tenantId,
        data.userId,
        data.voiceProfileId,
        data.authMethod,
        data.authResult,
        data.confidenceScore,
        data.similarityScore,
        data.thresholdRequired,
        data.audioDurationSeconds,
        data.audioQualityScore,
        data.snrDb,
        data.livenessCheckPassed,
        data.livenessConfidence,
        data.replayProbability,
        data.syntheticProbability,
        data.sessionId,
        data.ipAddress,
        data.userAgent,
        data.deviceFingerprint,
        data.passphraseVerified,
        data.challengeText,
        data.mfaVerified,
        data.failureReason,
        data.failureDetails ? JSON.stringify(data.failureDetails) : null,
        data.processingDurationMs,
      ]
    );

    return this.mapAuthAttempt(result.rows[0]);
  }

  /**
   * Get authentication attempts for a user
   */
  async getAuthAttempts(
    tenantId: string,
    userId?: string,
    limit: number = 100
  ): Promise<VoiceAuthenticationAttempt[]> {
    const query = userId
      ? `SELECT * FROM voice_authentication_attempts WHERE tenant_id = $1 AND user_id = $2 ORDER BY attempted_at DESC LIMIT $3`
      : `SELECT * FROM voice_authentication_attempts WHERE tenant_id = $1 ORDER BY attempted_at DESC LIMIT $2`;

    const params = userId ? [tenantId, userId, limit] : [tenantId, limit];
    const result = await this.pool.query(query, params);

    return result.rows.map(row => this.mapAuthAttempt(row));
  }

  /**
   * Get authentication analytics
   */
  async getAuthAnalytics(tenantId: string, startDate: Date, endDate: Date) {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total_attempts,
        COUNT(*) FILTER (WHERE auth_result = 'success') as successful_attempts,
        COUNT(*) FILTER (WHERE auth_result != 'success') as failed_attempts,
        COUNT(*) FILTER (WHERE liveness_check_passed = false) as liveness_failures,
        COUNT(*) FILTER (WHERE replay_probability > 0.5 OR synthetic_probability > 0.5) as spoofing_attempts,
        AVG(confidence_score) FILTER (WHERE confidence_score IS NOT NULL) as avg_confidence_score
       FROM voice_authentication_attempts
       WHERE tenant_id = $1
         AND attempted_at >= $2
         AND attempted_at <= $3`,
      [tenantId, startDate, endDate]
    );

    const row = result.rows[0];
    const total = parseInt(row.total_attempts) || 0;
    const successful = parseInt(row.successful_attempts) || 0;

    return {
      totalAttempts: total,
      successfulAttempts: successful,
      failedAttempts: parseInt(row.failed_attempts) || 0,
      successRate: total > 0 ? successful / total : 0,
      livenessFailures: parseInt(row.liveness_failures) || 0,
      spoofingAttempts: parseInt(row.spoofing_attempts) || 0,
      averageConfidenceScore: parseFloat(row.avg_confidence_score) || 0,
    };
  }

  // ============================================================================
  // Settings Operations
  // ============================================================================

  /**
   * Get voice authentication settings for tenant
   */
  async getSettings(tenantId: string): Promise<VoiceAuthenticationSettings | null> {
    const result = await this.pool.query(
      `SELECT * FROM voice_authentication_settings WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0) return null;
    return this.mapSettings(result.rows[0]);
  }

  /**
   * Update voice authentication settings
   */
  async updateSettings(tenantId: string, settings: Partial<VoiceAuthenticationSettings>): Promise<void> {
    // Ensure row exists for this tenant before updating
    await this.pool.query(
      `INSERT INTO voice_authentication_settings (tenant_id, enabled, require_liveness_check, require_consent)
       VALUES ($1, false, true, true)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId]
    );

    const fields: string[] = [];
    const values: any[] = [tenantId];
    let paramCount = 1;

    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined && key !== "tenantId" && key !== "createdAt" && key !== "updatedAt") {
        paramCount++;
        fields.push(`${this.camelToSnake(key)} = $${paramCount}`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    await this.pool.query(
      `UPDATE voice_authentication_settings SET ${fields.join(", ")}, updated_at = now() WHERE tenant_id = $1`,
      values
    );
  }

  // ============================================================================
  // Anti-Spoofing Log Operations
  // ============================================================================

  /**
   * Record anti-spoofing detection
   */
  async recordAntiSpoofingLog(data: {
    authenticationAttemptId: string;
    tenantId: string;
    isSpoofed: boolean;
    spoofingType?: string;
    detectionConfidence: number;
    spectralAnalysis?: Record<string, any>;
    temporalAnalysis?: Record<string, any>;
    modelScores?: Record<string, number>;
    suspiciousFeatures?: string[];
  }): Promise<VoiceAntiSpoofingLog> {
    const result = await this.pool.query(
      `INSERT INTO voice_anti_spoofing_logs (
        authentication_attempt_id, tenant_id, is_spoofed, spoofing_type,
        detection_confidence, spectral_analysis, temporal_analysis, model_scores, suspicious_features
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.authenticationAttemptId,
        data.tenantId,
        data.isSpoofed,
        data.spoofingType,
        data.detectionConfidence,
        data.spectralAnalysis ? JSON.stringify(data.spectralAnalysis) : null,
        data.temporalAnalysis ? JSON.stringify(data.temporalAnalysis) : null,
        data.modelScores ? JSON.stringify(data.modelScores) : null,
        data.suspiciousFeatures,
      ]
    );

    return this.mapAntiSpoofingLog(result.rows[0]);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private mapVoiceProfile(row: any): VoiceProfile {
    return {
      id: row.id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      enrollmentStatus: row.enrollment_status,
      enrollmentCompletedAt: row.enrollment_completed_at,
      samplesCount: row.samples_count,
      minimumSamplesRequired: row.minimum_samples_required,
      speakerEmbeddingVector: row.speaker_embedding_vector ? JSON.parse(row.speaker_embedding_vector) : undefined,
      embeddingModelVersion: row.embedding_model_version,
      embeddingConfidenceScore: row.embedding_confidence_score,
      averageSnrDb: row.average_snr_db,
      averageDurationSeconds: row.average_duration_seconds,
      enrollmentQualityScore: row.enrollment_quality_score,
      consentGiven: row.consent_given,
      consentTimestamp: row.consent_timestamp,
      consentIpAddress: row.consent_ip_address,
      passphraseRequired: row.passphrase_required,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      successfulAuthCount: row.successful_auth_count,
      failedAuthCount: row.failed_auth_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdByUserId: row.created_by_user_id,
    };
  }

  private mapEnrollmentSample(row: any): VoiceEnrollmentSample {
    return {
      id: row.id,
      voiceProfileId: row.voice_profile_id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      sampleSequence: row.sample_sequence,
      audioDurationSeconds: parseFloat(row.audio_duration_seconds),
      sampleRateHz: row.sample_rate_hz,
      audioFormat: row.audio_format,
      audioBlobUri: row.audio_blob_uri,
      audioBlobSizeBytes: row.audio_blob_size_bytes,
      audioHash: row.audio_hash,
      snrDb: row.snr_db,
      speechDetected: row.speech_detected,
      silenceRatio: row.silence_ratio,
      clippingDetected: row.clipping_detected,
      sampleEmbedding: row.sample_embedding ? JSON.parse(row.sample_embedding) : undefined,
      embeddingConfidence: row.embedding_confidence,
      qualityPassed: row.quality_passed,
      qualityScore: row.quality_score,
      qualityFailureReasons: row.quality_failure_reasons,
      recordedAt: row.recorded_at,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }

  private mapAuthAttempt(row: any): VoiceAuthenticationAttempt {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      voiceProfileId: row.voice_profile_id,
      authMethod: row.auth_method,
      authResult: row.auth_result,
      confidenceScore: row.confidence_score,
      similarityScore: row.similarity_score,
      thresholdRequired: row.threshold_required,
      audioDurationSeconds: row.audio_duration_seconds,
      audioQualityScore: row.audio_quality_score,
      snrDb: row.snr_db,
      livenessCheckPassed: row.liveness_check_passed,
      livenessConfidence: row.liveness_confidence,
      replayProbability: row.replay_probability,
      syntheticProbability: row.synthetic_probability,
      sessionId: row.session_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      deviceFingerprint: row.device_fingerprint,
      passphraseVerified: row.passphrase_verified,
      challengeText: row.challenge_text,
      mfaVerified: row.mfa_verified,
      failureReason: row.failure_reason,
      failureDetails: row.failure_details,
      attemptedAt: row.attempted_at,
      processingDurationMs: row.processing_duration_ms,
    };
  }

  private mapSettings(row: any): VoiceAuthenticationSettings {
    return {
      tenantId: row.tenant_id,
      enabled: row.enabled,
      requireLivenessCheck: row.require_liveness_check,
      requireAntiSpoofing: row.require_anti_spoofing,
      allowVoiceOnlyLogin: row.allow_voice_only_login,
      requireMfa: row.require_mfa,
      similarityThreshold: parseFloat(row.similarity_threshold),
      livenessThreshold: parseFloat(row.liveness_threshold),
      qualityThreshold: parseFloat(row.quality_threshold),
      minimumEnrollmentSamples: row.minimum_enrollment_samples,
      maximumEnrollmentSamples: row.maximum_enrollment_samples,
      enrollmentExpiryDays: row.enrollment_expiry_days,
      maxFailedAttempts: row.max_failed_attempts,
      lockoutDurationMinutes: row.lockout_duration_minutes,
      sessionTimeoutMinutes: row.session_timeout_minutes,
      embeddingModelName: row.embedding_model_name,
      embeddingDimension: row.embedding_dimension,
      antiSpoofingModelName: row.anti_spoofing_model_name,
      retainAudioSamples: row.retain_audio_samples,
      audioRetentionDays: row.audio_retention_days,
      requireConsent: row.require_consent,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      updatedByUserId: row.updated_by_user_id,
    };
  }

  private mapAntiSpoofingLog(row: any): VoiceAntiSpoofingLog {
    return {
      id: row.id,
      authenticationAttemptId: row.authentication_attempt_id,
      tenantId: row.tenant_id,
      isSpoofed: row.is_spoofed,
      spoofingType: row.spoofing_type,
      detectionConfidence: parseFloat(row.detection_confidence),
      spectralAnalysis: row.spectral_analysis,
      temporalAnalysis: row.temporal_analysis,
      modelScores: row.model_scores,
      suspiciousFeatures: row.suspicious_features,
      detectedAt: row.detected_at,
    };
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}
