/**
 * Recording Compliance Service Integration Tests
 * 
 * CRITICAL: Verifies that the service never returns fabricated health data
 * Tests the complete flow from service -> adapter -> result
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Pool } from 'pg';
import { RecordingComplianceService } from '../recording-compliance.service.js';

// Mock pool
const mockPool = {
  query: jest.fn()
} as unknown as Pool;

describe('RecordingComplianceService - False Positive Prevention', () => {
  let service: RecordingComplianceService;
  
  beforeEach(() => {
    service = new RecordingComplianceService(mockPool);
    jest.clearAllMocks();
  });
  
  /**
   * TEST: queryDVRRecordingStatus with missing recorder returns error state
   */
  it('should return error state when recorder not found in database', async () => {
    // Mock: No recorder found
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: []
    });
    
    const result = await (service as any).queryDVRRecordingStatus(
      '192.168.1.100',
      80,
      1,
      'admin',
      'password'
    );
    
    // CRITICAL: Must return error state, not fabricated health
    expect(result.recording).toBe(false); // Changed from true
    expect(result.lastRecordingTime).toBeUndefined(); // Changed from new Date()
    expect(result.storageStatus).toBe('error'); // Changed from 'normal'
  });
  
  /**
   * TEST: queryDVRRecordingStatus with adapter failure returns error state
   */
  it('should return error state when adapter check fails', async () => {
    // Mock: Recorder found
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        id: 'recorder-id',
        name: 'Test Recorder',
        vendor: 'unknown',
        ip_address: '192.168.1.100',
        port: 80,
        protocol: 'http',
        branch_id: 'branch-id',
        tenant_id: 'tenant-id'
      }]
    });
    
    // Mock: Last healthy time query
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    
    // The adapter will be created but will return UNKNOWN for generic vendor
    const result = await (service as any).queryDVRRecordingStatus(
      '192.168.1.100',
      80,
      1,
      'admin',
      'password'
    );
    
    // Generic adapter cannot verify, so should return error/unknown state
    expect(result.recording).toBe(false);
    expect(result.storageStatus).toBe('error');
  });
  
  /**
   * TEST: checkRecordingComplianceV2 returns null for camera without recorder
   */
  it('should return null when camera has no recorder configured', async () => {
    // Mock: Camera found but no recorder
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        camera_id: 'camera-id',
        camera_name: 'Test Camera',
        branch_id: 'branch-id',
        tenant_id: 'tenant-id',
        recorder_id: null, // No recorder
        recorder_channel: null
      }]
    });
    
    const result = await service.checkRecordingComplianceV2('camera-id');
    
    // CRITICAL: Return null, not fabricated health data
    expect(result).toBeNull();
  });
  
  /**
   * TEST: checkRecordingComplianceV2 returns null for non-existent camera
   */
  it('should return null when camera not found', async () => {
    // Mock: Camera not found
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: []
    });
    
    const result = await service.checkRecordingComplianceV2('non-existent-camera');
    
    // CRITICAL: Return null, not fabricated data
    expect(result).toBeNull();
  });
  
  /**
   * TEST: validateWithDVR returns null when no DVR configured
   */
  it('should return null when camera has no DVR configured', async () => {
    // Mock: Camera without DVR
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: []
    });
    
    const result = await service.validateWithDVR('camera-id');
    
    // CRITICAL: Return null when no DVR
    expect(result).toBeNull();
  });
  
  /**
   * TEST: Compliance score calculation handles missing data
   */
  it('should handle missing camera gracefully in compliance score', async () => {
    // Mock: Camera not found
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: []
    });
    
    const result = await service.calculateComplianceScore('non-existent-camera');
    
    // CRITICAL: Return null, not fabricated score
    expect(result).toBeNull();
  });
  
  /**
   * TEST: Retention compliance with no cameras returns appropriate state
   */
  it('should handle branches with no cameras in retention compliance', async () => {
    // Mock: Policy exists
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        retention_days: 180,
        policy_name: 'Default Policy'
      }]
    });
    
    // Mock: No cameras
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: []
    });
    
    const result = await service.checkRetentionCompliance('tenant-id');
    
    expect(result.totalCameras).toBe(0);
    expect(result.compliantCameras).toBe(0);
    expect(result.complianceRate).toBe(100); // No cameras = 100% (nothing to fail)
    expect(result.status).toBe('COMPLIANT');
  });
});

describe('RecordingComplianceService - Data Integrity', () => {
  let service: RecordingComplianceService;
  
  beforeEach(() => {
    service = new RecordingComplianceService(mockPool);
    jest.clearAllMocks();
  });
  
  /**
   * TEST: Archive timestamps are never fabricated
   */
  it('should never use current time for archive timestamps', async () => {
    const now = Date.now();
    
    // Mock camera with recorder
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        camera_id: 'camera-id',
        camera_name: 'Test Camera',
        branch_id: 'branch-id',
        tenant_id: 'tenant-id',
        recorder_id: 'recorder-id',
        recorder_name: 'Test Recorder',
        vendor: 'generic',
        ip_address: '192.168.1.100',
        port: 80,
        protocol: 'http',
        recorder_channel: '1',
        username: 'admin',
        password_encrypted: 'encrypted'
      }]
    });
    
    // Mock: Last healthy time
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    
    // Mock: Save compliance result
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    
    const result = await service.checkRecordingComplianceV2('camera-id');
    
    if (result && result.archive.lastRecordingTime) {
      const timestamp = result.archive.lastRecordingTime.getTime();
      const diff = Math.abs(now - timestamp);
      
      // CRITICAL: Last recording time should NOT be current time
      // Allow up to 10 seconds for test execution, but realistically
      // it should be much older or undefined
      expect(diff).toBeGreaterThan(10000);
    }
  });
  
  /**
   * TEST: Storage usage is never fabricated
   */
  it('should not fabricate storage usage data', async () => {
    // Mock camera with generic adapter (no storage support)
    (mockPool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        camera_id: 'camera-id',
        camera_name: 'Test Camera',
        branch_id: 'branch-id',
        tenant_id: 'tenant-id',
        recorder_id: 'recorder-id',
        recorder_name: 'Test Recorder',
        vendor: 'generic',
        ip_address: '192.168.1.100',
        port: 80,
        protocol: 'http',
        recorder_channel: '1',
        username: 'admin',
        password_encrypted: 'encrypted'
      }]
    });
    
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
    
    const result = await service.checkRecordingComplianceV2('camera-id');
    
    if (result) {
      // Generic adapter should return UNKNOWN for storage
      expect(result.storage.status).toBe('unknown');
      
      // CRITICAL: Usage percent should be undefined, not fabricated
      expect(result.storage.usagePercent).toBeUndefined();
    }
  });
});
