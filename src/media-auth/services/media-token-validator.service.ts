/**
 * Media Token Validator Service (Media-Plane)
 * Validates Media Access Tokens locally at the Media Gateway edge.
 *
 * ZERO round-trips to the Control-Plane database required.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  MediaTokenClaims,
  MediaTokenValidationResult,
  MediaAccessPermission,
} from '../domain/media-token.types.js';

export class MediaTokenValidatorService {
  private secretKey: string;
  private revokedTokens = new Set<string>(); // In-memory blacklist of revoked JTIs

  constructor(secretKey?: string) {
    this.secretKey = secretKey || process.env.MEDIA_TOKEN_SECRET || 'sentinel-media-secret-key-2026-v1';
  }

  setSecretKey(key: string): void {
    this.secretKey = key;
  }

  revokeToken(jti: string): void {
    this.revokedTokens.add(jti);
  }

  isTokenRevoked(jti: string): boolean {
    return this.revokedTokens.has(jti);
  }

  /**
   * Validates a Media Token locally without calling the Control-Plane database.
   */
  validateToken(
    token: string,
    expectedCameraId?: string,
    requiredPermission?: MediaAccessPermission
  ): MediaTokenValidationResult {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { isValid: false, error: 'Malformed JWT structure', errorCode: 'MALFORMED_TOKEN' };
      }

      const [encodedHeader, encodedPayload, signature] = parts;

      // 1. Verify Cryptographic Signature
      const expectedSignature = createHmac('sha256', this.secretKey)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

      const sigBuffer = Buffer.from(signature!, 'utf8');
      const expectedSigBuffer = Buffer.from(expectedSignature, 'utf8');

      if (
        sigBuffer.length !== expectedSigBuffer.length ||
        !timingSafeEqual(sigBuffer, expectedSigBuffer)
      ) {
        return { isValid: false, error: 'Invalid token signature', errorCode: 'INVALID_SIGNATURE' };
      }

      // 2. Decode Payload
      const payloadJson = Buffer.from(encodedPayload!, 'base64url').toString('utf8');
      const claims: MediaTokenClaims = JSON.parse(payloadJson);

      // 3. Expiration Check
      const nowSec = Math.floor(Date.now() / 1000);
      if (claims.exp <= nowSec) {
        return { isValid: false, error: 'Token has expired', errorCode: 'TOKEN_EXPIRED' };
      }

      // 4. Revocation Blacklist Check
      if (this.isTokenRevoked(claims.jti)) {
        return { isValid: false, error: 'Token has been revoked', errorCode: 'TOKEN_REVOKED' };
      }

      // 5. Camera ID Check
      if (expectedCameraId && claims.cameraId !== expectedCameraId) {
        return {
          isValid: false,
          error: `Camera mismatch: token is for ${claims.cameraId}, expected ${expectedCameraId}`,
          errorCode: 'CAMERA_MISMATCH',
        };
      }

      // 6. Permission Check
      if (requiredPermission && !claims.permissions.includes(requiredPermission)) {
        return {
          isValid: false,
          error: `Permission denied: token lacks ${requiredPermission}`,
          errorCode: 'PERMISSION_DENIED',
        };
      }

      return {
        isValid: true,
        claims,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isValid: false,
        error: `Token validation error: ${message}`,
        errorCode: 'MALFORMED_TOKEN',
      };
    }
  }
}

export const mediaTokenValidator = new MediaTokenValidatorService();
