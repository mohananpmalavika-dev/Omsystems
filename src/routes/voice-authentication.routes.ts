// @ts-nocheck
/**
 * Voice Authentication API Routes
 * 
 * Endpoints for voice-based login and user identification.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import type { Pool } from "pg";
import type { ControlPlaneStore, AuthenticationStore } from "../control-plane-store.js";
import { VoiceBiometricRepository } from "../repositories/voice-biometric.repository.js";
import { getVoiceProcessingService } from "../services/voice-processing.service.js";
import type {
  VoiceAuthMethod,
  VoiceAuthResult,
} from "../types/voice-biometric.types.js";

const voiceLoginSchema = z.object({
  audioData: z.string(), // Base64 encoded audio
  audioFormat: z.enum(["wav", "webm", "mp3", "pcm_f32le", "pcm_s16le"]),
  authMethod: z.enum([
    "speaker_identification",
    "speaker_verification",
    "voice_mfa",
    "voice_passphrase",
    "challenge_response",
  ]),
  
  // Optional fields depending on method
  username: z.string().optional(), // For speaker_verification
  tenantSlug: z.string().optional(),
  passphrase: z.string().optional(), // For voice_passphrase
  challengeResponse: z.string().optional(), // For challenge_response
  otpCode: z.string().optional(), // For voice_mfa
  password: z.string().optional(), // For voice_mfa (if combining with password)
});

const voiceVerifySchema = z.object({
  audioData: z.string(),
  audioFormat: z.enum(["wav", "webm", "mp3", "pcm_f32le", "pcm_s16le"]),
  userId: z.string().uuid(),
});

const challengeRequestSchema = z.object({
  username: z.string().min(1),
  tenantSlug: z.string().optional(),
});

export async function registerVoiceAuthenticationRoutes(
  app: FastifyInstance,
  pool: Pool,
  store: ControlPlaneStore & AuthenticationStore
) {
  const repository = new VoiceBiometricRepository(pool);

  /**
   * POST /v1/auth/voice-login
   * Voice-based authentication - identify and login user by voice
   */
  app.post(
    "/v1/auth/voice-login",
    { config: { noAuth: true } },
    async (request, reply) => {
      const startTime = Date.now();

      try {
        const body = voiceLoginSchema.parse(request.body);

        // Get tenant settings
        let tenantId: string | undefined;
        if (body.tenantSlug) {
          const tenant = await store.findTenantBySlug?.(body.tenantSlug);
          tenantId = tenant?.id;
        }

        // If no tenant found, try to infer from first tenant (for single-tenant deployments)
        if (!tenantId && typeof store.listTenants === "function") {
          const tenants = await store.listTenants();
          if (tenants && tenants.length > 0) {
            tenantId = tenants[0].id;
          }
        }

        if (!tenantId) {
          tenantId = "00000000-0000-0000-0000-000000000001";
        }

        let settings = await repository.getSettings(tenantId);
        if (!settings) {
          settings = {
            id: "default-voice-settings",
            tenantId,
            enabled: true,
            allowSpeakerIdentification: true,
            allowSpeakerVerification: true,
            allowVoicePassphrase: true,
            allowVoiceMfa: true,
            similarityThreshold: 0.70,
            livenessThreshold: 0.75,
            qualityThreshold: 0.50,
            requireAntiSpoofing: false,
            requireLivenessCheck: false,
            enforcePassphrase: false,
            lockoutThreshold: 5,
            lockoutDurationMinutes: 15,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        } else if (!settings.enabled) {
          return reply.code(403).send({
            error: "feature_disabled",
            message: "Voice authentication is not enabled for this organization",
          });
        }

        // Decode audio
        const audioBuffer = Buffer.from(body.audioData, "base64");

        // Get voice processing service
        const voiceService = await getVoiceProcessingService({
          embeddingModelPath: process.env.VOICE_EMBEDDING_MODEL_PATH,
          antiSpoofingModelPath: process.env.VOICE_ANTISPOOFING_MODEL_PATH,
          similarityThreshold: settings.similarityThreshold,
          livenessThreshold: settings.livenessThreshold,
          qualityThreshold: settings.qualityThreshold,
        });

        if (!voiceService.isReady()) {
          return reply.code(503).send({
            error: "service_unavailable",
            message: "Voice authentication service is not available",
          });
        }

        // Process audio
        const { audioFeatures, audioArray } = await voiceService.processAudioFile(
          audioBuffer,
          body.audioFormat
        );

        // Check audio quality
        const qualityCheck = await voiceService.checkVoiceQuality(audioFeatures);
        if (!qualityCheck.passed) {
          await repository.recordAuthAttempt({
            tenantId,
            authMethod: body.authMethod,
            authResult: "quality_failed",
            failureReason: "Audio quality check failed",
            failureDetails: { issues: qualityCheck.issues },
            audioDurationSeconds: audioFeatures.duration,
            audioQualityScore: qualityCheck.score,
            snrDb: audioFeatures.snr,
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"],
            processingDurationMs: Date.now() - startTime,
          });

          return reply.code(400).send({
            error: "poor_audio_quality",
            message: "Audio quality is too poor for authentication",
            issues: qualityCheck.issues.map(i => i.message),
          });
        }

        // Anti-spoofing check
        let spoofingResult;
        if (settings.requireAntiSpoofing) {
          spoofingResult = await voiceService.detectSpoofing(audioArray, audioFeatures);

          if (spoofingResult.isSpoofed) {
            const attemptId = await repository.recordAuthAttempt({
              tenantId,
              authMethod: body.authMethod,
              authResult:
                spoofingResult.spoofingType === "replay"
                  ? "replay_detected"
                  : "synthetic_detected",
              failureReason: `Spoofing detected: ${spoofingResult.spoofingType}`,
              replayProbability:
                spoofingResult.spoofingType === "replay" ? spoofingResult.confidence : undefined,
              syntheticProbability:
                spoofingResult.spoofingType === "synthetic" ? spoofingResult.confidence : undefined,
              audioDurationSeconds: audioFeatures.duration,
              audioQualityScore: qualityCheck.score,
              snrDb: audioFeatures.snr,
              ipAddress: request.ip,
              userAgent: request.headers["user-agent"],
              processingDurationMs: Date.now() - startTime,
            });

            await repository.recordAntiSpoofingLog({
              authenticationAttemptId: attemptId.id,
              tenantId,
              isSpoofed: true,
              spoofingType: spoofingResult.spoofingType,
              detectionConfidence: spoofingResult.confidence,
              spectralAnalysis: spoofingResult.details.spectralAnomalies
                ? { anomalies: spoofingResult.details.spectralAnomalies }
                : undefined,
              temporalAnalysis: spoofingResult.details.temporalInconsistencies
                ? { inconsistencies: spoofingResult.details.temporalInconsistencies }
                : undefined,
              modelScores: spoofingResult.details.modelScores,
            });

            return reply.code(401).send({
              error: "authentication_failed",
              message: "Voice authentication failed security checks",
              authResult:
                spoofingResult.spoofingType === "replay" ? "replay_detected" : "synthetic_detected",
            });
          }
        }

        // Extract speaker embedding
        const embedding = await voiceService.extractSpeakerEmbedding(audioArray);

        // Perform authentication based on method
        let authResult: VoiceAuthResult = "rejected";
        let matchedProfile;
        let matchedUser;
        let similarityScore: number | undefined;

        if (body.authMethod === "speaker_identification") {
          // 1-to-N identification - find matching voice profile
          const matches = await repository.findSimilarProfiles(
            tenantId,
            embedding.vector,
            settings.similarityThreshold,
            5 // Get top 5 matches
          );

          if (matches.length > 0) {
            matchedProfile = matches[0].profile;
            similarityScore = matches[0].similarity;
            matchedUser = await store.getUserById(matchedProfile.userId);

            if (matchedUser && matchedUser.status === "active") {
              authResult = "success";
            } else {
              authResult = "account_locked";
            }
          } else {
            authResult = "rejected";
          }
        } else if (body.authMethod === "speaker_verification") {
          // 1-to-1 verification - verify claimed identity
          if (!body.username) {
            return reply.code(400).send({
              error: "username_required",
              message: "Username required for speaker verification",
            });
          }

          matchedUser = await store.findUserByUsername(body.username, body.tenantSlug);
          if (!matchedUser) {
            authResult = "rejected";
          } else {
            matchedProfile = await repository.getVoiceProfileByUserId(
              matchedUser.id,
              matchedUser.tenantId
            );

            if (matchedProfile && matchedProfile.speakerEmbeddingVector) {
              similarityScore = voiceService.calculateCosineSimilarity(
                embedding.vector,
                matchedProfile.speakerEmbeddingVector
              );

              if (similarityScore >= settings.similarityThreshold) {
                authResult = matchedUser.status === "active" ? "success" : "account_locked";
              } else {
                authResult = "low_confidence";
              }
            } else {
              authResult = "profile_expired";
            }
          }
        } else if (body.authMethod === "voice_passphrase") {
          // Voice + passphrase verification
          if (!body.username || !body.passphrase) {
            return reply.code(400).send({
              error: "credentials_required",
              message: "Username and passphrase required",
            });
          }

          matchedUser = await store.findUserByUsername(body.username, body.tenantSlug);
          if (matchedUser) {
            matchedProfile = await repository.getVoiceProfileByUserId(
              matchedUser.id,
              matchedUser.tenantId
            );

            if (matchedProfile?.passphraseRequired && matchedProfile.speakerEmbeddingVector) {
              // Verify passphrase
              const { verifyPassword } = await import("../security/password.js");
              const passphraseValid =
                matchedProfile.passphraseHash &&
                (await verifyPassword(body.passphrase, matchedProfile.passphraseHash));

              if (passphraseValid) {
                similarityScore = voiceService.calculateCosineSimilarity(
                  embedding.vector,
                  matchedProfile.speakerEmbeddingVector
                );

                if (similarityScore >= settings.similarityThreshold) {
                  authResult = matchedUser.status === "active" ? "success" : "account_locked";
                } else {
                  authResult = "low_confidence";
                }
              } else {
                authResult = "rejected";
              }
            }
          }
        }

        // Record authentication attempt
        const attempt = await repository.recordAuthAttempt({
          tenantId,
          userId: matchedUser?.id,
          voiceProfileId: matchedProfile?.id,
          authMethod: body.authMethod,
          authResult,
          confidenceScore: embedding.confidence,
          similarityScore,
          thresholdRequired: settings.similarityThreshold,
          audioDurationSeconds: audioFeatures.duration,
          audioQualityScore: qualityCheck.score,
          snrDb: audioFeatures.snr,
          livenessCheckPassed: spoofingResult ? !spoofingResult.isSpoofed : undefined,
          livenessConfidence: spoofingResult?.confidence,
          replayProbability: spoofingResult?.spoofingType === "replay" ? spoofingResult.confidence : undefined,
          syntheticProbability: spoofingResult?.spoofingType === "synthetic" ? spoofingResult.confidence : undefined,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
          failureReason: authResult !== "success" ? authResult : undefined,
          processingDurationMs: Date.now() - startTime,
        });

        // If authentication failed
        if (authResult !== "success" || !matchedUser || !matchedProfile) {
          return reply.code(401).send({
            success: false,
            authResult,
            message: "Voice authentication failed",
            confidenceScore: similarityScore,
          });
        }

        // Generate session tokens
        const accessToken = generateToken(64);
        const refreshToken = generateToken(64);
        const accessTokenHash = hashToken(accessToken);
        const refreshTokenHash = hashToken(refreshToken);

        const session = await store.createUserSession(
          matchedUser.id,
          matchedUser.tenantId,
          accessTokenHash,
          refreshTokenHash,
          request.ip,
          request.headers["user-agent"]
        );

        if (!session?.id) {
          throw new Error("session_creation_failed");
        }

        const accessExpiresAt = session.accessExpiresAt
          ? new Date(session.accessExpiresAt).getTime()
          : Date.now() + 3600_000;

        const expiresIn = Math.max(1, Math.floor((accessExpiresAt - Date.now()) / 1000));

        // Update attempt with session ID
        await pool.query(
          `UPDATE voice_authentication_attempts SET session_id = $1 WHERE id = $2`,
          [session.id, attempt.id]
        );

        // Update profile statistics
        await repository.updateAuthStatistics(matchedProfile.id, true);

        // Record successful login
        if (typeof store.recordSuccessfulLogin === "function") {
          await store.recordSuccessfulLogin(matchedUser.id, request.ip);
        }

        // Audit log
        if (typeof store.writeAudit === "function") {
          await store.writeAudit({
            tenantId: matchedUser.tenantId,
            actorUserId: matchedUser.id,
            action: "user.login.voice_authentication",
            resourceNodeId: null,
            outcome: "success",
            sourceIp: request.ip,
            details: {
              sessionId: session.id,
              authMethod: body.authMethod,
              similarityScore,
              confidenceScore: embedding.confidence,
              processingTimeMs: Date.now() - startTime,
            },
          });
        }

        // Get full user details
        const userDetails =
          typeof store.getUserDetails === "function"
            ? await store.getUserDetails(matchedUser.id).catch(() => undefined)
            : undefined;

        const resolvedUser = {
          id: matchedUser.id,
          username: userDetails?.username ?? matchedUser.username,
          email: userDetails?.email ?? matchedUser.email,
          displayName: userDetails?.displayName ?? matchedUser.displayName,
          role: userDetails?.role ?? matchedUser.role,
          customRoleId: userDetails?.customRoleId ?? matchedUser.customRoleId,
          customRoleName: userDetails?.customRoleName ?? matchedUser.customRoleName,
          menuAccess: userDetails?.menuAccess ?? matchedUser.menuAccess,
          preferences: userDetails?.preferences ?? matchedUser.preferences,
          organizations: userDetails?.organizations ?? matchedUser.organizations,
          tenantId: matchedUser.tenantId,
          status: "active",
        };

        return reply.code(200).send({
          success: true,
          authResult: "success",
          accessToken,
          refreshToken,
          expiresIn,
          tokenType: "Bearer",
          user: resolvedUser,
          voiceAuth: {
            similarityScore,
            confidenceScore: embedding.confidence,
            method: body.authMethod,
          },
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
        }
        app.log.error({ error }, "Voice authentication failed");
        return reply.code(500).send({
          error: "authentication_failed",
          message: error.message || "Voice authentication failed",
        });
      }
    }
  );

  /**
   * POST /v1/auth/voice-verify
   * Verify user's voice for additional authentication (not full login)
   */
  app.post("/v1/auth/voice-verify", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: "unauthenticated",
          message: "Authentication required",
        });
      }

      const body = voiceVerifySchema.parse(request.body);

      // Check if verifying current user or another user (admin privilege)
      if (body.userId !== user.id) {
        const isAdmin = ["super_admin", "company_admin", "hq_admin"].includes(user.role || "");
        if (!isAdmin) {
          return reply.code(403).send({
            error: "forbidden",
            message: "Cannot verify another user's voice",
          });
        }
      }

      // Get voice profile
      const voiceProfile = await repository.getVoiceProfileByUserId(body.userId, user.tenantId);
      if (!voiceProfile || !voiceProfile.speakerEmbeddingVector) {
        return reply.code(404).send({
          error: "profile_not_found",
          message: "User has no voice profile enrolled",
        });
      }

      // Get settings
      const settings = await repository.getSettings(user.tenantId);
      if (!settings?.enabled) {
        return reply.code(403).send({
          error: "feature_disabled",
          message: "Voice authentication is not enabled",
        });
      }

      // Decode and process audio
      const audioBuffer = Buffer.from(body.audioData, "base64");
      const voiceService = await getVoiceProcessingService();

      if (!voiceService.isReady()) {
        return reply.code(503).send({
          error: "service_unavailable",
          message: "Voice processing service is not available",
        });
      }

      const { audioFeatures, audioArray } = await voiceService.processAudioFile(
        audioBuffer,
        body.audioFormat
      );

      const qualityCheck = await voiceService.checkVoiceQuality(audioFeatures);
      if (!qualityCheck.passed) {
        return reply.code(400).send({
          success: false,
          verified: false,
          message: "Audio quality check failed",
          qualityIssues: qualityCheck.issues.map(i => i.message),
        });
      }

      // Extract embedding
      const embedding = await voiceService.extractSpeakerEmbedding(audioArray);

      // Calculate similarity
      const similarityScore = voiceService.calculateCosineSimilarity(
        embedding.vector,
        voiceProfile.speakerEmbeddingVector
      );

      const verified = similarityScore >= settings.similarityThreshold;

      return reply.code(200).send({
        success: true,
        verified,
        similarityScore,
        threshold: settings.similarityThreshold,
        confidenceScore: embedding.confidence,
        message: verified
          ? "Voice verification successful"
          : "Voice verification failed - similarity below threshold",
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Voice verification failed");
      return reply.code(500).send({
        error: "verification_failed",
        message: "Voice verification failed",
      });
    }
  });

  /**
   * POST /v1/auth/voice-challenge
   * Request a challenge phrase for liveness detection
   */
  app.post(
    "/v1/auth/voice-challenge",
    { config: { noAuth: true } },
    async (request, reply) => {
      try {
        const body = challengeRequestSchema.parse(request.body);

        // Verify user exists
        const user = await store.findUserByUsername(body.username, body.tenantSlug);
        if (!user) {
          // Don't reveal if user exists
          const dummyChallenge = generateChallengePhrase();
          return reply.code(200).send({
            challenge: dummyChallenge,
            expiresIn: 60,
          });
        }

        // Generate challenge phrase
        const challenge = generateChallengePhrase();

        // Store challenge in cache/session (implementation depends on your setup)
        // For now, return it - in production, you'd store it server-side

        return reply.code(200).send({
          challenge,
          expiresIn: 60, // 60 seconds to respond
          message: "Please speak this phrase clearly",
        });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
        }
        app.log.error({ error }, "Challenge generation failed");
        return reply.code(500).send({
          error: "challenge_failed",
          message: "Failed to generate challenge",
        });
      }
    }
  );

  /**
   * GET /v1/voice/analytics
   * Get voice authentication analytics (admin only)
   */
  app.get("/v1/voice/analytics", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: "unauthenticated",
          message: "Authentication required",
        });
      }

      // Check admin access
      const isAdmin = ["super_admin", "company_admin", "hq_admin"].includes(user.role || "");
      if (!isAdmin) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Admin access required",
        });
      }

      // Parse query params
      const query = z
        .object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          userId: z.string().uuid().optional(),
        })
        .parse(request.query);

      const startDate = query.startDate ? new Date(query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
      const endDate = query.endDate ? new Date(query.endDate) : new Date();

      // Get analytics
      const analytics = await repository.getAuthAnalytics(user.tenantId, startDate, endDate);

      // Get recent attempts
      const recentAttempts = await repository.getAuthAttempts(
        user.tenantId,
        query.userId,
        50
      );

      return reply.code(200).send({
        success: true,
        period: {
          startDate,
          endDate,
        },
        summary: analytics,
        recentAttempts: recentAttempts.map(a => ({
          id: a.id,
          userId: a.userId,
          authMethod: a.authMethod,
          authResult: a.authResult,
          similarityScore: a.similarityScore,
          confidenceScore: a.confidenceScore,
          attemptedAt: a.attemptedAt,
          ipAddress: a.ipAddress,
        })),
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
      }
      app.log.error({ error }, "Failed to get voice analytics");
      return reply.code(500).send({
        error: "analytics_failed",
        message: "Failed to retrieve voice analytics",
      });
    }
  });

  /**
   * GET /v1/voice/settings
   * Get voice authentication settings (admin only)
   */
  app.get("/v1/voice/settings", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: "unauthenticated",
          message: "Authentication required",
        });
      }

      const isAdmin = ["super_admin", "company_admin", "hq_admin"].includes(user.role || "");
      if (!isAdmin) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Admin access required",
        });
      }

      const settings = await repository.getSettings(user.tenantId);
      if (!settings) {
        return reply.code(404).send({
          error: "settings_not_found",
          message: "Voice authentication settings not found",
        });
      }

      return reply.code(200).send({
        success: true,
        settings,
      });
    } catch (error: any) {
      app.log.error({ error }, "Failed to get voice settings");
      return reply.code(500).send({
        error: "settings_fetch_failed",
        message: "Failed to retrieve settings",
      });
    }
  });

  /**
   * PATCH /v1/voice/settings
   * Update voice authentication settings (admin only)
   */
  app.patch("/v1/voice/settings", async (request, reply) => {
    try {
      const user = request.currentUser;
      if (!user) {
        return reply.code(401).send({
          error: "unauthenticated",
          message: "Authentication required",
        });
      }

      const isAdmin = ["super_admin", "company_admin"].includes(user.role || "");
      if (!isAdmin) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Super admin or company admin access required",
        });
      }

      const updates = request.body as any;

      await repository.updateSettings(user.tenantId, updates);

      // Audit log
      if (typeof store.writeAudit === "function") {
        await store.writeAudit({
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: "voice_settings.updated",
          resourceNodeId: null,
          outcome: "success",
          sourceIp: request.ip,
          details: { updates },
        });
      }

      return reply.code(200).send({
        success: true,
        message: "Voice authentication settings updated successfully",
      });
    } catch (error: any) {
      app.log.error({ error }, "Failed to update voice settings");
      return reply.code(500).send({
        error: "settings_update_failed",
        message: "Failed to update settings",
      });
    }
  });
}

// Helper functions
function generateToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64");
}

function generateChallengePhrase(): string {
  const phrases = [
    "The quick brown fox jumps over the lazy dog",
    "Please confirm your identity with your voice",
    "Security verification in progress",
    "Voice authentication challenge accepted",
    "My voice is my passport verify me",
    "Access granted pending voice verification",
  ];

  // Add random numbers for uniqueness
  const numbers = Math.floor(Math.random() * 900000) + 100000;
  return `${phrases[Math.floor(Math.random() * phrases.length)]} ${numbers}`;
}
