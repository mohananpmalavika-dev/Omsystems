/**
 * Generic Recorder Adapter Tests
 * 
 * Verifies that generic adapter never fabricates health data
 * and returns UNKNOWN for unsupported features
 */

import { describe, it, expect, vi } from 'vitest';
import { GenericRecorderAdapter } from '../adapters/generic-recorder.adapter.js';
import type { Recorder } from '../types/index.js';
import type { RecorderConnection } from '../recorder-adapter.interface.js';

const mockRecorder: Recorder = {
  id: 'test-recorder-id',
  name: 'Unknown Recorder',
  vendor: 'unknown',
  ipAddress: '192.168.1.200',
  port: 80,
  protocol: 'http',
  branchId: 'branch-id',
  tenantId: 'tenant-id'
};

const mockConnection: RecorderConnection = {
  ipAddress: '192.168.1.200',
  port: 80,
  protocol: 'http',
  credentials: {
    username: 'admin',
    password: 'password'
  }
};

describe('GenericRecorderAdapter - UNKNOWN semantics', () => {
  
  /**
   * TEST: Generic adapter declares minimal capabilities
   */
  it('should declare minimal capabilities', () => {
    const adapter = new GenericRecorderAdapter(mockRecorder, mockConnection);
    const capabilities = adapter.getCapabilities();
    
    // Only basic connectivity supported
    expect(capabilities.liveStreamStatus).toBe(false);
    expect(capabilities.recordingStatus).toBe(false);
    expect(capabilities.archiveSearch).toBe(false);
    expect(capabilities.storageStatus).toBe(false);
    expect(capabilities.diskHealth).toBe(false);
    expect(capabilities.deviceTime).toBe(false);
    expect(capabilities.retentionQuery).toBe(false);
    expect(capabilities.channelEnumeration).toBe(false);
  });
  
  /**
   * TEST: Authentication returns UNKNOWN
   */
  it('should return UNKNOWN for authentication', async () => {
    const adapter = new GenericRecorderAdapter(mockRecorder, mockConnection);
    const result = await adapter.authenticate();
    
    expect(result.status).toBe('unknown');
    expect(result.errorCode).toBe('UNSUPPORTED_FEATURE');
    expect(result.message).toContain('not supported');
  });
  
  /**
   * TEST: Recording status returns UNKNOWN
   */
  it('should return UNKNOWN for recording status', async () => {
    const adapter = new GenericRecorderAdapter(mockRecorder, mockConnection);
    const result = await adapter.getRecordingStatus('1');
    
    // CRITICAL: Cannot verify recording without vendor API
    expect(result.status).toBe('unknown');
    expect(result.errorCode).toBe('UNSUPPORTED_FEATURE');
    expect(result.value).toBeUndefined();
  });
  
  /**
   * TEST: Latest recording returns null, never fabricates
   */
  it('should return null for latest recording, not fabricate data', async () => {
    const adapter = new GenericRecorderAdapter(mockRecorder, mockConnection);
    const result = await adapter.getLatestRecording('1');
    
    // CRITICAL: Return null, not fabricated timestamp
    expect(result).toBeNull();
  });
  
  /**
   * TEST: Storage status returns UNKNOWN
   */
  it('should return UNKNOWN for storage status', async () => {
    const adapter = new GenericRecorderAdapter(mockRecorder, mockConnection);
    const result = await adapter.getStorageStatus();
    
    expect(result.status).toBe('unknown');
    expect(result.errorCode).toBe('UNSUPPORTED_FEATURE');
    
    // CRITICAL: No fabricated storage data
    expect(result.usagePercent).toBeUndefined();
    expect(result.disks).toBeUndefined();
  });
  
  /**
   * TEST: Device time returns UNKNOWN
   */
  it('should return UNKNOWN for device time', async () => {
    const adapter = new GenericRecorderAdapter(mockRecorder, mockConnection);
    const result = await adapter.getDeviceTime();
    
    expect(result.status).toBe('unknown');
    expect(result.errorCode).toBe('UNSUPPORTED_FEATURE');
    
    // CRITICAL: No fabricated time
    expect(result.value).toBeUndefined();
  });
  
  /**
   * TEST: All unsupported features return UNKNOWN
   */
  it('should return UNKNOWN for all unsupported features', async () => {
    const adapter = new GenericRecorderAdapter(mockRecorder, mockConnection);
    
    const results = await Promise.all([
      adapter.authenticate(),
      adapter.getDeviceInfo(),
      adapter.getChannels(),
      adapter.getChannel('1'),
      adapter.getStreamStatus('1'),
      adapter.getRecordingStatus('1'),
      adapter.getStorageStatus(),
      adapter.getDeviceTime()
    ]);
    
    // All should be UNKNOWN
    results.forEach(result => {
      expect(result.status).toBe('unknown');
      expect(result.errorCode).toBe('UNSUPPORTED_FEATURE');
    });
    
    // Archive methods return null
    const latestRecording = await adapter.getLatestRecording('1');
    const oldestRecording = await adapter.getOldestRecording('1');
    
    expect(latestRecording).toBeNull();
    expect(oldestRecording).toBeNull();
  });
});
