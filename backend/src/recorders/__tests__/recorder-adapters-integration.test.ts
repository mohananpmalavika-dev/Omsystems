/**
 * Canonical Recorder Adapters Integration & Verification Tests
 * 
 * Verifies ONVIF, Dahua/CP PLUS, and Hikvision canonical adapters.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OnvifRecorderAdapter } from '../adapters/onvif-recorder.adapter.js';
import { DahuaRecorderAdapter } from '../adapters/dahua-recorder.adapter.js';
import { HikvisionRecorderAdapter } from '../adapters/hikvision-recorder.adapter.js';
import type { Recorder } from '../types/index.js';
import type { RecorderConnection } from '../recorder-adapter.interface.js';

describe('Canonical Recorder Adapters Suite', () => {
  const mockRecorder: Recorder = {
    id: 'rec-001',
    tenantId: 'tenant-123',
    branchNodeId: 'branch-178',
    vendor: 'generic',
    model: 'TestNVR',
    ipAddress: '192.168.1.100',
    port: 80,
    protocol: 'http',
    channels: 16
  };

  const mockConnection: RecorderConnection = {
    ipAddress: '192.168.1.100',
    port: 80,
    protocol: 'http',
    credentials: {
      username: 'admin',
      password: 'SecretPassword123'
    }
  };

  // ============================================================================
  // 1. ONVIF Adapter Tests
  // ============================================================================
  describe('OnvifRecorderAdapter', () => {
    let adapter: OnvifRecorderAdapter;

    beforeEach(() => {
      adapter = new OnvifRecorderAdapter(
        { ...mockRecorder, vendor: 'onvif' },
        mockConnection
      );
    });

    it('declares ONVIF capabilities correctly', () => {
      const caps = adapter.getCapabilities();
      expect(caps.liveStreamStatus).toBe(true);
      expect(caps.recordingStatus).toBe(true);
      expect(caps.archiveSearch).toBe(true);
      expect(caps.storageStatus).toBe(true);
      expect(caps.diskHealth).toBe(false); // Standard ONVIF does not have S.M.A.R.T.
      expect(caps.deviceTime).toBe(true);
      expect(caps.channelEnumeration).toBe(true);
    });

    it('parses GetDeviceInformation SOAP response', async () => {
      const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
        <soap:Body>
          <tds:GetDeviceInformationResponse>
            <tds:Manufacturer>CP PLUS ONVIF</tds:Manufacturer>
            <tds:Model>CP-UVR-1601K1</tds:Model>
            <tds:FirmwareVersion>V3.2.1.2026</tds:FirmwareVersion>
            <tds:SerialNumber>CPP12345678</tds:SerialNumber>
            <tds:HardwareId>HW-1.0</tds:HardwareId>
          </tds:GetDeviceInformationResponse>
        </soap:Body>
      </soap:Envelope>`;

      // Mock httpClient.post
      (adapter as any).httpClient.post = vi.fn().mockResolvedValue({
        status: 200,
        data: sampleXml
      });

      const result = await adapter.getDeviceInfo();
      expect(result.status).toBe('healthy');
      expect(result.value?.manufacturer).toBe('CP PLUS ONVIF');
      expect(result.value?.model).toBe('CP-UVR-1601K1');
      expect(result.value?.serialNumber).toBe('CPP12345678');
      expect(result.value?.firmwareVersion).toBe('V3.2.1.2026');
    });

    it('parses GetProfiles SOAP response for channel enumeration', async () => {
      const sampleProfilesXml = `<?xml version="1.0" encoding="UTF-8"?>
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
        <soap:Body>
          <trt:GetProfilesResponse>
            <trt:Profiles token="Profile_1">
              <trt:Name>CAM01_MainStream</trt:Name>
              <trt:VideoSourceConfiguration>
                <trt:SourceToken>VideoSource_1</trt:SourceToken>
              </trt:VideoSourceConfiguration>
            </trt:Profiles>
            <trt:Profiles token="Profile_2">
              <trt:Name>CAM02_MainStream</trt:Name>
              <trt:VideoSourceConfiguration>
                <trt:SourceToken>VideoSource_2</trt:SourceToken>
              </trt:VideoSourceConfiguration>
            </trt:Profiles>
          </trt:GetProfilesResponse>
        </soap:Body>
      </soap:Envelope>`;

      (adapter as any).httpClient.post = vi.fn().mockResolvedValue({
        status: 200,
        data: sampleProfilesXml
      });

      const result = await adapter.getChannels();
      expect(result.status).toBe('healthy');
      expect(result.value).toHaveLength(2);
      expect(result.value?.[0].id).toBe('Profile_1');
      expect(result.value?.[0].name).toBe('CAM01_MainStream');
      expect(result.value?.[1].id).toBe('Profile_2');
    });

    it('parses GetStorageConfigurations SOAP response', async () => {
      const sampleStorageXml = `<?xml version="1.0" encoding="UTF-8"?>
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
        <soap:Body>
          <tds:GetStorageConfigurationsResponse>
            <tds:StorageConfiguration token="storage_1">
              <tds:Data>
                <tds:TotalBytes>4000000000000</tds:TotalBytes>
                <tds:UsedBytes>3200000000000</tds:UsedBytes>
              </tds:Data>
            </tds:StorageConfiguration>
          </tds:GetStorageConfigurationsResponse>
        </soap:Body>
      </soap:Envelope>`;

      (adapter as any).httpClient.post = vi.fn().mockResolvedValue({
        status: 200,
        data: sampleStorageXml
      });

      const result = await adapter.getStorageStatus();
      expect(result.status).toBe('healthy');
      expect(result.totalBytes).toBe(4000000000000);
      expect(result.usedBytes).toBe(3200000000000);
      expect(result.usagePercent).toBe(80);
      expect(result.disks).toHaveLength(1);
    });

    it('parses GetSystemDateAndTime SOAP response into UTC Date', async () => {
      const sampleTimeXml = `<?xml version="1.0" encoding="UTF-8"?>
      <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
        <soap:Body>
          <tds:GetSystemDateAndTimeResponse>
            <tds:SystemDateAndTime>
              <tds:UTCDateTime>
                <tds:Time>
                  <tds:Hour>10</tds:Hour>
                  <tds:Minute>15</tds:Minute>
                  <tds:Second>30</tds:Second>
                </tds:Time>
                <tds:Date>
                  <tds:Year>2026</tds:Year>
                  <tds:Month>8</tds:Month>
                  <tds:Day>16</tds:Day>
                </tds:Date>
              </tds:UTCDateTime>
            </tds:SystemDateAndTime>
          </tds:GetSystemDateAndTimeResponse>
        </soap:Body>
      </soap:Envelope>`;

      (adapter as any).httpClient.post = vi.fn().mockResolvedValue({
        status: 200,
        data: sampleTimeXml
      });

      const result = await adapter.getDeviceTime();
      expect(result.status).toBe('healthy');
      expect(result.value?.getUTCFullYear()).toBe(2026);
      expect(result.value?.getUTCMonth()).toBe(7); // 0-indexed August
      expect(result.value?.getUTCDate()).toBe(16);
      expect(result.value?.getUTCHours()).toBe(10);
    });
  });

  // ============================================================================
  // 2. Dahua & CP PLUS Adapter Tests
  // ============================================================================
  describe('DahuaRecorderAdapter', () => {
    let adapter: DahuaRecorderAdapter;

    beforeEach(() => {
      adapter = new DahuaRecorderAdapter(
        { ...mockRecorder, vendor: 'dahua' },
        mockConnection
      );
    });

    it('parses Dahua/CP PLUS getSystemInfo response and detects CP PLUS OEM', async () => {
      const sampleCgi = `vendor=CP PLUS
model=CP-UVR-1601E1-CS
serialNumber=CP20260816999
version=3.218.0000000.4.R
deviceType=DVR`;

      (adapter as any).httpClient.request = vi.fn().mockResolvedValue({
        status: 200,
        data: sampleCgi
      });

      const result = await adapter.getDeviceInfo();
      expect(result.status).toBe('healthy');
      expect(result.value?.manufacturer).toBe('CP PLUS');
      expect(result.value?.model).toBe('CP-UVR-1601E1-CS');
      expect(result.value?.serialNumber).toBe('CP20260816999');
      expect(result.value?.firmwareVersion).toBe('3.218.0000000.4.R');
    });

    it('parses Dahua ChannelTitle and VideoLoss indexes', async () => {
      const sampleTitle = `table.ChannelTitle[0].Name=Entrance Main
table.ChannelTitle[1].Name=Cash Counter
table.ChannelTitle[2].Name=Vault Room`;

      const sampleLoss = `indexes[0]=1`; // Channel 1 has video loss

      (adapter as any).httpClient.request = vi.fn().mockImplementation((config: any) => {
        if (config.url?.includes('ChannelTitle') || config.params?.name === 'ChannelTitle') {
          return Promise.resolve({ status: 200, data: sampleTitle });
        }
        if (config.url?.includes('VideoLoss') || config.params?.code === 'VideoLoss') {
          return Promise.resolve({ status: 200, data: sampleLoss });
        }
        return Promise.resolve({ status: 200, data: '' });
      });

      const result = await adapter.getChannels();
      expect(result.status).toBe('healthy');
      expect(result.value).toHaveLength(3);
      expect(result.value?.[0].name).toBe('Entrance Main');
      expect(result.value?.[0].videoLoss).toBe(false);
      expect(result.value?.[1].name).toBe('Cash Counter');
      expect(result.value?.[1].videoLoss).toBe(true);
    });

    it('parses Dahua storageDevice.cgi and detects failed disks', async () => {
      const sampleStorage = `info[0].Name=SATA1
info[0].Status=ok
info[0].TotalBytes=4000000000000
info[0].UsedBytes=3000000000000
info[1].Name=SATA2
info[1].Status=failed
info[1].TotalBytes=4000000000000
info[1].UsedBytes=0`;

      (adapter as any).httpClient.request = vi.fn().mockResolvedValue({
        status: 200,
        data: sampleStorage
      });

      const result = await adapter.getStorageStatus();
      expect(result.status).toBe('unhealthy');
      expect(result.errorCode).toBe('DISK_FAILED');
      expect(result.disks).toHaveLength(2);
      expect(result.disks?.[0].state).toBe('normal');
      expect(result.disks?.[1].state).toBe('failed');
    });

    it('parses Dahua getCurrentTime response', async () => {
      const sampleTime = `result=2026-08-16 10:15:30`;

      (adapter as any).httpClient.request = vi.fn().mockResolvedValue({
        status: 200,
        data: sampleTime
      });

      const result = await adapter.getDeviceTime();
      expect(result.status).toBe('healthy');
      expect(result.value?.getUTCFullYear()).toBe(2026);
      expect(result.value?.getUTCMonth()).toBe(7);
      expect(result.value?.getUTCDate()).toBe(16);
    });
  });

  // ============================================================================
  // 3. Hikvision Adapter Tests
  // ============================================================================
  describe('HikvisionRecorderAdapter', () => {
    let adapter: HikvisionRecorderAdapter;

    beforeEach(() => {
      adapter = new HikvisionRecorderAdapter(
        { ...mockRecorder, vendor: 'hikvision' },
        mockConnection
      );
    });

    it('parses Hikvision deviceInfo XML response', async () => {
      const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
      <DeviceInfo xmlns="http://www.hikvision.com/ver20/XMLSchema" version="2.0">
        <deviceName>HO-NVR-01</deviceName>
        <model>DS-7616NI-K2</model>
        <serialNumber>DS-7616NI-K21620260816CCRR</serialNumber>
        <firmwareVersion>V4.74.200</firmwareVersion>
        <macAddress>00:1a:2b:3c:4d:5e</macAddress>
      </DeviceInfo>`;

      (adapter as any).httpClient.request = vi.fn().mockResolvedValue({
        status: 200,
        data: sampleXml
      });

      const result = await adapter.getDeviceInfo();
      expect(result.status).toBe('healthy');
      expect(result.value?.manufacturer).toBe('Hikvision');
      expect(result.value?.model).toBe('DS-7616NI-K2');
      expect(result.value?.serialNumber).toBe('DS-7616NI-K21620260816CCRR');
      expect(result.value?.firmwareVersion).toBe('V4.74.200');
    });

    it('parses Hikvision channels and status XML', async () => {
      const sampleChannelsXml = `<?xml version="1.0" encoding="UTF-8"?>
      <VideoInputChannelList version="2.0">
        <VideoInputChannel>
          <id>1</id>
          <name>ATM Lobby</name>
          <enabled>true</enabled>
        </VideoInputChannel>
        <VideoInputChannel>
          <id>2</id>
          <name>Back Office</name>
          <enabled>true</enabled>
        </VideoInputChannel>
      </VideoInputChannelList>`;

      const sampleStatusXml = `<?xml version="1.0" encoding="UTF-8"?>
      <InputProxyChannelStatusList version="2.0">
        <InputProxyChannelStatus>
          <id>1</id>
          <online>true</online>
        </InputProxyChannelStatus>
        <InputProxyChannelStatus>
          <id>2</id>
          <online>false</online>
        </InputProxyChannelStatus>
      </InputProxyChannelStatusList>`;

      (adapter as any).httpClient.request = vi.fn().mockImplementation((config: any) => {
        if (config.url.includes('channels/status')) {
          return Promise.resolve({ status: 200, data: sampleStatusXml });
        }
        return Promise.resolve({ status: 200, data: sampleChannelsXml });
      });

      const result = await adapter.getChannels();
      expect(result.status).toBe('healthy');
      expect(result.value).toHaveLength(2);
      expect(result.value?.[0].name).toBe('ATM Lobby');
      expect(result.value?.[0].videoLoss).toBeFalsy();
      expect(result.value?.[1].name).toBe('Back Office');
      expect(result.value?.[1].videoLoss).toBe(true);
    });

    it('parses Hikvision Storage XML and calculates volume health', async () => {
      const sampleStorageXml = `<?xml version="1.0" encoding="UTF-8"?>
      <Storage version="2.0">
        <hddList>
          <hdd>
            <id>1</id>
            <name>HDD1</name>
            <status>ok</status>
            <capacity>3815447</capacity>
            <freeSpace>800000</freeSpace>
          </hdd>
          <hdd>
            <id>2</id>
            <name>HDD2</name>
            <status>warning</status>
            <capacity>3815447</capacity>
            <freeSpace>100000</freeSpace>
          </hdd>
        </hddList>
      </Storage>`;

      (adapter as any).httpClient.request = vi.fn().mockResolvedValue({
        status: 200,
        data: sampleStorageXml
      });

      const result = await adapter.getStorageStatus();
      expect(result.status).toBe('healthy');
      expect(result.disks).toHaveLength(2);
      expect(result.disks?.[0].state).toBe('normal');
      expect(result.disks?.[1].state).toBe('warning');
    });

    it('generates valid CMSearchDescription XML for archive search', async () => {
      const from = new Date('2026-08-16T00:00:00Z');
      const to = new Date('2026-08-16T10:00:00Z');

      const xml = (adapter as any).buildSearchRequest('1', from, to, 'descending');
      expect(xml).toContain('<CMSearchDescription>');
      expect(xml).toContain('<trackID>101</trackID>'); // Channel 1 -> Track 101
      expect(xml).toContain('<startTime>2026-08-16T00:00:00.000Z</startTime>');
      expect(xml).toContain('<endTime>2026-08-16T10:00:00.000Z</endTime>');
    });

    it('parses search results from Hikvision CMSearchDescription response', async () => {
      const sampleSearchXml = `<?xml version="1.0" encoding="UTF-8"?>
      <CMSearchDescriptionResult version="2.0">
        <matchList>
          <searchMatchItem>
            <trackID>101</trackID>
            <startTime>2026-08-16T08:00:00Z</startTime>
            <endTime>2026-08-16T09:00:00Z</endTime>
            <fileSize>1048576000</fileSize>
          </searchMatchItem>
        </matchList>
      </CMSearchDescriptionResult>`;

      (adapter as any).httpClient.request = vi.fn().mockResolvedValue({
        status: 200,
        data: sampleSearchXml
      });

      const latest = await adapter.getLatestRecording('1');
      expect(latest).not.toBeNull();
      expect(latest?.startTime.toISOString()).toBe('2026-08-16T08:00:00.000Z');
      expect(latest?.endTime.toISOString()).toBe('2026-08-16T09:00:00.000Z');
      expect(latest?.sizeBytes).toBe(1048576000);
    });
  });
});
