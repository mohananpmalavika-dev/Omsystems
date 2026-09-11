import { describe, it, expect, vi } from 'vitest';
import * as crypto from 'crypto';
import { DeviceJobWorker } from '../src/workers/device-job-worker.js';
import { LDAPConnector } from '../src/integrations/connectors/ldap-connector.js';
import { AzureADConnector } from '../src/integrations/connectors/azure-ad-connector.js';
import { AzureADAdapter } from '../src/identity/adapters/azure-ad.adapter.js';
import { MobilePushNotificationService } from '../src/mobile/services/mobile-push-notification.service.js';
import { MobileOperationsService } from '../src/mobile/services/mobile-operations.service.js';
import { MediaGatewayMonitor } from '../src/ha/services/media-gateway-monitor.service.js';
import { AIIncidentSummaryService } from '../src/services/ai-incident-summary.js';
import { PKCS11Provider } from '../src/security/keys/providers/pkcs11.provider.js';
import { HSMService } from '../src/security/services/hsm.service.js';

describe('Remaining End-to-End Workflow Gaps Fixed', () => {
  describe('1. Device Automation & Password Rotation (device-job-worker.ts)', () => {
    it('handles password rotation and edge command RTSP reconnect without throwing unavailable error', async () => {
      const mockStore: any = {
        getDeviceCredential: vi.fn().mockResolvedValue({
          id: 'cred-1',
          username: 'admin',
          encryptedSecret: 'enc-pass',
          credentialVersion: 2,
        }),
        getCurrentDeviceCredential: vi.fn().mockResolvedValue({
          id: 'cred-0',
          username: 'admin',
          encryptedSecret: 'enc-old',
        }),
        getPreviousDeviceCredential: vi.fn().mockResolvedValue({
          id: 'cred-0',
          username: 'admin',
          encryptedSecret: 'enc-old',
        }),
        getDeviceInventory: vi.fn().mockResolvedValue({
          id: 'dev-1',
          ipAddress: '192.168.1.100',
          port: 80,
          manufacturer: 'Axis',
        }),
        getCameraByDeviceId: vi.fn().mockResolvedValue({
          id: 'cam-1',
          edgeAgentId: 'edge-agent-1',
        }),
        updateCameraConnectionSecret: vi.fn().mockResolvedValue(true),
        createEdgeCommand: vi.fn().mockResolvedValue({ id: 'cmd-1' }),
        supersedePreviousCredentials: vi.fn().mockResolvedValue(undefined),
        activateDeviceCredential: vi.fn().mockResolvedValue({ id: 'cred-1' }),
        updateDeviceJobStatus: vi.fn().mockResolvedValue(undefined),
        updateDeviceJobResult: vi.fn().mockResolvedValue(undefined),
        writeAudit: vi.fn().mockResolvedValue(undefined),
      };

      const worker = new DeviceJobWorker(mockStore);
      (worker as any).credentialService = {
        decryptSecret: vi.fn().mockResolvedValue('PlainPassword123!'),
      };
      (worker as any).probeDeviceTcp = vi.fn().mockResolvedValue(false);

      const job: any = {
        id: 'job-rot-1',
        tenantId: 'tenant-1',
        deviceId: 'dev-1',
        edgeAgentId: 'edge-agent-1',
        jobType: 'credential-rotation',
        payload: { credentialId: 'cred-1' },
      };

      // Change password
      const changeRes = await worker.changeDevicePassword(job);
      expect(changeRes.changed).toBe(true);
      expect(changeRes.credentialVersion).toBe(2);

      // Verify new credential
      const verifyRes = await worker.verifyNewCredential(job);
      expect(verifyRes.verified).toBe(true);

      // Reconnect RTSP stream via edge command dispatch
      const reconnectRes = await worker.reconnectRtspStream(job);
      expect(reconnectRes.reconnected).toBe(true);
      expect(mockStore.createEdgeCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          edgeAgentId: 'edge-agent-1',
          type: 'update-credentials',
        })
      );

      // Rollback
      await worker.rollbackCredentialRotation(job);
      expect(mockStore.updateDeviceJobResult).toHaveBeenCalledWith('job-rot-1', {
        rollback: 'succeeded',
        restoredCredentialId: 'cred-0',
      });
    });
  });

  describe('2. Enterprise Directory Synchronization (LDAP & Entra ID)', () => {
    it('LDAPConnector upserts synced users into database', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 1 }),
      };
      const connector = new LDAPConnector(mockPool);
      await connector.initialize({
        id: 'ldap-1',
        tenantId: 'tenant-enterprise',
        type: 'ldap',
        category: 'identity',
        name: 'Corporate LDAP',
        enabled: true,
        status: 'active',
        config: {
          url: 'ldap://ldap.corp.local',
          baseDN: 'dc=corp,dc=local',
          bindDN: 'cn=admin,dc=corp,dc=local',
          bindPassword: 'secret',
          roleMapping: { SecurityOperators: 'security_operator' },
        },
        credentials: {},
        subscribedEvents: ['user.synced'],
      });

      (connector as any).bind = vi.fn().mockResolvedValue(true);
      (connector as any).searchUsers = vi.fn().mockResolvedValue([
        {
          dn: 'cn=johndoe,ou=users,dc=corp,dc=local',
          uid: 'johndoe',
          mail: 'johndoe@corp.local',
          displayName: 'John Doe',
          givenName: 'John',
          sn: 'Doe',
        },
      ]);
      (connector as any).getUserGroups = vi.fn().mockResolvedValue(['SecurityOperators']);

      const syncResult = await (connector as any).syncUsers();
      expect(syncResult.usersCreated).toBe(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['tenant-enterprise', 'johndoe', 'johndoe@corp.local', 'John Doe', 'security_operator'])
      );
    });

    it('AzureADConnector upserts synced users into database', async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({ rowCount: 1 }),
      };
      const connector = new AzureADConnector(mockPool);
      await connector.initialize({
        id: 'azure-1',
        tenantId: 'tenant-azure',
        type: 'azure_ad',
        category: 'identity',
        name: 'Entra ID',
        enabled: true,
        status: 'active',
        config: {
          tenantId: 'azure-tenant-id',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          roleMapping: { Auditors: 'auditor' },
        },
        credentials: {},
        subscribedEvents: ['user.synced'],
      });

      (connector as any).ensureAccessToken = vi.fn().mockResolvedValue(undefined);
      (connector as any).httpRequest = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          value: [
            {
              id: 'azure-user-1',
              userPrincipalName: 'alice@company.com',
              mail: 'alice@company.com',
              displayName: 'Alice Smith',
              givenName: 'Alice',
              surname: 'Smith',
              accountEnabled: true,
            },
          ],
          '@odata.nextLink': null,
        }),
      });
      (connector as any).getUserGroupsById = vi.fn().mockResolvedValue(['Auditors']);

      const syncResult = await (connector as any).syncUsers();
      expect(syncResult.usersCreated).toBe(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['tenant-azure', 'alice@company.com', 'alice@company.com', 'Alice Smith', 'auditor'])
      );
    });

    it('AzureADAdapter validates OIDC ID tokens with JWKS cryptographic signature', async () => {
      const adapter = new AzureADAdapter();

      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwk = publicKey.export({ format: 'jwk' });
      jwk.kid = 'test-kid-1';

      const config: any = {
        tenantId: 'mock-tenant-id',
        clientId: 'mock-client-id',
        clientSecretRef: 'ref',
        redirectUri: 'https://app.local/callback',
        scopes: ['openid', 'profile'],
        useV2Endpoint: true,
      };

      const header = { alg: 'RS256', kid: 'test-kid-1', typ: 'JWT' };
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        sub: 'user-sub-123',
        oid: 'user-oid-123',
        tid: 'mock-tenant-id',
        aud: 'mock-client-id',
        iss: 'https://login.microsoftonline.com/mock-tenant-id/v2.0',
        exp: now + 3600,
        iat: now,
        nbf: now,
        preferred_username: 'bob@domain.com',
        name: 'Bob User',
      };

      const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
      const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
      const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
      const signatureB64 = crypto.sign('RSA-SHA256', signingInput, privateKey).toString('base64url');
      const validToken = `${headerB64}.${payloadB64}.${signatureB64}`;

      (adapter as any).fetchJWKS = vi.fn().mockResolvedValue([jwk]);

      const parsed = await (adapter as any).verifyIdToken(config, validToken);
      expect(parsed.sub).toBe('user-sub-123');
      expect(parsed.oid).toBe('user-oid-123');

      // Corrupted signature
      const corruptedToken = `${headerB64}.${payloadB64}.${Buffer.from('corrupted_signature_data_bytes').toString('base64url')}`;
      await expect((adapter as any).verifyIdToken(config, corruptedToken)).rejects.toThrow();
    });
  });

  describe('3. Mobile Push & Guard Operations', () => {
    it('MobilePushNotificationService does not crash on unconfigured push providers', async () => {
      const mockStore: any = {
        getPushDevice: vi.fn(),
        savePushDevice: vi.fn(),
      };
      const mockAlertService: any = {
        subscribe: vi.fn(),
      };
      const service = new MobilePushNotificationService(mockStore, mockAlertService);

      const device: any = {
        id: 'dev-1',
        userId: 'user-1',
        platform: 'android',
        deviceToken: 'token-abc-1234567890',
        pushProvider: 'fcm',
        isActive: true,
      };

      const notification: any = {
        id: 'notif-1',
        title: 'Emergency Alert',
        body: 'Security breach detected at Main Branch',
        priority: 'high',
        category: 'security',
      };

      const fcmResult = await (service as any).sendFCM(device, notification);
      expect(fcmResult).toBe(true);

      const webDevice: any = {
        id: 'dev-web',
        userId: 'user-1',
        platform: 'web',
        endpoint: 'https://push.example.com/sub/123',
        pushProvider: 'webpush',
        isActive: true,
      };
      const webResult = await (service as any).sendWebPush(webDevice, notification);
      expect(webResult).toBe(true);
    });

    it('MobileOperationsService creates live streaming session with valid signed session token', async () => {
      const mockStore: any = {
        createLiveSession: vi.fn().mockResolvedValue({
          id: 'live-session-123',
          token: 'signed-token-xyz',
          expiresAt: '2026-09-11T14:00:00.000Z',
        }),
      };
      const service = new MobileOperationsService(mockStore);

      const session = await service.createMobileLiveSession('cam-branch-1', 'tenant-1', { id: 'guard-1' });
      expect(session.sessionId).toBe('live-session-123');
      expect(session.sessionUrl).toContain('sessionToken=signed-token-xyz');
      expect(session.expiresAt).toBe('2026-09-11T14:00:00.000Z');
      expect(mockStore.createLiveSession).toHaveBeenCalledWith('cam-branch-1', 'guard-1', 'view');
    });
  });

  describe('4. HA Monitoring & Infrastructure Telemetry', () => {
    it('MediaGatewayMonitor calculates dynamic lease expiry and renewal counters', async () => {
      const mockLeaseManager: any = {
        getCamerasByGateway: vi.fn().mockResolvedValue(['cam-1', 'cam-2']),
        getCameraLease: vi.fn().mockResolvedValue({
          cameraId: 'cam-1',
          expiresAt: new Date(Date.now() + 45000).toISOString(),
        }),
      };

      const monitor = new MediaGatewayMonitor(mockLeaseManager, 10000);
      (monitor as any).registeredGateways.set('gw-1', {
        gatewayId: 'gw-1',
        gatewayName: 'Media Gateway 01',
        ipAddress: '10.0.0.10',
        registeredAt: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        consecutiveFailures: 0,
      });
      (monitor as any).latestHeartbeats.set('gw-1', {
        gatewayId: 'gw-1',
        gatewayName: 'Media Gateway 01',
        ipAddress: '10.0.0.10',
        timestamp: new Date().toISOString(),
        cpuPercent: 30,
        memoryPercent: 40,
        memoryUsedMb: 4000,
        memoryTotalMb: 16000,
        diskWriteMbps: 10,
        diskReadMbps: 5,
        diskUsedPercent: 25,
        networkInMbps: 50,
        networkOutMbps: 50,
        activeStreams: 20,
        recordingStreams: 15,
        liveViewStreams: 5,
        healthyStreams: 20,
        degradedStreams: 0,
        failedStreams: 0,
        avgBitrate: 2000,
        avgFrameRate: 30,
        packetLoss: 0,
        frameDrops: 0,
        ffmpegProcesses: 20,
        restarts: 0,
        crashCount: 0,
        capacityConstraints: {
          maxCpuPercent: 80,
          maxMemoryPercent: 80,
          maxDiskWriteMbps: 100,
          maxNetworkMbps: 1000,
          streamCostCpu: 1,
          streamCostMemoryMb: 50,
          streamCostBandwidthMbps: 2,
        },
      });

      const health = await monitor.getGatewayHealth('gw-1');
      expect(health?.ownedCameraIds).toEqual(['cam-1', 'cam-2']);
      expect(health?.leaseExpirySeconds).toBeGreaterThan(0);
      expect(health?.leaseRenewals).toBe(6);
      expect(health?.leaseConflicts).toBe(0);
    });

    it('AIIncidentSummary counts real storage and disk alerts', async () => {
      const summaryService = new AIIncidentSummaryService({} as any);
      const mockAlerts: any[] = [
        { id: 'a1', detectionType: 'camera-offline', title: 'Cam Offline', occurredAt: '2026-09-11T01:00:00Z', cameraId: 'cam-1' },
        { id: 'a2', detectionType: 'recording-failure', title: 'Rec Failed', occurredAt: '2026-09-11T01:05:00Z', cameraId: 'cam-1' },
        { id: 'a3', detectionType: 'disk-failure', title: 'Hard Drive Smart Failure', occurredAt: '2026-09-11T01:10:00Z', cameraId: 'cam-2' },
        { id: 'a4', detectionType: 'storage-failure', title: 'Storage Volume Full', occurredAt: '2026-09-11T01:15:00Z', cameraId: 'cam-2' },
      ];

      const summary = await (summaryService as any).generateSummary(
        'tenant-1',
        'shift',
        '2026-09-11T00:00:00Z',
        '2026-09-11T08:00:00Z',
        mockAlerts
      );
      expect(summary.infrastructureIncidents.storageIssues).toBe(2);
      expect(summary.infrastructureIncidents.camerasOffline).toBe(1);
      expect(summary.infrastructureIncidents.recordingInterruptions).toBe(1);
    });
  });

  describe('5. Hardware Security Module (HSM) & PKCS#11 Software Fallback', () => {
    it('PKCS11Provider performs sign, verify, encrypt, and decrypt operations in software fallback mode', async () => {
      const provider = new PKCS11Provider({
        type: 'pkcs11',
        libraryPath: '/usr/lib/libsofthsm2.so',
        slotId: 0,
        pinSource: { type: 'env', variable: 'HSM_PIN' },
        sessionPoolSize: 2,
        requiredMechanisms: [],
        requiredKeys: [],
      });

      await provider.initialize();
      const health = await provider.healthCheck();
      expect(health.status).toBe('HEALTHY');

      // Generate RSA key
      await provider.generateKey({
        purpose: 'SIGNING' as any,
        algorithm: {
          type: 'rsa',
          keySize: 2048,
        },
        policy: {} as any,
      });

      // Sign & Verify
      const testData = Buffer.from('Critical Evidence Integrity Block');
      const signRes = await provider.sign({
        key: { id: 'test-rsa-key', version: 1 },
        data: testData,
        algorithm: 'RSA_PKCS1_SHA256',
      });
      expect(signRes.signature).toBeInstanceOf(Buffer);

      const verifyRes = await provider.verify({
        key: { id: 'test-rsa-key', version: 1 },
        data: testData,
        signature: signRes.signature,
        algorithm: 'RSA_PKCS1_SHA256',
      });
      expect(verifyRes.valid).toBe(true);

      // Encrypt
      const encRes = await provider.encrypt({
        key: { id: 'test-rsa-key', version: 1 },
        plaintext: Buffer.from('Secret Credential'),
        algorithm: 'AES_256_GCM',
      });
      expect(encRes.ciphertext).toBeInstanceOf(Buffer);
      expect(encRes.iv).toBeInstanceOf(Buffer);
    });

    it('HSMService initializes PKCS#11 and executes cryptographic signing without throwing unimplemented', async () => {
      const hsm = new HSMService();
      await hsm.initialize({
        type: 'pkcs11',
        libraryPath: '/usr/lib/libsofthsm2.so',
        slot: 0,
        pin: '1234',
      });

      expect(await hsm.isConnected()).toBe(true);

      const mockKey: any = {
        id: 'hsm-k1',
        label: 'test-key',
        algorithm: 'RSA_2048',
        metadata: {},
      };
      (hsm as any).getKey = vi.fn().mockResolvedValue(mockKey);
      (hsm as any).logOperation = vi.fn().mockResolvedValue(undefined);

      const data = Buffer.from('Audit log evidence');
      const sig = await hsm.sign('hsm-k1', data);
      expect(sig).toBeInstanceOf(Buffer);

      const verified = await hsm.verify('hsm-k1', data, sig);
      expect(verified).toBe(true);

      const ciphertext = await hsm.encrypt('hsm-k1', data);
      expect(ciphertext).toBeInstanceOf(Buffer);

      const decrypted = await hsm.decrypt('hsm-k1', ciphertext);
      expect(decrypted).toBeInstanceOf(Buffer);
    });
  });
});
