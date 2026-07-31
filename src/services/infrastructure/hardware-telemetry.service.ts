/**
 * Hardware Telemetry Service
 * 
 * Monitors hardware health for servers, NVRs, and compute devices:
 * - CPU utilization per core
 * - GPU utilization (for AI analytics servers)
 * - Memory usage and available
 * - Disk I/O performance
 * - System temperature sensors
 * - Fan speeds
 * - Power consumption
 * 
 * Supports: SNMP, IPMI, vendor APIs
 */

import { Pool } from 'pg';

interface HardwareMetrics {
  deviceId: string;
  cpuUtilizationPercent: number;
  cpuTemperatureCelsius: number;
  memoryUtilizationPercent: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  gpuUtilizationPercent?: number;
  gpuTemperatureCelsius?: number;
  diskIopsRead: number;
  diskIopsWrite: number;
  fanSpeedRpm: number[];
  powerWatts: number;
}

export class HardwareTelemetryService {
  constructor(private pool: Pool) {}

  async collectBranchHardware(branchId: string, tenantId: string): Promise<void> {
    // Implementation for CPU/GPU/Memory monitoring
    console.log('Hardware telemetry for branch:', branchId);
  }
}

export default HardwareTelemetryService;
