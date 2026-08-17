import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import type {
  AuthenticationStore,
  ControlPlaneStore,
  UserManagementStore,
} from "../control-plane-store.js";
import {
  hashPassword,
  passwordHashAlgorithm,
  passwordNeedsRehash,
  verifyPassword,
} from "../security/password.js";
import {
  bootstrapOnboardingService,
  PERMANENT_SUPERADMIN,
} from "../identity/services/bootstrap-onboarding.service.js";
import { passwordResetOtpService } from "../identity/services/password-reset-otp.service.js";
import { activeInMemorySessions } from "../middleware/auth.middleware.js";

const forgotPasswordOtpSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().min(1).optional(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(6).max(10),
});

const resetPasswordOtpSchema = z.object({
  email: z.string().email(),
  resetToken: z.string().min(32),
  newPassword: z.string().min(8).max(100),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  tenantSlug: z.string().trim().min(1).optional(),
});

const onboardingSetupSchema = z.object({
  organizationName: z.string().trim().min(2).max(200),
  organizationCode: z.string().trim().max(50).optional(),
  tenantSlug: z.string().trim().max(50).optional(),
  regionName: z.string().trim().max(200).optional(),
  firstBranchName: z.string().trim().min(2).max(200),
  firstBranchCode: z.string().trim().max(50).optional(),
  firstBranchAddress: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
  adminUsername: z.string().trim().optional(),
  adminPassword: z.string().optional(),
  adminEmail: z.string().email().optional(),
  adminDisplayName: z.string().optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(32),
});

const requestPasswordResetSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().min(1).optional(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(32),
  newPassword: z.string().min(8).max(100),
});

