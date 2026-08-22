import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";
import { verifyPassword } from "../src/security/password.js";

describe("Email OTP Password Reset Flow", () => {
  it("rejects unknown email addresses", async () => {
    const store = new MemoryStore();
    const app = await buildApp({ store });

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: "nonexistent@example.com" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().success).toBe(false);
  });

  it("requests an OTP, verifies it, and resets password successfully", async () => {
    const store = new MemoryStore();
    const app = await buildApp({ store });

    const userEmail = "mgdhanyamohan@omsystems.bank";

    // 1. Request OTP
    const requestRes = await app.inject({
      method: "POST",
      url: "/v1/auth/forgot-password",
      payload: { email: userEmail },
    });

    expect(requestRes.statusCode).toBe(200);
    const requestJson = requestRes.json();
    expect(requestJson.success).toBe(true);
    expect(requestJson.maskedEmail).toBeDefined();
    expect(requestJson.previewOtp).toBeDefined(); // in dev/test mode

    const receivedOtp = requestJson.previewOtp;
    expect(receivedOtp).toMatch(/^\d{6}$/);

    // 2. Reject incorrect OTP
    const badOtpRes = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-otp",
      payload: { email: userEmail, otp: "000000" },
    });
    expect(badOtpRes.statusCode).toBe(400);
    expect(badOtpRes.json().success).toBe(false);

    // 3. Verify correct OTP and receive resetToken
    const verifyRes = await app.inject({
      method: "POST",
      url: "/v1/auth/verify-otp",
      payload: { email: userEmail, otp: receivedOtp },
    });
    expect(verifyRes.statusCode).toBe(200);
    const verifyJson = verifyRes.json();
    expect(verifyJson.success).toBe(true);
    expect(verifyJson.resetToken).toBeDefined();
    const resetToken = verifyJson.resetToken;

    // 4. Reset password with resetToken
    const newPassword = "NewSecurePassword123!";
    const resetRes = await app.inject({
      method: "POST",
      url: "/v1/auth/reset-password-otp",
      payload: {
        email: userEmail,
        resetToken,
        newPassword,
      },
    });

    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json().success).toBe(true);

    // 5. Verify user password hash was updated
    const user = Array.from(store.users.values()).find(
      (u) => u.email?.toLowerCase() === userEmail.toLowerCase()
    );
    expect(user).toBeDefined();
    const isPwValid = await verifyPassword(newPassword, (user as any).passwordHash);
    expect(isPwValid).toBe(true);
  });
});
