/**
 * Media Token Issuer Service (Control-Plane)
 * Evaluates RBAC permissions, selects optimal media plane node,
 * and issues short-lived, cryptographically signed JWT media tokens.
 *
 * NOTE: The control plane NEVER touches or proxies video frames.
 */

import { createHmac, randomUUID } from 'node:crypto';
import {
  IssueMediaTokenRequest,
  MediaTokenIssueResult,
  MediaTokenClaims,
  MediaAccessPermission,
} from '../domain/media-token.types.js';
import { MediaPlaneRegistryService, mediaPlaneRegistry } from './media-plane-registry.service.js';

export class MediaTokenIssuerService {
  private secretKey: string | undefined;
  private readonly DEFAULT_TTL_SECONDS = 300; // 5 minutes

  constructor(
    private readonly nodeRegistry: MediaPlaneRegistryService = mediaPlaneRegistry,
    secretKey?: string
  ) {
    this.secretKey = secretKey ?? process.env.MEDIA_TOKEN_SECRET;
  }

  setSecretKey(key: string): void {
    if (!key.trim()) throw new Error('media_token_secret_required');
    this.secretKey = key;
  }

  /**
   * Evaluates if user permissions satisfy the requested media access permission.
   */
  hasPermission(userPermissions: string[], requested: MediaAccessPermission): boolean {
    if (userPermissions.includes('admin') || userPermissions.includes('system.admin')) {
      return true;
    }

    switch (requested) {
      case 'live.view':
        return (
          userPermissions.includes('camera.live.view') ||
          userPermissions.includes('camera.view') ||
          userPermissions.includes('camera.ptz.view') ||
          userPermissions.includes('live:view')
        );
      case 'recording.playback':
        return (
          userPermissions.includes('camera.playback.view') ||
          userPermissions.includes('recording:view') ||
          userPermissions.includes('playback:view')
        );
      case 'ptz.control':
        return (
          userPermissions.includes('camera.ptz.control') ||
          userPermissions.includes('camera.ptz.admin') ||
          userPermissions.includes('ptz:control')
        );
      case 'evidence.export':
        return (
          userPermissions.includes('evidence:export') ||
          userPermissions.includes('evidence.create')
        );
      default:
        return false;
    }
  }

  /**
   * Encodes and signs a JWT token using HS256 HMAC.
   */
  private signJwt(claims: MediaTokenClaims): string {
    if (!this.secretKey) throw new Error('media_token_secret_not_configured');
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');

    const signature = createHmac('sha256', this.secretKey)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Issues a signed Media Access Token to an authorized client.
   */
  issueMediaToken(request: IssueMediaTokenRequest): MediaTokenIssueResult {
    if (!this.secretKey) {
      return { success: false, error: 'MEDIA_TOKEN_SECRET_NOT_CONFIGURED' };
    }
    if (!request.tenantId) {
      return { success: false, error: 'TENANT_ID_REQUIRED' };
    }
    // 1. RBAC Permission Validation
    const isAuthorized = this.hasPermission(request.userPermissions, request.requestedPermission);
    if (!isAuthorized) {
      return {
        success: false,
        error: `ACCESS_DENIED: User ${request.userId} lacks permission for ${request.requestedPermission} on camera ${request.cameraId}`,
      };
    }

    // 2. Select Optimal Media Plane Node
    const optimalNode = this.nodeRegistry.selectOptimalMediaNode(request.preferredRegion);
    if (!optimalNode) {
      return {
        success: false,
        error: 'NO_HEALTHY_MEDIA_NODES_AVAILABLE',
      };
    }

    // 3. Build Stream Parameters
    const profile = request.streamProfile || 'main';
    const transport = request.transport || 'WEBRTC';
    const host = optimalNode.publicHost || optimalNode.host;
    const protocol = transport === 'WEBRTC' ? 'wss' : 'https';
    const mediaRelayUrl = `${protocol}://${host}:${optimalNode.relayPort}/stream/${request.cameraId}/${profile}`;

    const nowSec = Math.floor(Date.now() / 1000);
    const ttl = request.ttlSeconds || this.DEFAULT_TTL_SECONDS;
    const expSec = nowSec + ttl;

    const claims: MediaTokenClaims = {
      sub: request.userId,
      tenantId: request.tenantId,
      branchId: request.branchId,
      cameraId: request.cameraId,
      cameraName: request.cameraName,
      permissions: [request.requestedPermission],
      streamProfile: profile,
      transport,
      purpose: request.purpose || 'LIVE_VIEW',
      mediaNodeId: optimalNode.nodeId,
      mediaRelayUrl,
      clientIp: request.clientIp,
      jti: `mtok-${randomUUID()}`,
      iat: nowSec,
      exp: expSec,
    };

    // 4. Cryptographically sign token
    const mediaToken = this.signJwt(claims);

    // Increment node stream counter
    optimalNode.activeStreams += 1;

    return {
      success: true,
      mediaToken,
      mediaRelayUrl,
      mediaNodeId: optimalNode.nodeId,
      expiresAt: new Date(expSec * 1000).toISOString(),
      expiresInSeconds: ttl,
      streamProfile: profile,
      transport,
    };
  }
}

export const mediaTokenIssuer = new MediaTokenIssuerService();
