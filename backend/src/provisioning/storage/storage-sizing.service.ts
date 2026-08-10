/**
 * Storage Sizing Service
 * Calculates storage requirements based on camera profiles and retention policies
 */

import { CameraProfile } from '../models/provisioning-result';

export interface StorageSizingResult {
  totalRequiredBytes: number;
  perCameraBytes: number;
  formattedTotal: string;
  formattedPerCamera: string;
  breakdown: StorageSizingBreakdown[];
  recommendations: string[];
}

export interface StorageSizingBreakdown {
  cameraId?: string;
  cameraName?: string;
  profile: string;
  bitrateMbps: number;
  retentionDays: number;
  rawBytes: number;
  withOverheadBytes: number;
}

export interface CameraSizingInput {
  cameraId?: string;
  cameraName?: string;
  profiles: CameraProfile[];
  retentionDays: number;
}

export class StorageSizingService {
  private readonly OVERHEAD_MULTIPLIER = 1.15; // 15% for metadata/fragmentation
  private readonly BURST_RESERVE = 1.10; // 10% for bitrate spikes
  private readonly SECONDS_PER_DAY = 86400;

  /**
   * Calculate storage requirements for multiple cameras
   */
  calculateRequirements(
    cameras: CameraSizingInput[]
  ): StorageSizingResult {
    const breakdown: StorageSizingBreakdown[] = [];
    let totalRawBytes = 0;
    let totalWithOverhead = 0;

    for (const camera of cameras) {
      // Use primary profile (typically highest quality)
      const primaryProfile = camera.profiles[0];
      
      if (!primaryProfile || !primaryProfile.bitrateMbps) {
        // Use conservative estimate if profile data missing
        const estimate = this.estimateStorageForCamera(camera.retentionDays);
        totalRawBytes += estimate;
        totalWithOverhead += estimate * this.OVERHEAD_MULTIPLIER * this.BURST_RESERVE;
        continue;
      }

      const rawBytes = this.calculateRawStorage(
        primaryProfile.bitrateMbps,
        camera.retentionDays
      );

      const withOverhead = rawBytes * this.OVERHEAD_MULTIPLIER * this.BURST_RESERVE;

      breakdown.push({
        cameraId: camera.cameraId,
        cameraName: camera.cameraName,
        profile: primaryProfile.name,
        bitrateMbps: primaryProfile.bitrateMbps,
        retentionDays: camera.retentionDays,
        rawBytes,
        withOverheadBytes: withOverhead,
      });

      totalRawBytes += rawBytes;
      totalWithOverhead += withOverhead;
    }

    const avgPerCamera = cameras.length > 0 ? totalWithOverhead / cameras.length : 0;

    return {
      totalRequiredBytes: Math.ceil(totalWithOverhead),
      perCameraBytes: Math.ceil(avgPerCamera),
      formattedTotal: this.formatBytes(totalWithOverhead),
      formattedPerCamera: this.formatBytes(avgPerCamera),
      breakdown,
      recommendations: this.generateRecommendations(totalWithOverhead, cameras.length),
    };
  }

  /**
   * Calculate raw storage requirement
   */
  private calculateRawStorage(bitrateMbps: number, retentionDays: number): number {
    const bitsPerSecond = bitrateMbps * 1_000_000;
    const bytesPerSecond = bitsPerSecond / 8;
    
    return bytesPerSecond * this.SECONDS_PER_DAY * retentionDays;
  }

  /**
   * Estimate storage for camera with unknown bitrate
   */
  private estimateStorageForCamera(retentionDays: number): number {
    // Conservative estimate: 3 Mbps for H.265 1080p
    const estimatedBitrateMbps = 3;
    return this.calculateRawStorage(estimatedBitrateMbps, retentionDays);
  }

