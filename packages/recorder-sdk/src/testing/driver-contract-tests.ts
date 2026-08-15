/**
 * Driver Contract Tests
 * 
 * Ensures all recorder drivers behave consistently.
 * Run these tests against every new driver implementation.
 */

import { describe, it, expect } from "vitest";
import type { RecorderDriver } from "../core/recorder-driver.interface.js";
import type { RecorderContext } from "../core/recorder-driver.types.js";

/**
 * Contract test suite for recorder drivers
 * 
 * Usage:
 * ```typescript
 * runDriverContractTests({
 *   createDriver: () => new DahuaCGIDriver(),
 *   createMockContext: () => mockContext
 * });
 * ```
 */
export interface ContractTestOptions {
  /** Factory function to create driver instance */
  createDriver: () => RecorderDriver;
  
  /** Factory function to create mock context */
  createMockContext: () => RecorderContext;
  
  /** Skip tests that require real hardware */
  skipIntegrationTests?: boolean;
}

/**
 * Run contract tests against a driver
 */
export function runDriverContractTests(options: ContractTestOptions) {
  const { createDriver, createMockContext, skipIntegrationTests } = options;
  
  describe("Driver Contract Tests", () => {
    let driver: RecorderDriver;
    let ctx: RecorderContext;
    
    beforeEach(() => {
      driver = createDriver();
      ctx = createMockContext();
    });
    
    describe("Protocol Identification", () => {
      it("should expose protocol identifier", () => {
        expect(driver.protocol).toBeDefined();
        expect(typeof driver.protocol).toBe("string");
        expect(driver.protocol.length).toBeGreaterThan(0);
      });
      
      it("should expose version string", () => {
        expect(driver.version).toBeDefined();
        expect(typeof driver.version).toBe("string");
        expect(driver.version).toMatch(/^\d+\.\d+\.\d+/);
      });
    });
    
    describe("Capabilities Declaration", () => {
      it("should declare capabilities without context", async () => {
        const capabilities = await driver.getCapabilities(ctx);
        
        expect(capabilities).toBeDefined();
        expect(capabilities.liveVideo).toBeDefined();
        expect(capabilities.channelEnumeration).toBeDefined();
        expect(capabilities.recordingStatus).toBeDefined();
        expect(capabilities.storageTelemetry).toBeDefined();
      });
      
      it("should include confidence scores", async () => {
        const capabilities = await driver.getCapabilities(ctx);
        
        for (const [key, capability] of Object.entries(capabilities)) {
          expect(capability.supported).toBeDefined();
          expect(typeof capability.supported).toBe("boolean");
          expect(capability.confidence).toBeGreaterThanOrEqual(0);
          expect(capability.confidence).toBeLessThanOrEqual(1);
        }
      });
      
      it("should include capability source", async () => {
        const capabilities = await driver.getCapabilities(ctx);
        
        const validSources = ["discovered", "vendor", "onvif", "configuration", "unknown"];
        
        for (const [key, capability] of Object.entries(capabilities)) {
          expect(validSources).toContain(capability.source);
        }
      });
    });
    
    describe("Device Information", () => {
      it("should return device identity", async () => {
        if (skipIntegrationTests) return;
        
        const deviceInfo = await driver.getDeviceInfo(ctx);
        
        expect(deviceInfo).toBeDefined();
        expect(deviceInfo.vendor).toBeDefined();
        expect(deviceInfo.protocolFamily).toBe(driver.protocol);
      });
      
      it("should include detection timestamp", async () => {
        if (skipIntegrationTests) return;
        
        const deviceInfo = await driver.getDeviceInfo(ctx);
        
        expect(deviceInfo.detectedAt).toBeInstanceOf(Date);
        expect(deviceInfo.detectedAt.getTime()).toBeLessThanOrEqual(Date.now());
      });
    });
    
    describe("Channel Enumeration", () => {
      it("should return channel array", async () => {
        if (skipIntegrationTests) return;
        
        const channels = await driver.getChannels(ctx);
        
        expect(Array.isArray(channels)).toBe(true);
      });
      
      it("should have stable channel IDs", async () => {
        if (skipIntegrationTests) return;
        
        const channels = await driver.getChannels(ctx);
        
        for (const channel of channels) {
          expect(channel.id).toBeDefined();
          expect(typeof channel.id).toBe("string");
          expect(channel.id.length).toBeGreaterThan(0);
        }
      });
      
      it("should include connection state", async () => {
        if (skipIntegrationTests) return;
        
        const channels = await driver.getChannels(ctx);
        
        const validStates = ["ONLINE", "OFFLINE", "AUTH_ERROR", "VIDEO_LOSS", "UNKNOWN"];
        
        for (const channel of channels) {
          expect(validStates).toContain(channel.connectionState);
        }
      });
      
      it("should include recording state", async () => {
        if (skipIntegrationTests) return;
        
        const channels = await driver.getChannels(ctx);
        
        const validStates = ["RECORDING", "NOT_RECORDING", "PAUSED", "ERROR", "UNKNOWN"];
        
        for (const channel of channels) {
          expect(validStates).toContain(channel.recordingState);
        }
      });
    });
    
    describe("Storage Status", () => {
      it("should return storage status", async () => {
        if (skipIntegrationTests) return;
        
        const storage = await driver.getStorageStatus(ctx);
        
        expect(storage).toBeDefined();
        expect(storage.state).toBeDefined();
        expect(storage.volumes).toBeDefined();
        expect(Array.isArray(storage.volumes)).toBe(true);
      });
      
      it("should have valid health states", async () => {
        if (skipIntegrationTests) return;
        
        const storage = await driver.getStorageStatus(ctx);
        
        const validStates = ["HEALTHY", "DEGRADED", "FAILED", "UNKNOWN"];
        expect(validStates).toContain(storage.state);
        
        for (const volume of storage.volumes) {
          expect(validStates).toContain(volume.state);
        }
      });
      
      it("should include observation timestamp", async () => {
        if (skipIntegrationTests) return;
        
        const storage = await driver.getStorageStatus(ctx);
        
        expect(storage.observedAt).toBeInstanceOf(Date);
        expect(storage.observedAt.getTime()).toBeLessThanOrEqual(Date.now());
      });
    });
    
    describe("Recording Status", () => {
      it("should return recording state", async () => {
        if (skipIntegrationTests) return;
        
        const status = await driver.getRecordingStatus(ctx, "0");
        
        expect(status).toBeDefined();
        expect(status.state).toBeDefined();
        expect(typeof status.activelyWriting).toBe("boolean");
      });
      
      it("should never fabricate timestamps", async () => {
        if (skipIntegrationTests) return;
        
        const status = await driver.getRecordingStatus(ctx, "0");
        
        if (status.latestRecordingAt) {
          // Latest recording must be in the past
          expect(status.latestRecordingAt.getTime()).toBeLessThan(Date.now());
          
          // And not from current time (which would indicate fabrication)
          const ageSeconds = (Date.now() - status.latestRecordingAt.getTime()) / 1000;
          expect(ageSeconds).toBeGreaterThanOrEqual(1);
        }
      });
      
      it("should return UNKNOWN when cannot verify", async () => {
        if (skipIntegrationTests) return;
        
        // Test with invalid channel
        try {
          const status = await driver.getRecordingStatus(ctx, "99999");
          
          // Should either throw or return UNKNOWN
          if (status) {
            expect(["UNKNOWN", "ERROR"]).toContain(status.state);
          }
        } catch (error) {
          // Error is acceptable for invalid channel
          expect(error).toBeDefined();
        }
      });
    });
    
    describe("Recording Search", () => {
      it("should return search result structure", async () => {
        if (skipIntegrationTests) return;
        
        const now = new Date();
        const yesterday = new Date(now.getTime() - 86400000);
        
        const result = await driver.searchRecordings(ctx, {
          channelId: "0",
          from: yesterday,
          to: now,
          limit: 10
        });
        
        expect(result).toBeDefined();
        expect(Array.isArray(result.segments)).toBe(true);
        expect(typeof result.totalCount).toBe("number");
        expect(typeof result.hasMore).toBe("boolean");
        expect(typeof result.success).toBe("boolean");
      });
      
      it("should have valid segment timestamps", async () => {
        if (skipIntegrationTests) return;
        
        const now = new Date();
        const yesterday = new Date(now.getTime() - 86400000);
        
        const result = await driver.searchRecordings(ctx, {
          channelId: "0",
          from: yesterday,
          to: now,
          limit: 10
        });
        
        for (const segment of result.segments) {
          expect(segment.startTime).toBeInstanceOf(Date);
          expect(segment.endTime).toBeInstanceOf(Date);
          expect(segment.endTime.getTime()).toBeGreaterThanOrEqual(segment.startTime.getTime());
          expect(segment.durationSeconds).toBeGreaterThan(0);
        }
      });
    });
    
    describe("Error Handling", () => {
      it("should throw appropriate errors for invalid context", async () => {
        if (skipIntegrationTests) return;
        
        const invalidCtx = {
          ...ctx,
          endpoint: {
            ...ctx.endpoint,
            host: "255.255.255.255" // Invalid/unreachable
          }
        };
        
        try {
          await driver.probe(invalidCtx, { timeoutMs: 2000 });
          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error).toBeDefined();
          expect(error.name).toBeDefined();
        }
      });
    });
    
    describe("Probe Operation", () => {
      it("should return probe result", async () => {
        if (skipIntegrationTests) return;
        
        const result = await driver.probe(ctx);
        
        expect(result).toBeDefined();
        expect(result.recorderId).toBe(ctx.recorderId);
        expect(typeof result.reachable).toBe("boolean");
        expect(result.status).toBeDefined();
        expect(result.capabilities).toBeDefined();
        expect(Array.isArray(result.channels)).toBe(true);
        expect(result.probedAt).toBeInstanceOf(Date);
        expect(result.probeDurationMs).toBeGreaterThan(0);
      });
      
      it("should include reason codes when issues detected", async () => {
        if (skipIntegrationTests) return;
        
        const result = await driver.probe(ctx);
        
        expect(Array.isArray(result.reasonCodes)).toBe(true);
      });
    });
  });
}
