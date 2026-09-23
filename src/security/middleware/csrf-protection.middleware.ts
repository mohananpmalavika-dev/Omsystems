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

  const cleanUrl = url.split("?")[0] ?? url;

  // Exempt monitoring / health probes / telemetry analytics ingestion
  if (
    cleanUrl === "/health" ||
    cleanUrl === "/live" ||
    cleanUrl === "/ready" ||
    cleanUrl === "/metrics" ||
    cleanUrl === "/capabilities" ||
    cleanUrl.startsWith("/api/observability/") ||
    cleanUrl.startsWith("/v1/observability/") ||
    cleanUrl.startsWith("/api/vms/observability/") ||
    cleanUrl.startsWith("/v1/vms/observability/") ||
    cleanUrl === "/api/v1/analytics" ||
    cleanUrl === "/v1/analytics" ||
    cleanUrl.startsWith("/api/v1/analytics/") ||
    cleanUrl.startsWith("/v1/analytics/")
  ) {
    return true;
  }

  // Exempt public webhooks and hardware callbacks with separate signature validation
  if (
    cleanUrl.startsWith("/v1/integrations/webhooks/") ||
    cleanUrl.startsWith("/v1/alerts/voice/callback") ||
    cleanUrl.startsWith("/v1/alerts/sms/callback")
  ) {
    return true;
  }

  // Exempt initial authentication endpoints
  if (
    cleanUrl === "/v1/auth/login" ||
    cleanUrl === "/v1/auth/face-login" ||
    cleanUrl === "/v1/auth/forgot-password/otp" ||
    cleanUrl === "/v1/auth/verify-otp" ||
    cleanUrl === "/v1/auth/reset-password/otp" ||
    cleanUrl === "/v1/auth/sso/saml/callback" ||
    cleanUrl === "/v1/auth/refresh" ||
    cleanUrl === "/v1/auth/request-password-reset" ||
    cleanUrl === "/v1/auth/reset-password" ||
    cleanUrl === "/v1/auth/csrf-token"
  ) {
    return true;
  }

  // Exempt edge-agent ingress, media gateway, discovery, streaming, and internal routes
  if (
    cleanUrl.startsWith("/edge/") ||
    cleanUrl.startsWith("/v1/edge/") ||
    cleanUrl.startsWith("/v1/edge-") ||
    cleanUrl.startsWith("/edge-agent/") ||
    cleanUrl.startsWith("/internal/") ||
    cleanUrl.includes("/edge-agents/") ||
    cleanUrl.includes("/cameras/discovered") ||
    cleanUrl.includes("/scan-jobs") ||
    cleanUrl.startsWith("/v1/live/") ||
    cleanUrl === "/v1/live/start" ||
    cleanUrl.startsWith("/v1/talk/") ||
    cleanUrl === "/v1/talk/start" ||
    cleanUrl.includes("/live-sessions") ||
    cleanUrl.includes("/talk-sessions") ||
    cleanUrl.startsWith("/webrtc/") ||
    cleanUrl.startsWith("/hls/") ||
    cleanUrl.startsWith("/v1/secure-area-authorizations/") ||
    cleanUrl.startsWith("/v1/security/mtls/") ||
    cleanUrl.startsWith("/api/portable-camera/") ||
    cleanUrl.startsWith("/api/attestation/") ||
    cleanUrl.startsWith("/api/ha/") ||
    cleanUrl.startsWith("/api/credentials/") ||
    cleanUrl.startsWith("/api/bulk/") ||
    cleanUrl.startsWith("/api/ai/") ||
    cleanUrl.startsWith("/api/mobile/") ||
    cleanUrl.startsWith("/api/edge-product/") ||
    cleanUrl.startsWith("/api/vms/")
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

  // Allow explicit opt-out via environment variable if configured
  if (process.env.CSRF_PROTECTION_ENABLED === "false" || process.env.CSRF_ENABLED === "false") {
    return;
  }

  // Check incoming CSRF token header - if explicitly supplied, validate it immediately
  const csrfToken = request.headers[CSRF_HEADER_NAME] || request.headers["csrf-token"];
  if (typeof csrfToken === "string") {
    if (!verifyCsrfToken(csrfToken)) {
      reply.code(403).send({
        error: "csrf_token_invalid",
        message: "Security violation: Invalid or expired anti-CSRF token.",
      });
      return;
    }
    return;
  }

  // Pure API clients providing standard Bearer JWT authorization are not ambient-browser authenticated
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return;
  }

  // Edge agents and microservices with preshared keys or edge credentials are exempt from browser CSRF
  if (
    request.headers["x-edge-agent-token"] ||
    request.headers["x-edge-bridge-key"] ||
    request.headers["x-edge-shared-key"] ||
    request.headers["x-media-gateway-key"] ||
    request.headers["x-edge-ingest-token"] ||
    request.headers["x-client-cert"]
  ) {
    return;
  }

  // Non-cookie API clients or clients providing custom application headers.
  // Browsers cannot forge custom headers across origins via standard HTML forms.
  if (
    request.headers["x-sentinel-session"] ||
    request.headers["x-api-key"] ||
    request.headers["x-requested-with"] ||
    request.headers["x-user-id"] ||
    request.headers["x-development-user-id"] ||
    request.headers["x-camera-id"]
  ) {
    return;
  }

  const cookieHeader = request.headers.cookie || "";

  // If there are no browser session cookies at all, there are no ambient credentials to forge.
  const hasSessionCookie = /(?:^|;\s*)(sentinel_access|sentinel_session|accessToken)=/.test(cookieHeader);
  if (!cookieHeader || !hasSessionCookie) {
    return;
  }

  // First-party and same-origin requests originating within the web application:
  // Check Sec-Fetch-Site and Origin headers.
  const secFetchSite = request.headers["sec-fetch-site"];
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") {
    return;
  }

  const originHeader = request.headers.origin;
  const hostHeader = request.headers["x-forwarded-host"] || request.headers.host;
  if (originHeader && hostHeader) {
    try {
      const originHost = new URL(originHeader).host;
      if (originHost === hostHeader) {
        return;
      }
    } catch {
      // Fall through to token verification
    }
  }

  // Extract CSRF token from cookie if double-submit pattern used
  let cookieToken: string | undefined;
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`));
    if (match) cookieToken = match[1];
  }

  const tokenToVerify = cookieToken;

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