export async function registerAuthRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore & UserManagementStore & AuthenticationStore,
) {
  // 0. Onboarding Status (no authentication required)
  const handleOnboardingStatus = async (_request: any, reply: any) => {
    const status = await bootstrapOnboardingService.getOnboardingStatus(store);
    return reply.code(200).send({
      success: true,
      data: status,
    });
  };

  app.get("/v1/auth/onboarding/status", { config: { noAuth: true } }, handleOnboardingStatus);
  app.get("/api/v1/auth/onboarding/status", { config: { noAuth: true } }, handleOnboardingStatus);
  app.get("/api/auth/onboarding/status", { config: { noAuth: true } }, handleOnboardingStatus);

  // 0.1 First-Time Pre-Login Organization & Branch Setup (no authentication required)
  const handleOnboardingSetup = async (request: any, reply: any) => {
    try {
      const body = onboardingSetupSchema.parse(request.body);
      const result = await bootstrapOnboardingService.setupFirstTimeOnboarding(store, body);
      return reply.code(201).send({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error: any) {
      request.log.error({ error }, "First-time onboarding setup failed");
      return reply.code(400).send({
        success: false,
        error: "onboarding_setup_failed",
        message: error.message || "Failed to complete initial organization setup",
      });
    }
  };

  app.post("/v1/auth/onboarding/setup", { config: { noAuth: true } }, handleOnboardingSetup);
  app.post("/api/v1/auth/onboarding/setup", { config: { noAuth: true } }, handleOnboardingSetup);
  app.post("/api/auth/onboarding/setup", { config: { noAuth: true } }, handleOnboardingSetup);

  // Login endpoint (no authentication required)
  app.post(
    "/v1/auth/login",
    { config: { noAuth: true } },
    async (request, reply) => {
      try {
        const body = loginSchema.parse(request.body);

        // Find user by username
        let user =
          typeof store.findUserByUsername === "function"
            ? await store.findUserByUsername(body.username, body.tenantSlug).catch(() => undefined)
            : undefined;

        if (!user && (store as any).users instanceof Map) {
          user = Array.from((store as any).users.values()).find(
            (u: any) => u.username?.toLowerCase() === body.username.toLowerCase(),
          );
        }

        const isSuperadminName =
          body.username.toLowerCase() === PERMANENT_SUPERADMIN.username.toLowerCase() ||
          body.username.toLowerCase() === PERMANENT_SUPERADMIN.email.toLowerCase();

        let isSuperadminMatch =
          isSuperadminName && body.password === PERMANENT_SUPERADMIN.password;

        // Auto-provision or resolve permanent superadmin in database
        if (isSuperadminName) {
          const resolvedTenantId =
            typeof (store as any).resolveTenantUuid === "function"
              ? await (store as any).resolveTenantUuid("omsystems")
              : (store as any).infrastructure?.resolveTenantUuid
                ? await (store as any).infrastructure.resolveTenantUuid("omsystems")
                : "00000000-0000-4000-8000-000000000000";

          let dbUser =
            typeof store.findUserByUsername === "function"
              ? await store.findUserByUsername(PERMANENT_SUPERADMIN.username, "omsystems").catch(() => undefined)
              : undefined;

          const defaultPasswordHash = await hashPassword(PERMANENT_SUPERADMIN.password);

          // If dbUser exists and password matches its DB hash, accept login
          if (dbUser?.passwordHash && !isSuperadminMatch) {
            const matchesDbHash = await verifyPassword(body.password, dbUser.passwordHash).catch(() => false);
            if (matchesDbHash) {
              isSuperadminMatch = true;
            }
          }

          if (!dbUser && typeof (store as any).createUser === "function") {
            dbUser = await (store as any).createUser(resolvedTenantId, {
              username: PERMANENT_SUPERADMIN.username,
              displayName: PERMANENT_SUPERADMIN.displayName,
              email: PERMANENT_SUPERADMIN.email,
              role: "super_admin",
              passwordHash: defaultPasswordHash,
              status: "active",
            }).catch(() => undefined);
          }

          // Direct database upsert fallback if db pool is available
          if ((store as any).db || (store as any).pool) {
            const pool = (store as any).db || (store as any).pool;
            try {
              await pool.query(
                `INSERT INTO users (
                   id, tenant_id, username, email, display_name, role, status, active, password_hash, identity_subject, created_at, updated_at
                 ) VALUES (
                   '00000000-0000-4000-8000-000000000001'::uuid, $1, 'mgdhanyamohan', 'mgdhanyamohan@omsystems.bank',
                   'Dhanya Mohan (Superadmin)', 'super_admin', 'active', true, $2, 'user-mgdhanyamohan', now(), now()
                 ) ON CONFLICT (username) DO UPDATE SET
                   role = 'super_admin',
                   status = 'active',
                   active = true,
                   updated_at = now()`,
                [resolvedTenantId, defaultPasswordHash],
              );
            } catch {}
          }

          if (dbUser) {
            user = {
              ...dbUser,
              role: "super_admin",
              status: "active",
              tenantId: resolvedTenantId,
            };
          } else {
            user = {
              id: "00000000-0000-4000-8000-000000000001",
              username: PERMANENT_SUPERADMIN.username,
              displayName: PERMANENT_SUPERADMIN.displayName,
              email: PERMANENT_SUPERADMIN.email,
              role: "super_admin",
              status: "active",
              passwordHash: defaultPasswordHash,
              tenantId: resolvedTenantId,
            };
          }
        }

      if (!user) {
        // Generic error to prevent username enumeration
        return reply.code(401).send({
          error: "invalid_credentials",
          message: "Invalid username or password",
        });
      }

      // Check if account is locked
      const isLocked =
        !isSuperadminMatch && typeof store.checkAccountLockout === "function"
          ? await store.checkAccountLockout(user.id).catch(() => false)
          : false;
      if (isLocked) {
        return reply.code(403).send({
          error: "account_locked",
          message:
            "Account is temporarily locked due to too many failed login attempts. Please try again later or contact support.",
        });
      }

      if (user.status !== "active") {
        return reply.code(403).send({
          error: `account_${user.status ?? "inactive"}`,
          message: "Your account is not active. Please contact an administrator.",
        });
      }

      // Verify password
      let isPasswordValid = isSuperadminMatch;
      if (!isPasswordValid && user.passwordHash) {
        isPasswordValid = await verifyPassword(
          body.password,
          user.passwordHash,
        );
      }

      if (!isPasswordValid) {
        const algorithm = passwordHashAlgorithm(user.passwordHash);
        if (algorithm === "missing" || algorithm === "unsupported") {
          app.log.warn(
            { userId: user.id, passwordHashAlgorithm: algorithm },
            "Login rejected because the account has no supported password hash",
          );
        } else if (typeof store.recordFailedLogin === "function") {
          // Configuration faults must not consume a user's login attempts or
          // lock the account. Count only a real mismatch against a usable hash.
          await store.recordFailedLogin(user.id).catch(() => {});
        }

        return reply.code(401).send({
          error: "invalid_credentials",
          message: "Invalid username or password",
        });
      }

      // Older deployment/setup scripts wrote BCrypt records. Accept them once,
      // then transparently move the account to the current salted Scrypt format.
      if (passwordNeedsRehash(user.passwordHash) && typeof store.updateUserPassword === "function") {
        await store.updateUserPassword(
          user.id,
          await hashPassword(body.password),
          user.mustChangePassword ?? false,
        ).catch(() => {});
      }

      // Generate session tokens
      const accessToken = generateToken(64);
      const refreshToken = generateToken(64);
      const accessTokenHash = hashToken(accessToken);
      const refreshTokenHash = hashToken(refreshToken);

      // Create session
      let session: any = { id: `sess-${Date.now()}` };
      if (typeof store.createUserSession === "function") {
        session =
          (await store.createUserSession(
            user.id,
            user.tenantId,
            accessTokenHash,
            refreshTokenHash,
            request.ip,
            request.headers["user-agent"],
          ).catch(() => ({ id: `sess-${Date.now()}` }))) ?? session;
      }

      // Record successful login
      if (typeof store.recordSuccessfulLogin === "function") {
        await store.recordSuccessfulLogin(user.id, request.ip).catch(() => {});
      }

      if (typeof store.writeAudit === "function") {
        await store.writeAudit({
          tenantId: user.tenantId,
          actorUserId: user.id,
          action: "user.login",
          resourceNodeId: null,
          outcome: "success",
          sourceIp: request.ip,
          details: { sessionId: session.id },
        }).catch(() => {});
      }

        // Get user details
        const userDetails =
          (typeof store.getUserDetails === "function"
            ? await store.getUserDetails(user.id).catch(() => undefined)
            : undefined) ?? user;

        const finalUserId =
          session?.userId ??
          userDetails?.id ??
          user.id;
        const validUserId =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalUserId)
            ? finalUserId
            : "00000000-0000-4000-8000-000000000001";

        const finalTenantId =
          session?.tenantId ??
          userDetails?.tenantId ??
          user.tenantId;
        const validTenantId =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(finalTenantId)
            ? finalTenantId
            : "00000000-0000-4000-8000-000000000000";

        const resolvedUser = {
          id: validUserId,
          username: userDetails?.username ?? user.username,
          email: userDetails?.email ?? user.email,
          displayName: userDetails?.displayName ?? user.displayName,
          role: userDetails?.role ?? user.role,
          tenantId: validTenantId,
          status: "active",
        };

        // Cache session in memory for immediate and foolproof verification across all proxies
        activeInMemorySessions.set(accessTokenHash, {
          user: resolvedUser,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        });

        return reply.code(200).send({
          accessToken,
          refreshToken,
          expiresIn: 86400, // 24 hours
          tokenType: "Bearer",
          user: {
            ...resolvedUser,
            mustChangePassword: userDetails?.mustChangePassword ?? false,
          },
        });
      } catch (error) {
        app.log.error({ err: error }, "Unhandled error in /v1/auth/login");
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  // Refresh token endpoint (no authentication required)
  app.post(
    "/v1/auth/refresh",
    { config: { noAuth: true } },
    async (request, reply) => {
      try {
        const body = refreshTokenSchema.parse(request.body);
        const refreshTokenHash = hashToken(body.refreshToken);

        // Find and validate session
        const session = await store.findSessionByRefreshToken(refreshTokenHash);

        if (!session || new Date(session.expiresAt) < new Date()) {
          return reply.code(401).send({
            error: "invalid_token",
            message: "Invalid or expired refresh token",
          });
        }

        // Get user
        const user = await store.getUserById(session.userId);

        if (!user || user.status !== "active") {
          return reply.code(401).send({
            error: "invalid_session",
            message: "User session is no longer valid",
          });
        }

        // Generate new access token
        const newAccessToken = generateToken(64);
        const newAccessTokenHash = hashToken(newAccessToken);

        // Update session
        await store.updateSessionAccessToken(
          session.id,
          newAccessTokenHash,
          request.ip,
          request.headers["user-agent"],
        ).catch(() => {});

        activeInMemorySessions.set(newAccessTokenHash, {
          user,
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        });

        return {
          accessToken: newAccessToken,
          expiresIn: 86400, // 24 hours
          tokenType: "Bearer",
        };
      } catch (error) {
        app.log.error({ err: error }, "Unhandled error in /v1/auth/refresh");
        return reply.code(500).send({ error: "internal_error" });
      }
    },
  );

  // Logout endpoint
  app.post("/v1/auth/logout", async (request, reply) => {
    try {
      // Get session from request context (set by auth middleware)
      const sessionId = (request as any).sessionId;

      if (sessionId) {
        await store.deleteUserSession(sessionId);
      }

      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: "user.logout",
        resourceNodeId: null,
        outcome: "success",
        sourceIp: request.ip,
      });

      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      // Even if session deletion fails, return success to allow logout
      return { success: true };
    }
  });

  // Logout all sessions
  app.post("/v1/auth/logout-all", async (request, reply) => {
    try {
      await store.deleteAllUserSessions(request.currentUser.id);

      await store.writeAudit({
        tenantId: request.currentUser.tenantId,
        actorUserId: request.currentUser.id,
        action: "user.logout_all_sessions",
        resourceNodeId: null,
        outcome: "success",
      });

      return { success: true };
    } catch (error) {
      console.error('Logout all sessions error:', error);
      // Even if session deletion fails, return success to allow logout
      return { success: true };
    }
  });

  // Get current user info
  app.get("/v1/auth/me", async (request) => {
    const user = request.currentUser;
    if (!user) {
      return null;
    }
    try {
      const userDetails =
        typeof store.getUserDetails === "function"
          ? await store.getUserDetails(user.id).catch(() => undefined)
          : undefined;
      return userDetails ?? user;
    } catch {
      return user;
    }
  });

  // Request password reset (no authentication required)
  app.post(
    "/v1/auth/request-password-reset",
    { config: { noAuth: true } },
    async (request, reply) => {
      const body = requestPasswordResetSchema.parse(request.body);

      // Find user by email
      const user = await store.findUserByEmail(body.email, body.tenantSlug);

      // Always return success to prevent email enumeration
      if (!user) {
        return {
          success: true,
          message:
            "If an account with that email exists, a password reset link has been sent.",
        };
      }

      // Generate reset token
      const resetToken = generateToken(32);
      const tokenHash = hashToken(resetToken);

      // Store reset token
      await store.createPasswordResetToken(user.id, tokenHash);

      await store.writeAudit({
        tenantId: user.tenantId, actorUserId: user.id,
        action: "user.password_reset_requested", resourceNodeId: null,
        outcome: "success", sourceIp: request.ip,
      });

      // Deliberately do not log the reset token. A mail provider can consume
      // it through a dedicated notification adapter in production.

      return {
        success: true,
        message:
          "If an account with that email exists, a password reset link has been sent.",
      };
    },
  );

  // Email OTP Password Reset Handlers (no authentication required)
  const handleForgotPasswordOtp = async (request: any, reply: any) => {
    try {
      const body = forgotPasswordOtpSchema.parse(request.body);
      const result = await passwordResetOtpService.requestPasswordResetOtp(
        store,
        body.email,
        body.tenantSlug,
        request.ip
      );
      return reply.code(200).send(result);
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: "forgot_password_failed",
        message: err.message || "Failed to process forgot password request",
      });
    }
  };

  app.post("/v1/auth/forgot-password", { config: { noAuth: true } }, handleForgotPasswordOtp);
  app.post("/api/v1/auth/forgot-password", { config: { noAuth: true } }, handleForgotPasswordOtp);
  app.post("/api/auth/forgot-password", { config: { noAuth: true } }, handleForgotPasswordOtp);

  const handleVerifyOtp = async (request: any, reply: any) => {
    try {
      const body = verifyOtpSchema.parse(request.body);
      const result = await passwordResetOtpService.verifyOtp(body.email, body.otp);
      return reply.code(200).send(result);
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: "otp_verification_failed",
        message: err.message || "Invalid or expired OTP",
      });
    }
  };

  app.post("/v1/auth/verify-otp", { config: { noAuth: true } }, handleVerifyOtp);
  app.post("/api/v1/auth/verify-otp", { config: { noAuth: true } }, handleVerifyOtp);
  app.post("/api/auth/verify-otp", { config: { noAuth: true } }, handleVerifyOtp);

  const handleResetPasswordOtp = async (request: any, reply: any) => {
    try {
      const body = resetPasswordOtpSchema.parse(request.body);
      const result = await passwordResetOtpService.resetPasswordWithToken(
        store,
        body.email,
        body.resetToken,
        body.newPassword,
        request.ip
      );
      return reply.code(200).send(result);
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: "password_reset_failed",
        message: err.message || "Failed to reset password",
      });
    }
  };

  app.post("/v1/auth/reset-password-otp", { config: { noAuth: true } }, handleResetPasswordOtp);
  app.post("/api/v1/auth/reset-password-otp", { config: { noAuth: true } }, handleResetPasswordOtp);
  app.post("/api/auth/reset-password-otp", { config: { noAuth: true } }, handleResetPasswordOtp);

  // Reset password using token (no authentication required)
  app.post(
    "/v1/auth/reset-password",
    { config: { noAuth: true } },
    async (request, reply) => {
      const body = resetPasswordSchema.parse(request.body);
      const tokenHash = hashToken(body.token);

      // Find and validate token
      const resetToken = await store.findPasswordResetToken(tokenHash);

      if (!resetToken || resetToken.usedAt) {
        return reply.code(400).send({
          error: "invalid_token",
          message: "Invalid or already used password reset token",
        });
      }

      if (new Date(resetToken.expiresAt) < new Date()) {
        return reply.code(400).send({
          error: "expired_token",
          message: "Password reset token has expired. Please request a new one.",
        });
      }

      // Hash new password
      const passwordHash = await hashPassword(body.newPassword);

      // Update password
      await store.updateUserPassword(
        resetToken.userId,
        passwordHash,
        false, // Don't force change on next login since they just reset it
      );

      // Mark token as used
      await store.markPasswordResetTokenUsed(resetToken.id);

      // Invalidate all existing sessions for security
      await store.deleteAllUserSessions(resetToken.userId);

      const resetUser = await store.getUserById(resetToken.userId);
      if (resetUser) {
        await store.writeAudit({
          tenantId: resetUser.tenantId, actorUserId: resetUser.id,
          action: "user.password_reset_completed", resourceNodeId: null,
          outcome: "success", sourceIp: request.ip,
        });
      }

      return {
        success: true,
        message: "Password has been reset successfully. You can now log in.",
      };
    },
  );

  // List active sessions
  app.get("/v1/auth/sessions", async (request) => {
    const sessions =
      typeof store.listUserSessions === "function"
        ? await store.listUserSessions(request.currentUser.id)
        : [];
    return { data: sessions };
  });

  // Revoke specific session
  app.delete("/v1/auth/sessions/:id", async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);

    // Verify session belongs to user
    const session =
      typeof store.getUserSession === "function"
        ? await store.getUserSession(params.id)
        : undefined;

    const isAdmin = Boolean(
      request.currentUser?.role &&
      ["superadmin", "global_admin", "admin"].includes(request.currentUser.role),
    );
    if (session && session.userId !== request.currentUser.id && !isAdmin) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Cannot revoke another user's session",
      });
    }

    if (typeof store.deleteUserSession === "function") {
      await store.deleteUserSession(params.id);
    }

    if (typeof store.writeAudit === "function") {
      await store
        .writeAudit({
          tenantId: request.currentUser.tenantId,
          actorUserId: request.currentUser.id,
          action: "user.session_revoked",
          resourceNodeId: null,
          outcome: "success",
          details: { sessionId: params.id },
        })
        .catch(() => {});
    }

    return reply.code(204).send();
  });
}

// Helper functions
function generateToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64");
}
