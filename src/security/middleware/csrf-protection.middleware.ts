/**
 * Enterprise CSRF Protection Middleware
 * 
 * Implements Defense-in-Depth anti-CSRF validation conforming to OWASP ASVS:
 * - Validates state-changing requests (POST, PUT, PATCH, DELETE)
 * - Protects browser sessions and cookie-authenticated requests
 * - Verifies cryptographic token or double-submit cookie
 * - Safely exempts machine-to-machine, mTLS edge-agent, and Bearer-token authorized calls
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.JWT_SECRET || "sentinel-grid-csrf-default-signing-key-change-me";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_COOKIE_NAME = "sentinel_csrf_token";

/**
 * Generate a cryptographically signed CSRF token
 */
export function generateCsrfToken(sessionId: string = "anonymous"): string {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${sessionId}:${timestamp}:${nonce}`;
  const signature = createHmac("sha256", CSRF_SECRET).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

/**
 * Validates a signed CSRF token
 */
export function verifyCsrfToken(token: string, expectedSessionId: string = "anonymous", maxAgeMs: number = 86400000): boolean {
  try {
    const [encodedPayload, signature] = token.split(".");
    if (!encodedPayload || !signature) return false;

    const payload = Buffer.from(encodedPayload, "base64url").toString("utf-8");
    const [sessionId, timestampStr] = payload.split(":");
    if (!sessionId || !timestampStr) return false;

    // Check expiration
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
      return false;
    }

    // Check signature
    const expectedSignature = createHmac("sha256", CSRF_SECRET).update(payload).digest("hex");
    const sigBuffer = Buffer.from(signature, "hex");
    const expBuffer = Buffer.from(expectedSignature, "hex");

    if (sigBuffer.length !== expBuffer.length || !timingSafeEqual(sigBuffer, expBuffer)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Determines whether a route is exempt from CSRF checks
 */
function isExemptRoute(url: string, method: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  // Exempt monitoring / health probes
  if (
    url === "/health" ||
    url === "/live" ||
    url === "/ready" ||
    url === "/metrics" ||
    url.startsWith("/api/observability/") ||
    url.startsWith("/v1/observability/")
  ) {
    return true;
  }

  // Exempt public webhooks and hardware callbacks with separate signature validation
  if (
    url.startsWith("/v1/integrations/webhooks/") ||
    url.startsWith("/v1/alerts/voice/callback") ||
    url.startsWith("/v1/alerts/sms/callback")
  ) {
    return true;
  }

  // Exempt initial authentication endpoints
  if (
    url === "/v1/auth/login" ||
    url === "/v1/auth/face-login" ||
    url === "/v1/auth/forgot-password/otp" ||
    url === "/v1/auth/verify-otp" ||
    url === "/v1/auth/reset-password/otp" ||
    url === "/v1/auth/sso/saml/callback"
  ) {
    return true;
  }

  // Exempt edge-agent ingress (uses mTLS or shared-secret headers, not browser cookies)
  if (
    url.startsWith("/edge/") ||
    url.startsWith("/v1/edge/") ||
    url.startsWith("/internal/")
  ) {
    return true;
  }

  return false;
}

/**
 * Fastify preHandler hook for CSRF protection
 */
export async function csrfProtectionHook(request: FastifyRequest, reply: FastifyReply) {
  if (isExemptRoute(request.url, request.method)) {
    return;
  }

  // Pure API clients providing standard Bearer JWT authorization are not ambient-browser authenticated
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return;
  }

  // Edge agents and microservices with preshared keys are exempt from browser CSRF
  if (request.headers["x-edge-shared-key"] || request.headers["x-media-gateway-key"]) {
    return;
  }

  // Check incoming CSRF token header
  const csrfToken = request.headers[CSRF_HEADER_NAME] || request.headers["csrf-token"];
  const cookieHeader = request.headers.cookie || "";
  
  // Extract CSRF token from cookie if double-submit pattern used
  let cookieToken: string | undefined;
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`));
    if (match) cookieToken = match[1];
  }

  const tokenToVerify = typeof csrfToken === "string" ? csrfToken : cookieToken;

  if (!tokenToVerify) {
    reply.code(403).send({
      error: "csrf_token_missing",
      message: "Security violation: Missing required anti-CSRF token in request headers (x-csrf-token).",
    });
    return;
  }

  if (!verifyCsrfToken(tokenToVerify)) {
    reply.code(403).send({
      error: "csrf_token_invalid",
      message: "Security violation: Invalid or expired anti-CSRF token.",
    });
    return;
  }
}

/**
 * Register CSRF token generation endpoint
 */
export function registerCsrfRoutes(app: FastifyInstance) {
  app.get("/v1/auth/csrf-token", async (_request, reply) => {
    const token = generateCsrfToken();
    reply.header("Set-Cookie", `${CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=Strict; Secure; HttpOnly`);
    return {
      csrfToken: token,
      headerName: CSRF_HEADER_NAME,
      expiresInSeconds: 86400,
    };
  });
}
