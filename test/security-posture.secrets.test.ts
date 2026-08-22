import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityPostureService } from '../src/security/services/security-posture.service.js';
import { SecurityServicesFactory } from '../src/security/services/index.js';

describe('SecurityPostureService - secrets collector', () => {
  let postureService: SecurityPostureService;
  let factory: any;

  beforeEach(() => {
    postureService = new SecurityPostureService();
    factory = SecurityServicesFactory.getInstance();
  });

  it('returns unavailable metrics when secretVault not configured', async () => {
    // Ensure no secretVault is present
    delete (factory as any).secretVault;

    const category = await postureService['scoreSecrets']();
    expect(category.name).toBe('Secret Vault');
    expect(category.metrics[0].value).toBeNull();
    expect(category.metrics[1].value).toBeNull();
  });

  it('computes rotationCompliance and expiring secrets when secretVault is present', async () => {
    // Mock secret vault with listSecrets
    const now = new Date();
    const recent = new Date(now.getTime() - (10 * 24 * 60 * 60 * 1000)).toISOString(); // 10 days ago
    const old = new Date(now.getTime() - (200 * 24 * 60 * 60 * 1000)).toISOString(); // 200 days ago

    const secrets = [
      { id: 's1', rotationPolicy: { enabled: true, intervalDays: 90 }, lastRotatedAt: recent, expiresAt: null },
      { id: 's2', rotationPolicy: { enabled: true, intervalDays: 90 }, lastRotatedAt: old, expiresAt: null },
      { id: 's3', rotationPolicy: { enabled: false }, lastRotatedAt: null, expiresAt: null },
    ];

    const expiring = [ { id: 's4', expiresAt: new Date(now.getTime() + (10 * 24 * 60 * 60 * 1000)).toISOString() } ];
    const needsRotation = [ { id: 's2' } ];

    (factory as any).secretVault = {
      listSecrets: vi.fn(async (filters?: any) => {
        if (filters?.expiringSoon) return expiring;
        if (filters?.needsRotation) return needsRotation;
        return (secrets as any[]).concat(expiring);
      })
    };

    const category = await postureService['scoreSecrets']();
    expect(category.name).toBe('Secret Vault');
    const rotationMetric = category.metrics.find(m => m.name === 'Rotation Compliance');
    const expiringMetric = category.metrics.find(m => m.name === 'Secrets Expiring Soon');
    expect(rotationMetric).toBeDefined();
    expect(expiringMetric).toBeDefined();
    // rotationCandidates length = 2 (s1, s2) -> compliantCount = 1 => 50%
    expect(rotationMetric!.value).toBe(50);
    expect(expiringMetric!.value).toBe(1);
  });
});