  /**
   * Calculate achievable retention for given storage
   */
  calculateAchievableRetention(
    availableBytes: number,
    cameras: CameraSizingInput[]
  ): {
    retentionDays: number;
    comfortable: boolean;
    utilizationPercent: number;
  } {
    if (cameras.length === 0) {
      return { retentionDays: 0, comfortable: false, utilizationPercent: 0 };
    }

    // Calculate daily storage consumption
    let dailyBytes = 0;

    for (const camera of cameras) {
      const primaryProfile = camera.profiles[0];
      
      if (primaryProfile && primaryProfile.bitrateMbps) {
        const bitsPerSecond = primaryProfile.bitrateMbps * 1_000_000;
        const bytesPerSecond = bitsPerSecond / 8;
        dailyBytes += bytesPerSecond * this.SECONDS_PER_DAY;
      } else {
        // Use estimate
        dailyBytes += this.estimateStorageForCamera(1);
      }
    }

    // Apply overhead
    dailyBytes *= this.OVERHEAD_MULTIPLIER * this.BURST_RESERVE;

    // Calculate retention
    const retentionDays = Math.floor(availableBytes / dailyBytes);

    // Consider 80% utilization as comfortable
    const comfortableBytes = availableBytes * 0.8;
    const comfortableRetention = Math.floor(comfortableBytes / dailyBytes);
    const comfortable = retentionDays >= comfortableRetention;

    const utilizationPercent = (dailyBytes * retentionDays / availableBytes) * 100;

    return {
      retentionDays,
      comfortable,
      utilizationPercent: Math.min(100, Math.round(utilizationPercent * 100) / 100),
    };
  }

  /**
   * Recommend storage size for target retention
   */
  recommendStorageSize(
    cameraCount: number,
    targetRetentionDays: number,
    avgBitrateMbps = 2.5
  ): {
    minimumBytes: number;
    recommendedBytes: number;
    comfortableBytes: number;
    formatted: {
      minimum: string;
      recommended: string;
      comfortable: string;
    };
  } {
    const rawDaily = this.calculateRawStorage(avgBitrateMbps, 1) * cameraCount;
    const withOverhead = rawDaily * this.OVERHEAD_MULTIPLIER * this.BURST_RESERVE;

    const minimumBytes = withOverhead * targetRetentionDays;
    const recommendedBytes = minimumBytes * 1.2; // 20% buffer
    const comfortableBytes = minimumBytes * 1.5; // 50% buffer for growth

    return {
      minimumBytes: Math.ceil(minimumBytes),
      recommendedBytes: Math.ceil(recommendedBytes),
      comfortableBytes: Math.ceil(comfortableBytes),
      formatted: {
        minimum: this.formatBytes(minimumBytes),
        recommended: this.formatBytes(recommendedBytes),
        comfortable: this.formatBytes(comfortableBytes),
      },
    };
  }

  /**
   * Calculate storage for different retention scenarios
   */
  calculateScenarios(
    cameras: CameraSizingInput[],
    retentionOptions: number[]
  ): Array<{
    retentionDays: number;
    totalBytes: number;
    formatted: string;
    costEstimate?: string;
  }> {
    return retentionOptions.map(days => {
      const camerasWithRetention = cameras.map(c => ({
        ...c,
        retentionDays: days,
      }));

      const result = this.calculateRequirements(camerasWithRetention);

      return {
        retentionDays: days,
        totalBytes: result.totalRequiredBytes,
        formatted: result.formattedTotal,
      };
    });
  }

  /**
   * Generate storage recommendations
   */
  private generateRecommendations(
    totalBytes: number,
    cameraCount: number
  ): string[] {
    const recommendations: string[] = [];
    const totalTB = totalBytes / (1024 ** 4);

    if (totalTB < 1) {
      recommendations.push(
        'Consider using local SSD storage for optimal performance'
      );
    } else if (totalTB < 10) {
      recommendations.push(
        'Local HDD RAID configuration recommended for reliability'
      );
    } else if (totalTB < 50) {
      recommendations.push(
        'NAS solution with RAID 6 recommended for large-scale deployment'
      );
    } else {
      recommendations.push(
        'Enterprise SAN or distributed storage system recommended'
      );
    }

    const avgPerCamera = totalBytes / cameraCount;
    const avgPerCameraGB = avgPerCamera / (1024 ** 3);

    if (avgPerCameraGB > 500) {
      recommendations.push(
        'Consider lowering bitrate or retention period to reduce storage costs'
      );
    }

    if (cameraCount > 50) {
      recommendations.push(
        'Implement tiered storage with hot/cold archival strategy'
      );
    }

    // RAID recommendations
    if (cameraCount > 10) {
      recommendations.push(
        'Use RAID 6 or RAID 10 for redundancy in production environments'
      );
    }

    return recommendations;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Parse bitrate string to Mbps
   */
  parseBitrate(bitrateStr: string): number {
    const match = bitrateStr.match(/([\d.]+)\s*(kbps|mbps|gbps)?/i);
    
    if (!match) {
      return 2.5; // Default
    }

    const value = parseFloat(match[1]);
    const unit = (match[2] || 'mbps').toLowerCase();

    switch (unit) {
      case 'kbps':
        return value / 1000;
      case 'mbps':
        return value;
      case 'gbps':
        return value * 1000;
      default:
        return value;
    }
  }
}
