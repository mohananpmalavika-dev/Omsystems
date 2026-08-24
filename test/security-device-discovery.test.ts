import { describe, expect, it, vi } from 'vitest';
import { SecurityDeviceDiscoveryService } from '../dashboard/lib/backend/security-device-discovery-service';

describe('security device discovery listing', () => {
  it('normalizes pending status, returns all rows, and removes enrolled duplicates', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'discovered-1',
            discovery_job_id: 'job-1',
            ip_address: '192.168.1.10',
            mac_address: 'AA:BB:CC:DD:EE:01',
            serial_number: 'CAM-001',
            protocol: 'ONVIF',
            capabilities: [],
            metadata: {},
            discovered_at: new Date(),
            confidence: '95',
            enrollment_status: 'PENDING_REVIEW',
          },
          {
            id: 'duplicate-discovered-1',
            discovery_job_id: 'job-2',
            ip_address: '192.168.1.10',
            mac_address: 'aa:bb:cc:dd:ee:01',
            serial_number: 'cam-001',
            protocol: 'ONVIF',
            capabilities: [],
            metadata: {},
            discovered_at: new Date(),
            confidence: '90',
            enrollment_status: 'PENDING_REVIEW',
          },
          {
            id: 'discovered-2',
            discovery_job_id: 'job-1',
            ip_address: '192.168.1.11',
            mac_address: 'AA:BB:CC:DD:EE:02',
            serial_number: 'CAM-002',
            protocol: 'ONVIF',
            capabilities: [],
            metadata: {},
            discovered_at: new Date(),
            confidence: '88',
            enrollment_status: 'PENDING_REVIEW',
          },
        ],
      });

    const service = new SecurityDeviceDiscoveryService({ query } as any);
    const devices = await service.listDiscoveredDevices(undefined, 'pending');

    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      id: 'discovered-1',
      jobId: 'job-1',
      enrollmentStatus: 'PENDING_REVIEW',
    });

    const countSql = query.mock.calls[0][0] as string;
    const dataSql = query.mock.calls[1][0] as string;
    expect(countSql).toContain('NOT EXISTS');
    expect(countSql).toContain('security_devices');
    expect(dataSql).not.toContain('LIMIT');
    expect(query.mock.calls[0][1]).toEqual(['default-tenant', 'PENDING_REVIEW']);
  });

  it('stages a device without relying on a missing IP unique constraint', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = new SecurityDeviceDiscoveryService({ query } as any);

    await (service as any).saveDiscoveredDevice(
      'tenant-1',
      'branch-1',
      'job-1',
      {
        ipAddress: '192.168.1.10',
        protocol: 'ONVIF',
        capabilities: [],
        metadata: {},
        confidence: 95,
      }
    );

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('WITH updated AS');
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).not.toContain('ON CONFLICT');
  });
});
