import { describe, it, expect } from 'vitest';
import {
  MediaTokenIssuerService,
  MediaTokenValidatorService,
  MediaPlaneRegistryService,
} from '../src/media-auth/index.js';

describe('Control-Plane / Media-Plane Separation Subsystem', () => {
  it('issues signed short-lived Media Access Token without proxying video', () => {
    const registry = new MediaPlaneRegistryService();
    const issuer = new MediaTokenIssuerService(registry, 'test-secret-key-123');

    const result = issuer.issueMediaToken({
      userId: 'operator-arun',
      branchId: 'BR-27',
      cameraId: 'CAM-VAULT-14',
      cameraName: 'Branch 27 Vault Camera',
      userPermissions: ['camera.live.view'],
      requestedPermission: 'live.view',
      streamProfile: 'main',
      transport: 'WEBRTC',
      purpose: 'LIVE_VIEW',
      ttlSeconds: 300, // 5 minutes
    });

    expect(result.success).toBe(true);
    expect(result.mediaToken).toBeDefined();
    expect(result.mediaRelayUrl).toContain('wss://');
    expect(result.mediaRelayUrl).toContain('CAM-VAULT-14/main');
    expect(result.mediaNodeId).toBeDefined();
    expect(result.expiresInSeconds).toBe(300);
  });

  it('validates Media Access Token locally at the media gateway edge without DB calls', () => {
    const sharedSecret = 'test-secret-key-123';
    const registry = new MediaPlaneRegistryService();
    const issuer = new MediaTokenIssuerService(registry, sharedSecret);
    const validator = new MediaTokenValidatorService(sharedSecret);

    // 1. Control plane issues token
    const issueResult = issuer.issueMediaToken({
      userId: 'operator-arun',
      branchId: 'BR-27',
      cameraId: 'CAM-VAULT-14',
      userPermissions: ['camera.live.view'],
      requestedPermission: 'live.view',
    });

    // 2. Media plane edge validates token locally
    const validation = validator.validateToken(
      issueResult.mediaToken!,
      'CAM-VAULT-14',
      'live.view'
    );

    expect(validation.isValid).toBe(true);
    expect(validation.claims?.sub).toBe('operator-arun');
    expect(validation.claims?.cameraId).toBe('CAM-VAULT-14');
    expect(validation.claims?.permissions).toContain('live.view');
  });

  it('rejects expired media tokens', () => {
    const sharedSecret = 'test-secret-key-123';
    const registry = new MediaPlaneRegistryService();
    const issuer = new MediaTokenIssuerService(registry, sharedSecret);
    const validator = new MediaTokenValidatorService(sharedSecret);

    // Issue token with -1s TTL (already expired)
    const issueResult = issuer.issueMediaToken({
      userId: 'operator-arun',
      branchId: 'BR-27',
      cameraId: 'CAM-VAULT-14',
      userPermissions: ['camera.live.view'],
      requestedPermission: 'live.view',
      ttlSeconds: -1,
    });

    const validation = validator.validateToken(issueResult.mediaToken!);
    expect(validation.isValid).toBe(false);
    expect(validation.errorCode).toBe('TOKEN_EXPIRED');
  });

  it('rejects tampered token signatures', () => {
    const sharedSecret = 'test-secret-key-123';
    const registry = new MediaPlaneRegistryService();
    const issuer = new MediaTokenIssuerService(registry, sharedSecret);
    const validator = new MediaTokenValidatorService(sharedSecret);

    const issueResult = issuer.issueMediaToken({
      userId: 'operator-arun',
      branchId: 'BR-27',
      cameraId: 'CAM-VAULT-14',
      userPermissions: ['camera.live.view'],
      requestedPermission: 'live.view',
    });

    // Tamper token payload
    const parts = issueResult.mediaToken!.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')), cameraId: 'CAM-HACKED-01' })
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const validation = validator.validateToken(tamperedToken);
    expect(validation.isValid).toBe(false);
    expect(validation.errorCode).toBe('INVALID_SIGNATURE');
  });

  it('rejects camera mismatch and permission mismatch', () => {
    const sharedSecret = 'test-secret-key-123';
    const registry = new MediaPlaneRegistryService();
    const issuer = new MediaTokenIssuerService(registry, sharedSecret);
    const validator = new MediaTokenValidatorService(sharedSecret);

    const issueResult = issuer.issueMediaToken({
      userId: 'operator-arun',
      branchId: 'BR-27',
      cameraId: 'CAM-VAULT-14',
      userPermissions: ['camera.live.view'],
      requestedPermission: 'live.view',
    });

    // 1. Camera mismatch
    const cameraCheck = validator.validateToken(issueResult.mediaToken!, 'CAM-OTHER-99');
    expect(cameraCheck.isValid).toBe(false);
    expect(cameraCheck.errorCode).toBe('CAMERA_MISMATCH');

    // 2. Permission mismatch (token is for live.view, attempted for recording.playback)
    const permCheck = validator.validateToken(issueResult.mediaToken!, 'CAM-VAULT-14', 'recording.playback');
    expect(permCheck.isValid).toBe(false);
    expect(permCheck.errorCode).toBe('PERMISSION_DENIED');
  });

  it('selects the least-loaded healthy media node for stream assignment', () => {
    const registry = new MediaPlaneRegistryService();
    
    // Register 2 nodes with different loads
    registry.registerNode({
      nodeId: 'gw-heavy',
      nodeName: 'Heavy Gateway',
      host: '10.0.1.1',
      port: 8554,
      relayPort: 8443,
      type: 'PRIMARY_INGEST',
      region: 'ap-south-1',
      status: 'HEALTHY',
      activeStreams: 180,
      maxStreams: 200, // 90% load
      ingressMbps: 500,
      maxIngressMbps: 1000,
      lastHeartbeat: Date.now(),
    });

    registry.registerNode({
      nodeId: 'gw-light',
      nodeName: 'Light Gateway',
      host: '10.0.1.2',
      port: 8554,
      relayPort: 8443,
      type: 'PRIMARY_INGEST',
      region: 'ap-south-1',
      status: 'HEALTHY',
      activeStreams: 2,
      maxStreams: 200, // 1% load (optimal)
      ingressMbps: 10,
      maxIngressMbps: 1000,
      lastHeartbeat: Date.now(),
    });

    const issuer = new MediaTokenIssuerService(registry, 'test-secret');
    const result = issuer.issueMediaToken({
      userId: 'operator-arun',
      branchId: 'BR-27',
      cameraId: 'CAM-14',
      userPermissions: ['camera.live.view'],
      requestedPermission: 'live.view',
      preferredRegion: 'ap-south-1',
    });

    expect(result.success).toBe(true);
    expect(result.mediaNodeId).toBe('gw-light');
  });

  it('supports emergency token revocation list', () => {
    const sharedSecret = 'test-secret-key-123';
    const registry = new MediaPlaneRegistryService();
    const issuer = new MediaTokenIssuerService(registry, sharedSecret);
    const validator = new MediaTokenValidatorService(sharedSecret);

    const issueResult = issuer.issueMediaToken({
      userId: 'operator-arun',
      branchId: 'BR-27',
      cameraId: 'CAM-VAULT-14',
      userPermissions: ['camera.live.view'],
      requestedPermission: 'live.view',
    });

    // Extract JTI
    const parts = issueResult.mediaToken!.split('.');
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    const jti = claims.jti;

    // Revoke token
    validator.revokeToken(jti);

    // Validate revoked token -> Fails
    const validation = validator.validateToken(issueResult.mediaToken!);
    expect(validation.isValid).toBe(false);
    expect(validation.errorCode).toBe('TOKEN_REVOKED');
  });
});
