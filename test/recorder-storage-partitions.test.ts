import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCgiDisks, probeCameraMemoryCard, probeRecorder } from '../edge-agent/src/monitoring/recorder-probe.js';
import { normalizeRecorderHddStatus } from '../src/operational-health/disk-health.js';

const reply = readFileSync(new URL('../edge-agent/test/fixtures/dahua-storage-partitions.txt', import.meta.url), 'utf8');

describe('physical Dahua storage with partition details', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('carries real DVR partition counters through the probe and telemetry normalizer as one disk', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(
      url.includes('magicBox') ? 'serialNumber=RECORDER\nupdateSerial=DH-XVR1B08-I/T'
        : url.includes('storageDevice') ? reply : '',
    )));
    const probe = await probeRecorder({ id: 'dvr', name: 'DVR', deviceType: 'dvr', vendor: 'cp-plus', host: '192.0.2.1', port: 80 }, 1000);
    expect(probe.hddStatus).toHaveLength(1);
    expect(normalizeRecorderHddStatus(probe.hddStatus)[0]).toMatchObject({
      id: '1', devicePath: '/dev/sda', capacityBytes: 1_971_123_650_560,
      usedBytes: 1_583_211_347_968, availableBytes: 387_912_302_592,
      detected: true, slotStatus: 'present', smartAvailable: false, writeVerification: 'unverified',
    });
  });

  it('uses the same partition parser for camera-local storage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(reply)));
    expect(await probeCameraMemoryCard({host: '192.0.2.2', port: 80, vendor: 'dahua'}, 1000))
      .toEqual(parseCgiDisks(reply));
  });

  it.each([['IsError=true', 'failed'], ['Type=ReadOnly', 'read_only']])('preserves partition failures (%s)', (field, slotStatus) => {
    const body = reply.replace(field.startsWith('IsError') ? 'IsError=false' : 'Type=ReadWrite', field);
    expect(normalizeRecorderHddStatus(parseCgiDisks(body))[0]?.slotStatus).toBe(slotStatus);
  });

  it('keeps separate physical disks separate and prefers whole-disk totals', () => {
    const disks = parseCgiDisks(`${reply}\nlist.info[0].TotalBytes=2000000000000\nlist.info[1].Name=/dev/sdb\nlist.info[1].TotalBytes=500000000000\nlist.info[1].UsedBytes=0`);
    expect(disks).toHaveLength(2);
    expect(disks[0]?.TotalBytes).toBe('2000000000000');
    expect(disks[1]).toMatchObject({diskNo: 2, FreeBytes: 500000000000});
  });

  it('does not invent capacity from an incomplete partition reply or unrelated response', () => {
    const partial = parseCgiDisks(reply.replace('TotalBytes=499929579520.000000', 'Ignored=499929579520.000000'));
    expect(partial[0]?.TotalBytes).toBeUndefined();
    expect(parseCgiDisks('OK')).toEqual([]);
    expect(parseCgiDisks('<html>login</html>')).toEqual([]);
  });

  it.each(['table.StorageDevice', 'table.DriveInfo', 'Storage.Drive'])('accepts indexed OEM disks (%s)', (prefix) => {
    expect(parseCgiDisks(`${prefix}[0].TotalBytes=1000\n${prefix}[0].FreeBytes=300`))
      .toEqual([expect.objectContaining({diskNo: 1, TotalBytes: '1000', FreeBytes: '300'})]);
  });
});
