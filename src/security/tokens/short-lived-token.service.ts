/**
 * Short-Lived Access Token Service
 * Banking-Grade 15-minute access tokens with unique JTI anti-replay
 * and an in-memory / Redis Token Revocation List (TRL).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface TokenClaims {
  sub: string;       // Subject (userId)
  tid: string;       // Tenant ID
  jti: string;       // JWT ID (unique per token)
  iat: number;       // Issued At (unix seconds)
  exp: number;       // Expiry (unix seconds)
  roles: string[];   // Assigned roles
  branchScope?: string[]; // Branch IDs this token is scoped to
  sessionId?: string;
}

export interface IssuedToken {
  accessToken: string; // Signed opaque token string
  claims: TokenClaims;
  expiresAt: string;
}

export interface TokenValidationResult {
  valid: boolean;
  claims?: TokenClaims;
  rejectionReason?: string;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

function getJwtSecret(): Buffer {
  const secret = process.env.VAULT_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "VAULT_JWT_SECRET must be set (min 32 chars). Never use a weak or missing JWT secret in production.",
    );
  }
  return Buffer.from(secret, "utf8");
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function parseBase64url(str: string): Buffer {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function signToken(header: object, payload: object, secret: Buffer): string {
  const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${base64url(sig)}`;
}

export class ShortLivedTokenService {
  /** In-memory TRL: Set of revoked JTIs */
  private revokedJtis = new Map<string, number>(); // jti -> expiry unix seconds

  /**
   * Issue a new 15-minute access token.
   */
  issue(params: {
    userId: string;
    tenantId: string;
    roles: string[];
    branchScope?: string[];
    sessionId?: string;
  }): IssuedToken {
    const secret = getJwtSecret();
    const now = Math.floor(Date.now() / 1000);
    const jti = randomBytes(16).toString("hex");

    const claims: TokenClaims = {
      sub: params.userId,
      tid: params.tenantId,
      jti,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
      roles: params.roles,
      branchScope: params.branchScope,
      sessionId: params.sessionId,
    };

    const header = { alg: "HS256", typ: "JWT" };
    const accessToken = signToken(header, claims, secret);

    return {
      accessToken,
      claims,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
    };
  }

  /**
   * Verify a token. Returns valid + claims or a rejection reason.
   */
  verify(accessToken: string): TokenValidationResult {
    const parts = accessToken.split(".");
    if (parts.length !== 3) {
      return { valid: false, rejectionReason: "Malformed token: expected 3 segments" };
    }

    const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

    // 1. Verify HMAC signature (timing-safe comparison)
    let secret: Buffer;
    try {
      secret = getJwtSecret();
    } catch (err) {
      return { valid: false, rejectionReason: `JWT secret error: ${err instanceof Error ? err.message : String(err)}` };
    }

    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = createHmac("sha256", secret).update(signingInput).digest();
    const actualSig = parseBase64url(sigB64);

    if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
      return { valid: false, rejectionReason: "Invalid signature" };
    }

    // 2. Parse claims
    let claims: TokenClaims;
    try {
      claims = JSON.parse(parseBase64url(payloadB64).toString("utf8")) as TokenClaims;
    } catch {
      return { valid: false, rejectionReason: "Failed to parse token payload" };
    }

    // 3. Expiry check
    const now = Math.floor(Date.now() / 1000);
    if (now > claims.exp) {
      return { valid: false, rejectionReason: `Token expired at ${new Date(claims.exp * 1000).toISOString()}` };
    }

    // 4. Token Revocation List check
    if (this.revokedJtis.has(claims.jti)) {
      return { valid: false, rejectionReason: `Token JTI ${claims.jti} has been revoked` };
    }

    return { valid: true, claims };
  }

  /**
   * Instantly revoke a specific token by JTI.
   */
  revoke(jti: string, expirySeconds?: number): void {
    const exp = expirySeconds ?? Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;
    this.revokedJtis.set(jti, exp);
  }

  /**
   * Revoke a token by its full token string (extracts JTI automatically).
   */
  revokeToken(accessToken: string): void {
    const result = this.verify(accessToken);
    if (result.claims?.jti) {
      this.revoke(result.claims.jti, result.claims.exp);
    }
  }

  /**
   * Revoke ALL tokens for a given user (session logout / security incident).
   * Requires a token registry in production; here we mark the current JTI.
   */
  revokeAll(userId: string, tokenList: string[]): number {
    let revoked = 0;
    for (const token of tokenList) {
      const result = this.verify(token);
      if (result.claims?.sub === userId && result.claims.jti) {
        this.revoke(result.claims.jti, result.claims.exp);
        revoked++;
      }
    }
    return revoked;
  }

  /**
   * Prune expired entries from the TRL to prevent unbounded growth.
   */
  pruneExpiredRevocations(): number {
    const now = Math.floor(Date.now() / 1000);
    let pruned = 0;
    for (const [jti, exp] of this.revokedJtis.entries()) {
      if (exp < now) {
        this.revokedJtis.delete(jti);
        pruned++;
      }
    }
    return pruned;
  }

  /** Count active revocations in TRL */
  getTrlSize(): number {
    return this.revokedJtis.size;
  }
}

export const shortLivedTokenService = new ShortLivedTokenService();
