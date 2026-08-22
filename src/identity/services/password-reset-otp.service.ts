import { createHash, randomBytes, randomInt } from "node:crypto";
import type { AuthenticationStore, ControlPlaneStore, UserManagementStore } from "../../control-plane-store.js";
import { hashPassword } from "../../security/password.js";
import { SmtpEmailProvider } from "../../notifications/infrastructure/providers/smtp-email.provider.js";

export interface OtpRecord {
  email: string;
  userId?: string;
  tenantId?: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  lastRequestedAt: number;
}

export interface ResetTokenRecord {
  email: string;
  userId?: string;
  tenantId?: string;
  tokenHash: string;
  expiresAt: number;
}

export class PasswordResetOtpService {
  private readonly otps = new Map<string, OtpRecord>();
  private readonly resetTokens = new Map<string, ResetTokenRecord>();
  private readonly emailProvider = new SmtpEmailProvider();

  /**
   * Masks email for privacy (e.g. j***n@domain.com)
   */
  maskEmail(email: string): string {
    const parts = email.split("@");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return email;
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) {
      return `${name[0]}*@${domain}`;
    }
    const visibleStart = name.slice(0, 1);
    const visibleEnd = name.slice(-1);
    const masked = "*".repeat(Math.max(3, name.length - 2));
    return `${visibleStart}${masked}${visibleEnd}@${domain}`;
  }

  private hash(val: string): string {
    return createHash("sha256").update(val).digest("hex");
  }

  /**
   * 1. Request a 6-digit OTP code to be sent to user's email
   */
  async requestPasswordResetOtp(
    store: ControlPlaneStore & Partial<UserManagementStore> & Partial<AuthenticationStore>,
    email: string,
    tenantSlug?: string,
    ipAddress?: string
  ): Promise<{
    success: boolean;
    message: string;
    maskedEmail: string;
    expiresInSeconds: number;
    previewOtp?: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const anyStore = store as any;

    // Find user in store
    let user: any = null;
    if (typeof anyStore.findUserByEmail === "function") {
      user = await anyStore.findUserByEmail(normalizedEmail, tenantSlug);
    } else if (anyStore.users instanceof Map) {
      user = Array.from(anyStore.users.values()).find(
        (u: any) => u.email?.toLowerCase() === normalizedEmail || u.username?.toLowerCase() === normalizedEmail
      );
    }

    if (!user) {
      throw new Error(`No registered account found with email: ${normalizedEmail}`);
    }

    // Cooldown check (60 seconds between resends)
    const existing = this.otps.get(normalizedEmail);
    if (existing && Date.now() - existing.lastRequestedAt < 60000) {
      const waitSec = Math.ceil((60000 - (Date.now() - existing.lastRequestedAt)) / 1000);
      throw new Error(`Please wait ${waitSec} seconds before requesting a new verification code.`);
    }

    // Generate 6-digit cryptographic numeric OTP
    const otp = randomInt(100000, 1000000).toString();
    const otpHash = this.hash(otp);
    const expiresInSeconds = 600; // 10 minutes
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    const otpRecord: OtpRecord = {
      email: normalizedEmail,
      userId: user?.id,
      tenantId: user?.tenantId,
      otpHash,
      expiresAt,
      attempts: 0,
      lastRequestedAt: Date.now(),
    };

    this.otps.set(normalizedEmail, otpRecord);

    const masked = this.maskEmail(normalizedEmail);

    // Send email dispatch
    try {
      await this.emailProvider.send({
        id: `pwd-reset-${randomBytes(8).toString("hex")}`,
        tenantId: user?.tenantId || "default",
        alertId: "password-reset",
        channel: "email",
        destination: normalizedEmail,
        priority: "P1",
        payload: {
          subject: "Sentinel Grid - Password Reset Verification Code",
          text: `Your password reset verification code is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request a password reset, please ignore this email or contact your security administrator.`,
        },
        status: "PENDING",
        attempts: 0,
        maxAttempts: 3,
        retryCount: 0,
        createdAt: new Date(),
      } as any);
    } catch (sendErr) {
      console.warn(`[PasswordResetOtpService] Email delivery notice: ${sendErr}`);
    }

    console.info(`[PasswordResetOtpService] OTP generated for ${masked}. Code expires in 10 minutes.`);

    if (user && typeof store.writeAudit === "function") {
      await store
        .writeAudit({
          tenantId: user.tenantId || "default",
          actorUserId: user.id || "anonymous",
          action: "user.password_reset_otp_requested",
          resourceNodeId: null,
          outcome: "success",
          sourceIp: ipAddress,
        })
        .catch(() => {});
    }

    // In non-production environments or when testing, include previewOtp for seamless UX
    const isDevOrTest = process.env.NODE_ENV !== "production" || process.env.VITEST === "true";

    return {
      success: true,
      message: `A 6-digit verification code has been sent to ${masked}`,
      maskedEmail: masked,
      expiresInSeconds,
      previewOtp: isDevOrTest ? otp : undefined,
    };
  }

  /**
   * 2. Verify 6-digit OTP code and exchange for a one-time password reset token
   */
  async verifyOtp(
    email: string,
    otp: string
  ): Promise<{
    success: boolean;
    resetToken: string;
    message: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    const record = this.otps.get(normalizedEmail);
    if (!record) {
      throw new Error("No active password reset request found for this email. Please request a new code.");
    }

    if (Date.now() > record.expiresAt) {
      this.otps.delete(normalizedEmail);
      throw new Error("The verification code has expired. Please request a new one.");
    }

    if (record.attempts >= 5) {
      this.otps.delete(normalizedEmail);
      throw new Error("Too many failed attempts. For security, please request a new verification code.");
    }

    const providedHash = this.hash(cleanOtp);
    if (providedHash !== record.otpHash) {
      record.attempts++;
      const remaining = 5 - record.attempts;
      throw new Error(`Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
    }

    // OTP matches! Consume OTP and issue 15-minute reset token
    this.otps.delete(normalizedEmail);

    const rawResetToken = randomBytes(32).toString("hex");
    const tokenHash = this.hash(rawResetToken);

    this.resetTokens.set(normalizedEmail, {
      email: normalizedEmail,
      userId: record.userId,
      tenantId: record.tenantId,
      tokenHash,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 mins
    });

    return {
      success: true,
      resetToken: rawResetToken,
      message: "Verification code verified successfully. You may now set your new password.",
    };
  }

  /**
   * 3. Reset password using the verified reset token
   */
  async resetPasswordWithToken(
    store: ControlPlaneStore & Partial<UserManagementStore> & Partial<AuthenticationStore>,
    email: string,
    resetToken: string,
    newPassword: string,
    ipAddress?: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!newPassword || newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters in length.");
    }

    const tokenRecord = this.resetTokens.get(normalizedEmail);
    if (!tokenRecord) {
      throw new Error("Invalid or expired reset session. Please request a new verification code.");
    }

    if (Date.now() > tokenRecord.expiresAt) {
      this.resetTokens.delete(normalizedEmail);
      throw new Error("Reset session has expired. Please request a new verification code.");
    }

    const providedTokenHash = this.hash(resetToken.trim());
    if (providedTokenHash !== tokenRecord.tokenHash) {
      throw new Error("Invalid reset token. Please verify your OTP again.");
    }

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // Update password in store
    let updated = false;
    const anyStore = store as any;
    if (tokenRecord.userId && typeof anyStore.updateUserPassword === "function") {
      await anyStore.updateUserPassword(tokenRecord.userId, passwordHash, false);
      updated = true;
    } else if (anyStore.users instanceof Map) {
      for (const [id, u] of anyStore.users.entries()) {
        if ((u as any).email?.toLowerCase() === normalizedEmail || (u as any).username?.toLowerCase() === normalizedEmail) {
          anyStore.users.set(id, {
            ...u,
            passwordHash,
            updatedAt: new Date().toISOString(),
          } as any);
          updated = true;
          break;
        }
      }
    }

    if (!updated) {
      throw new Error("User account could not be found to update password.");
    }

    // Invalidate reset token
    this.resetTokens.delete(normalizedEmail);

    // Invalidate existing sessions
    if (tokenRecord.userId && typeof store.deleteAllUserSessions === "function") {
      await store.deleteAllUserSessions(tokenRecord.userId).catch(() => {});
    }

    // Write audit event
    if (tokenRecord.userId && typeof store.writeAudit === "function") {
      await store
        .writeAudit({
          tenantId: tokenRecord.tenantId || "default",
          actorUserId: tokenRecord.userId,
          action: "user.password_reset_otp_completed",
          resourceNodeId: null,
          outcome: "success",
          sourceIp: ipAddress,
        })
        .catch(() => {});
    }

    console.info(`[PasswordResetOtpService] Password reset successfully for ${this.maskEmail(normalizedEmail)}`);

    return {
      success: true,
      message: "Password has been successfully updated. You can now log in with your new password.",
    };
  }
}

export const passwordResetOtpService = new PasswordResetOtpService();
