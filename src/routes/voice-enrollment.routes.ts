/**
 * Voice Enrollment API Routes
 * 
 * Endpoints for voice biometric enrollment - recording voice samples and creating voice profiles.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";
import { VoiceBiometricRepository } from "../repositories/voice-biometric.repository.js";
import { getVoiceProcessingService } from "../services/voice-processing.service.js";
import type {
  StartVoiceEnrollmentRequest,
  SubmitEnrollmentSampleRequest,
  CompleteEnrollmentRequest,
} from "../types/voice-biometric.types.js";

const startEnrollmentSchema = z.object({
  consentGiven: z.boolean(),
  passphraseRequired: z.boolean().optional(),
  passphrase: z.string().min(4).max(100).optional(),
});

const submitSampleSchema = z.object({
  voiceProfileId: z.string().uuid(),
  audioData: z.string(), // Base64 encoded audio
  audioFormat: z.enum(["wav", "webm", "mp3", "pcm_f32le", "pcm_s16le"]),
  sampleRateHz: z.number().min(8000).max(48000),
  durationSeconds: z.number().min(0.5).max(30),
});

const completeEnrollmentSchema = z.object({
  voiceProfileId: z.string().uuid(),
});

const revokeProfileSchema = z.object({
  reason: z.string().optional(),
});

export async function registerVoiceEnrollmentRoutes(
  app: FastifyInstance,
  pool: Pool
) {
  const repository = new VoiceBiometricRepository(pool);

  /**
   * POST /v1/voice/enrollment/start
   * Start voice enrollment process for current user
   */
  app.post("/v1/voice/enrollment/start", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: "unauthenticated",
          message: "Authentication required",
        });
      }

      const body = startEnrollmentSchema.parse(request.body);

      // Check if user already has a voice profile
      const existingProfile = await repository.getVoiceProfileByUserId(
        user.id,
        user.tenantId
      );

      if (existingProfile && existingProfile.enrollmentStatus === "completed") {
        return reply.code(409).send({
          error: "profile_exists",
          message: "User already has a completed voice profile. Revoke it first to re-enroll.",
          voiceProfileId: existingProfile.id,
        });
      }

      // Get tenant settings
      const settings = await repository.getSettings(user.tenantId);
      if (!settings?.enabled) {
        return reply.code(403).send({
          error: "feature_disabled",
          message: "Voice authentication is not enabled for this organization",
        });
      }

      if (settings.requireConsent && !body.consentGiven) {
        return reply.code(400).send({
          error: "consent_required",
          message: "User consent is required for voice biometric enrollment",
        });
      }

      // Hash passphrase if provided
      let passphraseHash: string | undefined;
      if (body.passphraseRequired && body.passphrase) {
        const { hashPassword } = await import("../security/password.js");
        passphraseHash = await hashPassword(body.passphrase);
      }

      // Calculate expiry date if configured
      let expiresAt: Date | undefined;
      if (settings.enrollmentExpiryDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + settings.enrollmentExpiryDays);
      }

      // Create or update voice profile
      let voiceProfile;
      if (existingProfile) {
        await repository.updateVoiceProfileStatus(existingProfile.id, "in_progress");
        voiceProfile = await repository.getVoiceProfileById(existingProfile.id);
      } else {
        voiceProfile = await repository.createVoiceProfile({
          userId: user.id,
          tenantId: user.tenantId,
          embeddingModelVersion: settings.embeddingModelName,
          minimumSamplesRequired: settings.minimumEnrollmentSamples,
          consentGiven: body.consentGiven,
          consentIpAddress: request.ip,
          passphraseRequired: body.passphraseRequired || false,
          passphraseHash,
          expiresAt,
          createdByUserId: user.id,
        });
      }

      // Audit log
      if (typeof (app as any).auditLog === "function") {
        await (app as any).auditLog({
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: "voice_enrollment.started",
          outcome: "success",
          sourceIp: request.ip,
          details: {
            voiceProfileId: voiceProfile!.id,
            passphraseRequired: body.passphraseRequired || false,
          },
        });
      }

      return reply.code(201).send({
        success: true,
        voiceProfileId: voiceProfile!.id,
        minimumSamplesRequired: settings.minimumEnrollmentSamples,
        maximumSamplesAllowed: settings.maximumEnrollmentSamples,
        message: "Voice enrollment started. Please record voice samples.",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Voice enrollment start failed");
      return reply.code(500).send({
        error: "enrollment_failed",
        message: error.message || "Failed to start voice enrollment",
      });
    }
  });

  /**
   * POST /v1/voice/enrollment/sample
   * Submit a voice sample for enrollment
   */
  app.post("/v1/voice/enrollment/sample", async (request, reply) => {
    const startTime = Date.now();

    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: "unauthenticated",
          message: "Authentication required",
        });
      }

      const body = submitSampleSchema.parse(request.body);

      // Get voice profile and verify ownership
      const voiceProfile = await repository.getVoiceProfileById(body.voiceProfileId);
      if (!voiceProfile) {
        return reply.code(404).send({
          error: "profile_not_found",
          message: "Voice profile not found",
        });
      }

      if (voiceProfile.userId !== user.id) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Cannot add samples to another user's voice profile",
        });
      }

      if (voiceProfile.enrollmentStatus === "completed") {
        return reply.code(400).send({
          error: "enrollment_complete",
          message: "Voice profile enrollment is already completed",
        });
      }

      // Get tenant settings
      const settings = await repository.getSettings(user.tenantId);
      if (!settings?.enabled) {
        return reply.code(403).send({
          error: "feature_disabled",
          message: "Voice authentication is not enabled",
        });
      }

      // Check if max samples reached
      if (voiceProfile.samplesCount >= settings.maximumEnrollmentSamples) {
        return reply.code(400).send({
          error: "max_samples_reached",
          message: `Maximum of ${settings.maximumEnrollmentSamples} samples allowed`,
        });
      }

      // Decode audio data
      const audioBuffer = Buffer.from(body.audioData, "base64");

      // Get voice processing service
      const voiceService = await getVoiceProcessingService({
        embeddingModelPath: process.env.VOICE_EMBEDDING_MODEL_PATH || "models/voice/ecapa-tdnn-512.onnx",
        similarityThreshold: settings.similarityThreshold,
        qualityThreshold: settings.qualityThreshold,
      });

      if (!voiceService.isReady()) {
        return reply.code(503).send({
          error: "service_unavailable",
          message: "Voice processing service is not available. Model not loaded.",
        });
      }

      // Process audio
      const { audioFeatures, audioArray } = await voiceService.processAudioFile(
        audioBuffer,
        body.audioFormat
      );

      // Check audio quality
      const qualityCheck = await voiceService.checkVoiceQuality(audioFeatures);

      // Extract speaker embedding
      let sampleEmbedding: number[] | undefined;
      let embeddingConfidence: number | undefined;

      if (qualityCheck.passed) {
        const embedding = await voiceService.extractSpeakerEmbedding(audioArray);
        sampleEmbedding = embedding.vector;
        embeddingConfidence = embedding.confidence;
      }

      // Calculate audio hash
      const audioHash = voiceService.calculateAudioHash(audioBuffer);

      // Store sample
      const sample = await repository.createEnrollmentSample({
        voiceProfileId: body.voiceProfileId,
        userId: user.id,
        tenantId: user.tenantId,
        sampleSequence: voiceProfile.samplesCount + 1,
        audioDurationSeconds: body.durationSeconds,
        sampleRateHz: body.sampleRateHz,
        audioFormat: body.audioFormat,
        audioBlobUri: undefined, // TODO: Upload to blob storage if configured
        audioBlobSizeBytes: audioBuffer.length,
        audioHash,
        snrDb: audioFeatures.snr,
        speechDetected: audioFeatures.speechDetected,
        silenceRatio: audioFeatures.silenceRatio,
        clippingDetected: audioFeatures.clippingDetected,
        sampleEmbedding,
        embeddingConfidence,
        qualityPassed: qualityCheck.passed,
        qualityScore: qualityCheck.score,
        qualityFailureReasons: qualityCheck.issues.map(i => i.message),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      // Increment samples count
      await repository.incrementSamplesCount(body.voiceProfileId);

      // Get updated profile
      const updatedProfile = await repository.getVoiceProfileById(body.voiceProfileId);
      const samplesCompleted = updatedProfile!.samplesCount;
      const samplesRequired = updatedProfile!.minimumSamplesRequired;
      const enrollmentComplete = samplesCompleted >= samplesRequired && qualityCheck.passed;

      // Audit log
      if (typeof (app as any).auditLog === "function") {
        await (app as any).auditLog({
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: "voice_enrollment.sample_submitted",
          outcome: qualityCheck.passed ? "success" : "failure",
          sourceIp: request.ip,
          details: {
            voiceProfileId: body.voiceProfileId,
            sampleId: sample.id,
            sampleSequence: sample.sampleSequence,
            qualityPassed: qualityCheck.passed,
            qualityScore: qualityCheck.score,
            processingTimeMs: Date.now() - startTime,
          },
        });
      }

      return reply.code(201).send({
        success: true,
        sampleId: sample.id,
        sampleSequence: sample.sampleSequence,
        qualityPassed: qualityCheck.passed,
        qualityScore: qualityCheck.score,
        qualityIssues: qualityCheck.issues.map(i => i.message),
        snrDb: audioFeatures.snr,
        samplesCompleted,
        samplesRequired,
        enrollmentComplete,
        message: qualityCheck.passed
          ? `Sample ${samplesCompleted}/${samplesRequired} recorded successfully`
          : `Sample quality check failed. Please try again.`,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Voice sample submission failed");
      return reply.code(500).send({
        error: "sample_submission_failed",
        message: error.message || "Failed to process voice sample",
      });
    }
  });

  /**
   * POST /v1/voice/enrollment/complete
   * Complete voice enrollment by aggregating samples into final profile
   */
  app.post("/v1/voice/enrollment/complete", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: "unauthenticated",
          message: "Authentication required",
        });
      }

      const body = completeEnrollmentSchema.parse(request.body);

      // Get voice profile
      const voiceProfile = await repository.getVoiceProfileById(body.voiceProfileId);
      if (!voiceProfile) {
        return reply.code(404).send({
          error: "profile_not_found",
          message: "Voice profile not found",
        });
      }

      if (voiceProfile.userId !== user.id) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Cannot complete another user's enrollment",
        });
      }

      if (voiceProfile.enrollmentStatus === "completed") {
        return reply.code(400).send({
          error: "already_completed",
          message: "Voice profile enrollment is already completed",
        });
      }

      // Check if enough samples
      if (voiceProfile.samplesCount < voiceProfile.minimumSamplesRequired) {
        return reply.code(400).send({
          error: "insufficient_samples",
          message: `Need ${voiceProfile.minimumSamplesRequired} samples, only ${voiceProfile.samplesCount} recorded`,
        });
      }

      // Get quality-passed samples
      const qualitySamples = await repository.getQualitySamples(body.voiceProfileId);
      if (qualitySamples.length < voiceProfile.minimumSamplesRequired) {
        return reply.code(400).send({
          error: "insufficient_quality_samples",
          message: `Need ${voiceProfile.minimumSamplesRequired} quality samples, only ${qualitySamples.length} passed quality checks`,
        });
      }

      // Aggregate embeddings (average)
      const embeddingDimension = qualitySamples[0].sampleEmbedding?.length || 512;
      const aggregatedEmbedding = new Array(embeddingDimension).fill(0);

      let totalSnr = 0;
      let totalDuration = 0;
      let totalConfidence = 0;

      for (const sample of qualitySamples) {
        if (sample.sampleEmbedding) {
          for (let i = 0; i < embeddingDimension; i++) {
            aggregatedEmbedding[i] += sample.sampleEmbedding[i];
          }
        }
        if (sample.snrDb) totalSnr += sample.snrDb;
        totalDuration += sample.audioDurationSeconds;
        if (sample.embeddingConfidence) totalConfidence += sample.embeddingConfidence;
      }

      // Average
      for (let i = 0; i < embeddingDimension; i++) {
        aggregatedEmbedding[i] /= qualitySamples.length;
      }

      const averageSnr = totalSnr / qualitySamples.length;
      const averageDuration = totalDuration / qualitySamples.length;
      const averageConfidence = totalConfidence / qualitySamples.length;

      // Normalize final embedding
      const voiceService = await getVoiceProcessingService();
      const normalizedEmbedding = voiceService.isReady()
        ? (voiceService as any).normalizeVector(aggregatedEmbedding)
        : aggregatedEmbedding;

      // Calculate enrollment quality score (0-1)
      const qualityScore = Math.min(1.0, (averageSnr / 30.0) * averageConfidence);

      // Complete enrollment
      await repository.completeEnrollment(
        body.voiceProfileId,
        normalizedEmbedding,
        qualityScore,
        averageSnr,
        averageDuration,
        averageConfidence
      );

      // Audit log
      if (typeof (app as any).auditLog === "function") {
        await (app as any).auditLog({
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: "voice_enrollment.completed",
          outcome: "success",
          sourceIp: request.ip,
          details: {
            voiceProfileId: body.voiceProfileId,
            samplesUsed: qualitySamples.length,
            qualityScore,
            averageSnr,
          },
        });
      }

      return reply.code(200).send({
        success: true,
        voiceProfileId: body.voiceProfileId,
        enrollmentQualityScore: qualityScore,
        message: "Voice enrollment completed successfully. You can now use voice authentication.",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Voice enrollment completion failed");
      return reply.code(500).send({
        error: "completion_failed",
        message: error.message || "Failed to complete voice enrollment",
      });
    }
  });

  /**
   * GET /v1/voice/enrollment/status
   * Get current user's voice enrollment status
   */
  app.get("/v1/voice/enrollment/status", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: "unauthenticated",
          message: "Authentication required",
        });
      }

      const voiceProfile = await repository.getVoiceProfileByUserId(user.id, user.tenantId);

      if (!voiceProfile) {
        return reply.code(200).send({
          enrolled: false,
          message: "No voice profile found. Start enrollment to enable voice authentication.",
        });
      }

      const isExpired = voiceProfile.expiresAt && new Date(voiceProfile.expiresAt) < new Date();
      const isActive = voiceProfile.enrollmentStatus === "completed" && !isExpired;
      const needsReEnrollment = isExpired || voiceProfile.enrollmentStatus === "expired";

      return reply.code(200).send({
        enrolled: true,
        profile: {
          id: voiceProfile.id,
          enrollmentStatus: voiceProfile.enrollmentStatus,
          samplesCount: voiceProfile.samplesCount,
          minimumSamplesRequired: voiceProfile.minimumSamplesRequired,
          enrollmentQualityScore: voiceProfile.enrollmentQualityScore,
          enrollmentCompletedAt: voiceProfile.enrollmentCompletedAt,
          expiresAt: voiceProfile.expiresAt,
          lastUsedAt: voiceProfile.lastUsedAt,
          successfulAuthCount: voiceProfile.successfulAuthCount,
          failedAuthCount: voiceProfile.failedAuthCount,
        },
        isActive,
        needsReEnrollment,
        message: isActive
          ? "Voice authentication is active"
          : needsReEnrollment
          ? "Voice profile expired. Please re-enroll."
          : "Voice enrollment in progress",
      });
    } catch (error: any) {
      app.log.error({ error }, "Failed to get enrollment status");
      return reply.code(500).send({
        error: "status_fetch_failed",
        message: "Failed to retrieve enrollment status",
      });
    }
  });

  /**
   * DELETE /v1/voice/enrollment/profile
   * Revoke current user's voice profile
   */
  app.delete("/v1/voice/enrollment/profile", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: "unauthenticated",
          message: "Authentication required",
        });
      }

      const body = request.body ? revokeProfileSchema.parse(request.body) : {};

      const voiceProfile = await repository.getVoiceProfileByUserId(user.id, user.tenantId);
      if (!voiceProfile) {
        return reply.code(404).send({
          error: "profile_not_found",
          message: "No voice profile found",
        });
      }

      await repository.revokeVoiceProfile(voiceProfile.id);

      // Audit log
      if (typeof (app as any).auditLog === "function") {
        await (app as any).auditLog({
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: "voice_enrollment.profile_revoked",
          outcome: "success",
          sourceIp: request.ip,
          details: {
            voiceProfileId: voiceProfile.id,
            reason: body.reason,
          },
        });
      }

      return reply.code(200).send({
        success: true,
        message: "Voice profile revoked successfully",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Voice profile revocation failed");
      return reply.code(500).send({
        error: "revocation_failed",
        message: "Failed to revoke voice profile",
      });
    }
  });
}
