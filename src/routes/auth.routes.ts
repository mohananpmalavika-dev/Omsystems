import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import type {
  AuthenticationStore,
  ControlPlaneStore,
  UserManagementStore,
} from "../control-plane-store.js";
import { hashPassword, verifyPassword } from "../security/password.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  tenantSlug: z.string().min(1).optional(),
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
  // Login endpoint (no authentication required)
  app.post(
    "/v1/auth/login",
    { config: { noAuth: true } },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);

      // Find user by username
      const user = await store.findUserByUsername(
        body.username,
        body.tenantSlug,
      );

      if (!user) {
        // Generic error to prevent username enumeration
        return reply.code(401).send({
          error: "invalid_credentials",
          message: "Invalid username or password",
        });
      }

      // Check if account is locked
      const isLocked = await store.checkAccountLockout(user.id);
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
      const isPasswordValid = await verifyPassword(
        body.password,
        user.passwordHash,
      );

      if (!isPasswordValid) {
        // Record failed login attempt
        await store.recordFailedLogin(user.id);

        return reply.code(401).send({
          error: "invalid_credentials",
          message: "Invalid username or password",
        });
      }

      // Generate session tokens
      const accessToken = generateToken(64);
      const refreshToken = generateToken(64);
      const accessTokenHash = hashToken(accessToken);
      const refreshTokenHash = hashToken(refreshToken);

      // Create session
      const session = await store.createUserSession(
        user.id,
        user.tenantId,
        accessTokenHash,
        refreshTokenHash,
        request.ip,
        request.headers["user-agent"],
      );

      // Record successful login
      await store.recordSuccessfulLogin(user.id, request.ip);

      // Get user details
      const userDetails = await store.getUserDetails(user.id);

      return {
        accessToken,
        refreshToken,
        expiresIn: 3600, // 1 hour
        tokenType: "Bearer",
        user: {
          id: userDetails.id,
          username: userDetails.username,
          email: userDetails.email,
          displayName: userDetails.displayName,
          role: userDetails.role,
          tenantId: userDetails.tenantId,
          mustChangePassword: userDetails.mustChangePassword,
        },
      };
    },
  );

  // Refresh token endpoint (no authentication required)
  app.post(
    "/v1/auth/refresh",
    { config: { noAuth: true } },
    async (request, reply) => {
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
      );

      return {
        accessToken: newAccessToken,
        expiresIn: 3600, // 1 hour
        tokenType: "Bearer",
      };
    },
  );

  // Logout endpoint
  app.post("/v1/auth/logout", async (request, reply) => {
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
  });

  // Logout all sessions
  app.post("/v1/auth/logout-all", async (request, reply) => {
    await store.deleteAllUserSessions(request.currentUser.id);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId,
      actorUserId: request.currentUser.id,
      action: "user.logout_all_sessions",
      resourceNodeId: null,
      outcome: "success",
    });

    return { success: true };
  });

  // Get current user info
  app.get("/v1/auth/me", async (request) => {
    const userDetails = await store.getUserDetails(request.currentUser.id);
    return userDetails;
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

      // Deliberately do not log the reset token. A mail provider can consume
      // it through a dedicated notification adapter in production.

      return {
        success: true,
        message:
          "If an account with that email exists, a password reset link has been sent.",
      };
    },
  );

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

      return {
        success: true,
        message: "Password has been reset successfully. You can now log in.",
      };
    },
  );

  // List active sessions
  app.get("/v1/auth/sessions", async (request) => {
    const sessions = await store.listUserSessions(request.currentUser.id);
    return { data: sessions };
  });

  // Revoke specific session
  app.delete("/v1/auth/sessions/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    // Verify session belongs to user
    const session = await store.getUserSession(params.id);

    if (!session || session.userId !== request.currentUser.id) {
      return reply.code(404).send({ error: "session_not_found" });
    }

    await store.deleteUserSession(params.id);

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
