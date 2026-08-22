import { describe, expect, it } from 'vitest';
import { parseDahuaStorageText, parseHikvisionStorageXml, parseSmartctlJson } from '../src/maintenance/smart-collector.js';

describe('parseSmartctlJson', () => {
  it('extracts real SMART telemetry from smartctl JSON output', () => {
    const telemetry = parseSmartctlJson(
      {
        smart_status: { passed: true },
        model_name: 'ST1000LM049-2GH172',
        serial_number: 'Z1A2B3C4',
        ata_smart_attributes: {
          table: [
            { name: 'Temperature_Celsius', value: 41, raw: { value: 41 } },
            { name: 'Power_On_Hours', value: 8124, raw: { value: 8124 } },
            { name: 'Reallocated_Sector_Ct', value: 98, raw: { value: 3 } },
            { name: 'Current_Pending_Sector', value: 1, raw: { value: 1 } },
            { name: 'Offline_Uncorrectable', value: 2, raw: { value: 2 } },
            { name: 'UDMA_CRC_Error_Count', value: 0, raw: { value: 0 } },
          ],
        },
      },
      '/dev/sda',
    );

    expect(telemetry.telemetrySource).toBe('real');
    expect(telemetry.telemetryCapability).toBe('smart');
    expect(telemetry.model).toBe('ST1000LM049-2GH172');
    expect(telemetry.serialNumber).toBe('Z1A2B3C4');
    expect(telemetry.temperature).toBe(41);
    expect(telemetry.powerOnHours).toBe(8124);
    expect(telemetry.reallocatedSectors).toBe(3);
    expect(telemetry.pendingSectors).toBe(1);
    expect(telemetry.uncorrectableSectors).toBe(2);
    expect(telemetry.smartStatus).toBe('warning');
  });

  it('keeps recorder slot state separate when drive-level SMART is unavailable', () => {
    const telemetry = parseDahuaStorageText(
      'Storage[0].Name=Disk1\nStorage[0].State=Normal\nStorage[1].Name=Disk2\nStorage[1].State=Normal',
    );

    expect(telemetry).toMatchObject({ telemetryCapability: 'storage-status', storageStatus: 'present', smartStatus: 'unknown' });
  });

  it('reports vendor slot failures without claiming they are SMART results', () => {
    expect(parseDahuaStorageText('Storage[0].State=Error')).toMatchObject({
      telemetryCapability: 'storage-status', storageStatus: 'failed', smartStatus: 'unknown',
    });
    expect(parseHikvisionStorageXml('<hdd><status>error</status></hdd>')).toMatchObject({
      telemetryCapability: 'storage-status', storageStatus: 'failed', smartStatus: 'unknown',
    });
  });
});
