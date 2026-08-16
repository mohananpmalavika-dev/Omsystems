/**
 * Recorder Health Checker Tests
 * 
 * CRITICAL: These tests verify that the system NEVER fabricates health data.
 * Focus on false-positive scenarios where broken recorders could appear healthy.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Pool } from 'pg';
import { RecorderHealthChecker } from '../recorder-health-checker.js';
import type { RecorderAdapter } from '../recorder-adapter.interface.js';
import type { Recorder, CameraWithRecorder, ComplianceState } from '../types/index.js';

// Mock pool
const mockPool = {
  query: vi.fn()
} as unknown as Pool;

// Mock recorder and camera
const mockRecorder: Recorder = {
  id: 'test-recorder-id',
  name: 'Test Recorder',
  vendor: 'hikvision',
  ipAddress: '192.168.1.100',
  port: 80,
  protocol: 'http',
  branchId: 'branch-id',
  tenantId: 'tenant-id'
};

const mockCamera: CameraWithRecorder = {
  id: 'test-camera-id',
  name: 'Test Camera',
  recordingMode: 'continuous',
  recorderId: 'test-recorder-id',
  recorderChannel: '1',
  branchId: 'branch-id',
  tenantId: 'tenant-id'
};

describe('RecorderHealthChecker - False Positive Prevention', () => {
  let checker: RecorderHealthChecker;
  
  beforeEach(() => {
    checker = new RecorderHealthChecker(mockPool);
    vi.clearAllMocks();
    
    // Mock database query for last verified healthy time
    (mockPool.query as any).mockResolvedValue({ rows: [] });
  });
  
  /**
   * TEST 1: Offline recorder must return UNKNOWN, not HEALTHY
   */
  it('should return UNKNOWN when recorder is unreachable', async () => {
    const mockAdapter: Partial<RecorderAdapter> = {
      getAdapterInfo: () => ({ type: 'test', version: '1.0.0', vendor: 'test' }),
      getCapabilities: () => ({
        liveStreamStatus: true,
        recordingStatus: true,
        archiveSearch: true,
        storageStatus: true,
        diskHealth: true,
        deviceTime: true,
        retentionQuery: true,
        channelEnumeration: true
      }),
      testConnection: vi.fn().mockResolvedValue({
        status: 'unknown' as ComplianceState,
        message: 'Connection timed out',
        errorCode: 'NETWORK_TIMEOUT',
        checkedAt: new Date()
      }),
      authenticate: vi.fn(),
      getChannel: vi.fn(),
      getStreamStatus: vi.fn(),
      getRecordingStatus: vi.fn(),
      getLatestRecording: vi.fn(),
      getOldestRecording: vi.fn(),
      getStorageStatus: vi.fn(),
      getDeviceTime: vi.fn(),
      disconnect: vi.fn()
    };
    
    const result = await checker.check({
      adapter: mockAdapter as RecorderAdapter,
      recorder: mockRecorder,
      camera: mockCamera
    });
    
    // CRITICAL: Overall status must be UNKNOWN, not HEALTHY
    expect(result.overallStatus).toBe('unknown');
    expect(result.reachable.status).toBe('unknown');
    
    // All dependent checks must also be UNKNOWN
    expect(result.recording.status).toBe('unknown');
    expect(result.archive.status).toBe('unknown');
    
    // CRITICAL: Never fabricate timestamps
    expect(result.archive.lastRecordingTime).toBeUndefined();
  });
  
  /**
   * TEST 2: Authentication failure must return UNHEALTHY, not HEALTHY
   */
  it('should return UNHEALTHY when authentication fails', async () => {
    const mockAdapter: Partial<RecorderAdapter> = {
      getAdapterInfo: () => ({ type: 'test', version: '1.0.0', vendor: 'test' }),
      getCapabilities: () => ({
        liveStreamStatus: true,
        recordingStatus: true,
        archiveSearch: true,
        storageStatus: true,
        diskHealth: true,
        deviceTime: true,
        retentionQuery: true,
        channelEnumeration: true
      }),
      testConnection: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        latencyMs: 50,
        checkedAt: new Date()
      }),
      authenticate: vi.fn().mockResolvedValue({
        status: 'unhealthy' as ComplianceState,
        value: false,
        message: 'Invalid credentials',
        errorCode: 'AUTHENTICATION_FAILED',
        checkedAt: new Date()
      }),
      getChannel: vi.fn(),
      getStreamStatus: vi.fn(),
      getRecordingStatus: vi.fn(),
      getLatestRecording: vi.fn(),
      getOldestRecording: vi.fn(),
      getStorageStatus: vi.fn(),
      getDeviceTime: vi.fn(),
      disconnect: vi.fn()
    };
    
    const result = await checker.check({
      adapter: mockAdapter as RecorderAdapter,
      recorder: mockRecorder,
      camera: mockCamera
    });
    
    // Reachable should be healthy
    expect(result.reachable.status).toBe('healthy');
    
    // Auth should be unhealthy
    expect(result.authentication.status).toBe('unhealthy');
    
    // CRITICAL: Overall cannot be healthy with auth failure
    expect(result.overallStatus).not.toBe('healthy');
    
    // Dependent checks should be unknown (cannot verify)
    expect(result.recording.status).toBe('unknown');
    expect(result.archive.status).toBe('unknown');
  });
  
  /**
   * TEST 3: Stale archive must be detected as UNHEALTHY
   */
  it('should return UNHEALTHY when archive is stale', async () => {
    // Archive from 2 hours ago (way beyond 5 minute threshold)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    const mockAdapter: Partial<RecorderAdapter> = {
      getAdapterInfo: () => ({ type: 'test', version: '1.0.0', vendor: 'test' }),
      getCapabilities: () => ({
        liveStreamStatus: true,
        recordingStatus: true,
        archiveSearch: true,
        storageStatus: true,
        diskHealth: true,
        deviceTime: true,
        retentionQuery: true,
        channelEnumeration: true
      }),
      testConnection: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      authenticate: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      getChannel: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: { id: '1', enabled: true },
        checkedAt: new Date()
      }),
      getStreamStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: 'streaming',
        checkedAt: new Date()
      }),
      getRecordingStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: 'recording',
        checkedAt: new Date()
      }),
      // CRITICAL: Return stale recording
      getLatestRecording: vi.fn().mockResolvedValue({
        recordingId: 'rec-1',
        startTime: new Date(twoHoursAgo.getTime() - 3600000),
        endTime: twoHoursAgo, // 2 hours ago
        durationSeconds: 3600
      }),
      getOldestRecording: vi.fn().mockResolvedValue({
        recordingId: 'rec-old',
        startTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000 + 3600000),
        durationSeconds: 3600
      }),
      getStorageStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        checkedAt: new Date()
      }),
      getDeviceTime: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: new Date(),
        checkedAt: new Date()
      }),
      disconnect: vi.fn()
    };
    
    const result = await checker.check({
      adapter: mockAdapter as RecorderAdapter,
      recorder: mockRecorder,
      camera: mockCamera
    });
    
    // CRITICAL: Stale archive must be UNHEALTHY
    expect(result.archive.status).toBe('unhealthy');
    expect(result.archive.archiveLagSeconds).toBeGreaterThan(300);
    
    // CRITICAL: Overall status must be UNHEALTHY
    expect(result.overallStatus).toBe('unhealthy');
    
    // CRITICAL: Must use ACTUAL timestamp, not current time
    expect(result.archive.lastRecordingTime).toEqual(twoHoursAgo);
  });
  
  /**
   * TEST 4: Never return current time as lastRecordingTime
   */
  it('should never fabricate current time as lastRecordingTime', async () => {
    const mockAdapter: Partial<RecorderAdapter> = {
      getAdapterInfo: () => ({ type: 'test', version: '1.0.0', vendor: 'test' }),
      getCapabilities: () => ({
        liveStreamStatus: true,
        recordingStatus: true,
        archiveSearch: true,
        storageStatus: true,
        diskHealth: true,
        deviceTime: true,
        retentionQuery: true,
        channelEnumeration: true
      }),
      testConnection: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      authenticate: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      getChannel: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: { id: '1', enabled: true },
        checkedAt: new Date()
      }),
      getStreamStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        checkedAt: new Date()
      }),
      getRecordingStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        checkedAt: new Date()
      }),
      // No recordings found
      getLatestRecording: vi.fn().mockResolvedValue(null),
      getOldestRecording: vi.fn().mockResolvedValue(null),
      getStorageStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        checkedAt: new Date()
      }),
      getDeviceTime: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: new Date(),
        checkedAt: new Date()
      }),
      disconnect: vi.fn()
    };
    
    const now = new Date();
    
    const result = await checker.check({
      adapter: mockAdapter as RecorderAdapter,
      recorder: mockRecorder,
      camera: mockCamera
    });
    
    // CRITICAL: No archive found = UNHEALTHY
    expect(result.archive.status).toBe('unhealthy');
    
    // CRITICAL: lastRecordingTime must be undefined, not current time
    expect(result.archive.lastRecordingTime).toBeUndefined();
    
    // CRITICAL: Never be within a few seconds of current time
    if (result.archive.lastRecordingTime) {
      const diff = Math.abs(
        now.getTime() - result.archive.lastRecordingTime.getTime()
      );
      expect(diff).toBeGreaterThan(10000); // At least 10 seconds old
    }
  });
  
  /**
   * TEST 5: Recording stopped must be UNHEALTHY
   */
  it('should return UNHEALTHY when recording is stopped', async () => {
    const mockAdapter: Partial<RecorderAdapter> = {
      getAdapterInfo: () => ({ type: 'test', version: '1.0.0', vendor: 'test' }),
      getCapabilities: () => ({
        liveStreamStatus: true,
        recordingStatus: true,
        archiveSearch: true,
        storageStatus: true,
        diskHealth: true,
        deviceTime: true,
        retentionQuery: true,
        channelEnumeration: true
      }),
      testConnection: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      authenticate: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      getChannel: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: { id: '1', enabled: true },
        checkedAt: new Date()
      }),
      getStreamStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: 'streaming',
        checkedAt: new Date()
      }),
      // CRITICAL: Recording stopped
      getRecordingStatus: vi.fn().mockResolvedValue({
        status: 'unhealthy' as ComplianceState,
        value: 'stopped',
        message: 'Recording stopped',
        errorCode: 'RECORDING_STOPPED',
        checkedAt: new Date()
      }),
      getLatestRecording: vi.fn().mockResolvedValue(null),
      getOldestRecording: vi.fn().mockResolvedValue(null),
      getStorageStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        checkedAt: new Date()
      }),
      getDeviceTime: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: new Date(),
        checkedAt: new Date()
      }),
      disconnect: vi.fn()
    };
    
    const result = await checker.check({
      adapter: mockAdapter as RecorderAdapter,
      recorder: mockRecorder,
      camera: mockCamera
    });
    
    // Recording status unhealthy
    expect(result.recording.status).toBe('unhealthy');
    expect(result.recording.value).toBe('stopped');
    
    // CRITICAL: Overall must be UNHEALTHY
    expect(result.overallStatus).toBe('unhealthy');
  });
  
  /**
   * TEST 6: Disk failed must be UNHEALTHY
   */
  it('should return UNHEALTHY when disk has failed', async () => {
    const mockAdapter: Partial<RecorderAdapter> = {
      getAdapterInfo: () => ({ type: 'test', version: '1.0.0', vendor: 'test' }),
      getCapabilities: () => ({
        liveStreamStatus: true,
        recordingStatus: true,
        archiveSearch: true,
        storageStatus: true,
        diskHealth: true,
        deviceTime: true,
        retentionQuery: true,
        channelEnumeration: true
      }),
      testConnection: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      authenticate: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      getChannel: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: { id: '1', enabled: true },
        checkedAt: new Date()
      }),
      getStreamStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        checkedAt: new Date()
      }),
      getRecordingStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        checkedAt: new Date()
      }),
      getLatestRecording: vi.fn().mockResolvedValue({
        recordingId: 'rec-1',
        startTime: new Date(Date.now() - 120000),
        endTime: new Date(Date.now() - 60000),
        durationSeconds: 60
      }),
      getOldestRecording: vi.fn().mockResolvedValue({
        recordingId: 'rec-old',
        startTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000 + 3600000),
        durationSeconds: 3600
      }),
      // CRITICAL: Disk failed
      getStorageStatus: vi.fn().mockResolvedValue({
        status: 'unhealthy' as ComplianceState,
        message: '1 disk failed',
        errorCode: 'DISK_FAILED',
        disks: [
          { id: 'disk-1', state: 'failed' }
        ],
        checkedAt: new Date()
      }),
      getDeviceTime: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: new Date(),
        checkedAt: new Date()
      }),
      disconnect: vi.fn()
    };
    
    const result = await checker.check({
      adapter: mockAdapter as RecorderAdapter,
      recorder: mockRecorder,
      camera: mockCamera
    });
    
    // Storage unhealthy
    expect(result.storage.status).toBe('unhealthy');
    
    // CRITICAL: Overall must be UNHEALTHY
    expect(result.overallStatus).toBe('unhealthy');
  });
  
  /**
   * TEST 7: UNKNOWN propagates to overall status
   */
  it('should return UNKNOWN overall when any check is UNKNOWN', async () => {
    const mockAdapter: Partial<RecorderAdapter> = {
      getAdapterInfo: () => ({ type: 'test', version: '1.0.0', vendor: 'test' }),
      getCapabilities: () => ({
        liveStreamStatus: true,
        recordingStatus: true,
        archiveSearch: true,
        storageStatus: false, // Not supported
        diskHealth: false,
        deviceTime: true,
        retentionQuery: true,
        channelEnumeration: true
      }),
      testConnection: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      authenticate: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      getChannel: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: { id: '1', enabled: true },
        checkedAt: new Date()
      }),
      getStreamStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        checkedAt: new Date()
      }),
      getRecordingStatus: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        checkedAt: new Date()
      }),
      getLatestRecording: vi.fn().mockResolvedValue({
        recordingId: 'rec-1',
        startTime: new Date(Date.now() - 120000),
        endTime: new Date(Date.now() - 60000),
        durationSeconds: 60
      }),
      getOldestRecording: vi.fn().mockResolvedValue({
        recordingId: 'rec-old',
        startTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000 + 3600000),
        durationSeconds: 3600
      }),
      // Storage check returns UNKNOWN (unsupported)
      getStorageStatus: vi.fn().mockResolvedValue({
        status: 'unknown' as ComplianceState,
        message: 'Storage status not supported by adapter',
        errorCode: 'UNSUPPORTED_FEATURE',
        checkedAt: new Date()
      }),
      getDeviceTime: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: new Date(),
        checkedAt: new Date()
      }),
      disconnect: vi.fn()
    };
    
    const result = await checker.check({
      adapter: mockAdapter as RecorderAdapter,
      recorder: mockRecorder,
      camera: mockCamera
    });
    
    // Storage is unknown
    expect(result.storage.status).toBe('unknown');
    
    // CRITICAL: Overall cannot be HEALTHY when any check is UNKNOWN
    expect(result.overallStatus).toBe('unknown');
    expect(result.overallStatus).not.toBe('healthy');
  });
  
  /**
   * TEST 8: Generic adapter returns UNKNOWN for most checks
   */
  it('should return UNKNOWN for unsupported features in generic adapter', async () => {
    const mockAdapter: Partial<RecorderAdapter> = {
      getAdapterInfo: () => ({ type: 'generic', version: '1.0.0', vendor: 'generic' }),
      getCapabilities: () => ({
        liveStreamStatus: false,
        recordingStatus: false,
        archiveSearch: false,
        storageStatus: false,
        diskHealth: false,
        deviceTime: false,
        retentionQuery: false,
        channelEnumeration: false
      }),
      testConnection: vi.fn().mockResolvedValue({
        status: 'healthy' as ComplianceState,
        value: true,
        checkedAt: new Date()
      }),
      // All other features return UNKNOWN
      authenticate: vi.fn().mockResolvedValue({
        status: 'unknown' as ComplianceState,
        message: 'Authentication not supported',
        errorCode: 'UNSUPPORTED_FEATURE',
        checkedAt: new Date()
      }),
      getChannel: vi.fn().mockResolvedValue({
        status: 'unknown' as ComplianceState,
        message: 'Channel verification not supported',
        errorCode: 'UNSUPPORTED_FEATURE',
        checkedAt: new Date()
      }),
      getStreamStatus: vi.fn().mockResolvedValue({
        status: 'unknown' as ComplianceState,
        message: 'Stream status not supported',
        errorCode: 'UNSUPPORTED_FEATURE',
        checkedAt: new Date()
      }),
      getRecordingStatus: vi.fn().mockResolvedValue({
        status: 'unknown' as ComplianceState,
        message: 'Recording status not supported',
        errorCode: 'UNSUPPORTED_FEATURE',
        checkedAt: new Date()
      }),
      getLatestRecording: vi.fn().mockResolvedValue(null),
      getOldestRecording: vi.fn().mockResolvedValue(null),
      getStorageStatus: vi.fn().mockResolvedValue({
        status: 'unknown' as ComplianceState,
        message: 'Storage status not supported',
        errorCode: 'UNSUPPORTED_FEATURE',
        checkedAt: new Date()
      }),
      getDeviceTime: vi.fn().mockResolvedValue({
        status: 'unknown' as ComplianceState,
        message: 'Device time not supported',
        errorCode: 'UNSUPPORTED_FEATURE',
        checkedAt: new Date()
      }),
      disconnect: vi.fn()
    };
    
    const result = await checker.check({
      adapter: mockAdapter as RecorderAdapter,
      recorder: mockRecorder,
      camera: mockCamera
    });
    
    // CRITICAL: Generic adapter cannot verify most features
    expect(result.recording.status).toBe('unknown');
    expect(result.archive.status).toBe('unknown');
    expect(result.storage.status).toBe('unknown');
    
    // CRITICAL: Overall must be UNKNOWN
    expect(result.overallStatus).toBe('unknown');
    expect(result.overallStatus).not.toBe('healthy');
  });
});
