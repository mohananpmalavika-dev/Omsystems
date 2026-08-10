/**
 * Storage Provisioner Service
 * Handles storage discovery, sizing, configuration, and verification
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';
import {
  StorageProvisioningResult,
  StorageDevice,
  StorageVerificationResult,
} from '../models/provisioning-result';
import { ProvisioningContext } from '../models/provisioning-context';

const execAsync = promisify(exec);

export class StorageProvisionerService {
  /**
   * Full storage provisioning workflow
   */
  async provision(context: ProvisioningContext): Promise<StorageProvisioningResult> {
    // Step 1: Discover available storage
    const devices = await this.discoverStorage();

    // Step 2: Calculate required storage
    const cameraCount = context.cameras?.data?.totalImported || 0;
    const requiredBytes = this.calculateRequiredStorage(
      cameraCount,
      context.config.storage.retentionDays
    );

    // Step 3: Select suitable storage device
    const selectedDevice = this.selectStorageDevice(
      devices,
      requiredBytes,
      context.config.storage
    );

    if (!selectedDevice) {
      throw new Error(
        `No suitable storage device found. Required: ${this.formatBytes(requiredBytes)}`
      );
    }

    // Step 4: Configure recording path
    const recordingPath = await this.configureRecordingPath(
      context,
      selectedDevice
    );

    // Step 5: Verify storage
    const verification = await this.verifyStorage(
      recordingPath,
      context.config.storage
    );

    // Step 6: Check if retention is achievable
    const retentionAchievable =
      selectedDevice.availableBytes >= requiredBytes;

    return {
      devices,
      selectedDevice,
      recordingPath,
      totalBytes: selectedDevice.totalBytes,
      availableBytes: selectedDevice.availableBytes,
      requiredBytes,
      retentionDays: context.config.storage.retentionDays,
      retentionAchievable,
      writeVerified: verification.writable,
      readVerified: verification.readable,
      writeMbps: verification.writeMbps,
      readMbps: verification.readMbps,
      checksumValid: verification.checksumValid,
    };
  }

  /**
   * Discover available storage devices
   */
  async discoverStorage(): Promise<StorageDevice[]> {
    const devices: StorageDevice[] = [];

    try {
      // Get filesystem information using df
      const { stdout } = await execAsync('df -B1 -T');
      const lines = stdout.split('\n').slice(1); // Skip header

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 7) continue;

        const [filesystem, fstype, total, used, available, , mountpoint] = parts;

        // Skip system/special filesystems
        if (
          fstype === 'tmpfs' ||
          fstype === 'devtmpfs' ||
          fstype === 'squashfs' ||
          mountpoint === '/boot' ||
          mountpoint === '/boot/efi' ||
          mountpoint.startsWith('/snap') ||
          mountpoint.startsWith('/sys') ||
          mountpoint.startsWith('/proc') ||
          mountpoint.startsWith('/dev')
        ) {
          continue;
        }

        devices.push({
          id: filesystem,
          type: this.detectStorageType(filesystem, mountpoint),
          mountPoint: mountpoint,
          totalBytes: parseInt(total, 10),
          availableBytes: parseInt(available, 10),
          writable: await this.checkWritable(mountpoint),
          createdByProvisioning: false,
        });
      }
    } catch (error) {
      console.error('Error discovering storage:', error);
    }

    return devices;
  }

  /**
   * Calculate required storage based on cameras and retention
   */
  calculateRequiredStorage(
    cameraCount: number,
    retentionDays: number,
    avgBitrateMbps = 2.5 // Default H.265 1080p @ 15fps
  ): number {
    if (cameraCount === 0) {
      // Minimum storage allocation
      return 107374182400; // 100GB minimum
    }

    // Calculate raw storage requirement
    // bitrate (Mbps) * cameras * seconds/day * days * bits-to-bytes / MB
    const bitsPerSecond = avgBitrateMbps * 1_000_000;
    const bytesPerSecond = bitsPerSecond / 8;
    const secondsPerDay = 86400;

    const rawBytes = bytesPerSecond * cameraCount * secondsPerDay * retentionDays;

    // Add overhead:
    // - 15% for metadata, filesystem overhead, fragmentation
    // - 10% reserve for burst bitrate
    const overheadMultiplier = 1.15 * 1.10;

    return Math.ceil(rawBytes * overheadMultiplier);
  }

  /**
   * Calculate storage per camera profile
   */
  calculatePerCameraStorage(
    bitrateMbps: number,
    retentionDays: number
  ): number {
    const bitsPerSecond = bitrateMbps * 1_000_000;
    const bytesPerSecond = bitsPerSecond / 8;
    const secondsPerDay = 86400;

    return bytesPerSecond * secondsPerDay * retentionDays * 1.15;
  }

  /**
   * Select suitable storage device
   */
  private selectStorageDevice(
    devices: StorageDevice[],
    requiredBytes: number,
    config: any
  ): StorageDevice | undefined {
    // Filter devices based on policy
    const suitable = devices.filter(device => {
      // Must be writable
      if (!device.writable) return false;

      // Must meet minimum capacity
      if (device.totalBytes < config.minimumCapacityBytes) return false;

      // Must be in allowed mount roots
      if (config.allowedMountRoots.length > 0) {
        const allowed = config.allowedMountRoots.some((root: string) =>
          device.mountPoint?.startsWith(root)
        );
        if (!allowed) return false;
      }

      // Must have enough available space
      if (device.availableBytes < requiredBytes) return false;

      return true;
    });

    if (suitable.length === 0) {
      return undefined;
    }

    // Prefer dedicated surveillance storage, then largest available
    const dedicated = suitable.find(
      d =>
        d.mountPoint?.includes('surveillance') ||
        d.mountPoint?.includes('recordings') ||
        d.mountPoint?.includes('video')
    );

    if (dedicated) {
      return dedicated;
    }

    // Return device with most available space
    return suitable.reduce((best, current) =>
      current.availableBytes > best.availableBytes ? current : best
    );
  }

  /**
   * Configure recording path
   */
  private async configureRecordingPath(
    context: ProvisioningContext,
    device: StorageDevice
  ): Promise<string> {
    if (!device.mountPoint) {
      throw new Error('Storage device has no mount point');
    }

    // Create branch-specific recording directory
    const basePath = join(device.mountPoint, 'surveillance', 'recordings');
    const branchPath = join(basePath, context.branchId);

    try {
      // Create directory structure
      await fs.mkdir(branchPath, { recursive: true });

      // Set permissions (775 for surveillance group access)
      await fs.chmod(branchPath, 0o775);

      return branchPath;
    } catch (error) {
      throw new Error(`Failed to create recording path: ${error.message}`);
    }
  }

  /**
   * Verify storage performance and reliability
   */
  async verifyStorage(
    path: string,
    config: any
  ): Promise<StorageVerificationResult> {
    const testFile = join(path, `.sentinel-storage-test-${Date.now()}`);
    const testSizeMB = 10; // 10MB test file
    const testSizeBytes = testSizeMB * 1024 * 1024;

    try {
      // Generate random test data
      const payload = crypto.randomBytes(testSizeBytes);
      const expectedHash = crypto
        .createHash('sha256')
        .update(payload)
        .digest('hex');

      // Test write performance
      const writeStart = performance.now();
      await fs.writeFile(testFile, payload);
      const writeEnd = performance.now();
      const writeDurationMs = writeEnd - writeStart;
      const writeMbps = (testSizeMB * 8) / (writeDurationMs / 1000);

      // Test read performance
      const readStart = performance.now();
      const readData = await fs.readFile(testFile);
      const readEnd = performance.now();
      const readDurationMs = readEnd - readStart;
      const readMbps = (testSizeMB * 8) / (readDurationMs / 1000);

      // Verify checksum
      const actualHash = crypto
        .createHash('sha256')
        .update(readData)
        .digest('hex');
      const checksumValid = expectedHash === actualHash;

      // Clean up test file
      await fs.unlink(testFile);

      // Check if performance meets requirements
      const performanceAdequate =
        writeMbps >= config.minimumWriteMbps &&
        readMbps >= config.minimumReadMbps;

      return {
        writable: true,
        readable: true,
        checksumValid,
        writeMbps: Math.round(writeMbps * 100) / 100,
        readMbps: Math.round(readMbps * 100) / 100,
        performanceAdequate,
      };
    } catch (error) {
      return {
        writable: false,
        readable: false,
        checksumValid: false,
        writeMbps: 0,
        readMbps: 0,
        performanceAdequate: false,
      };
    }
  }

  /**
   * Detect storage type
   */
  private detectStorageType(
    filesystem: string,
    mountpoint: string
  ): StorageDevice['type'] {
    if (
      filesystem.includes(':') ||
      mountpoint.includes('/nfs') ||
      mountpoint.includes('/mnt/nas')
    ) {
      return 'nas';
    }

    if (mountpoint.includes('/mnt/san') || filesystem.includes('/dev/mapper')) {
      return 'san';
    }

    if (mountpoint.includes('/mnt/s3') || mountpoint.includes('/mnt/object')) {
      return 'object';
    }

    return 'local';
  }

  /**
   * Check if mountpoint is writable
   */
  private async checkWritable(mountpoint: string): Promise<boolean> {
    try {
      const testFile = join(mountpoint, `.write-test-${Date.now()}`);
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      return true;
    } catch {
      return false;
    }
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
   * Get storage usage statistics
   */
  async getStorageUsage(path: string): Promise<{
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usagePercent: number;
  }> {
    try {
      const { stdout } = await execAsync(`df -B1 "${path}"`);
      const lines = stdout.split('\n');
      if (lines.length < 2) {
        throw new Error('Invalid df output');
      }

      const parts = lines[1].trim().split(/\s+/);
      const totalBytes = parseInt(parts[1], 10);
      const usedBytes = parseInt(parts[2], 10);
      const availableBytes = parseInt(parts[3], 10);
      const usagePercent = (usedBytes / totalBytes) * 100;

      return {
        totalBytes,
        usedBytes,
        availableBytes,
        usagePercent: Math.round(usagePercent * 100) / 100,
      };
    } catch (error) {
      throw new Error(`Failed to get storage usage: ${error.message}`);
    }
  }

  /**
   * Estimate achievable retention based on current storage
   */
  estimateRetention(
    availableBytes: number,
    cameraCount: number,
    avgBitrateMbps = 2.5
  ): number {
    if (cameraCount === 0) return 0;

    const bitsPerSecond = avgBitrateMbps * 1_000_000;
    const bytesPerSecond = bitsPerSecond / 8;
    const secondsPerDay = 86400;
    const bytesPerCameraPerDay = bytesPerSecond * secondsPerDay;

    // Account for overhead
    const effectiveBytes = availableBytes / 1.25;

    const totalDays = effectiveBytes / (bytesPerCameraPerDay * cameraCount);

    return Math.floor(totalDays);
  }
}
