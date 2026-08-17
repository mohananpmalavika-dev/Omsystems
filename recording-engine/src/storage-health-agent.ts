import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type StorageRiskLevel = "none" | "low" | "medium" | "high" | "critical";
export type DiskType = "hdd" | "ssd" | "nvme" | "unknown";
export type RaidType = "mdadm" | "hardware" | "zfs" | "lvm" | "unknown";

export interface PhysicalDisk {
  devicePath: string; // e.g., /dev/sda, /dev/nvme0n1
  deviceName: string; // e.g., sda, nvme0n1
  model?: string;
  serial?: string;
  firmware?: string;
  size?: number;
  diskType: DiskType;
  rotational: boolean;
  mountPoint?: string;
  smart?: SmartData;
  temperatureCelsius?: number;
  badSectors: number;
  riskLevel: StorageRiskLevel;
}

export interface SmartData {
  overallStatus: "passed" | "failed" | "unknown";
  reallocatedSectors: number;
  pendingSectors: number;
  uncorrectableSectors: number;
  temperatureCelsius?: number;
  powerOnHours?: number;
  readErrors: number;
  writeErrors: number;
  remainingSsdLifePercent?: number;
  interfaceCrcErrors: number;
  rawReadErrorRate?: number;
  seekErrorRate?: number;
  spinRetryCount?: number;
}

export interface RaidArray {
  arrayName: string; // e.g., /dev/md0, raidz1-0
  raidType: RaidType;
  level: string; // e.g., RAID5, mirror, raidz1
  status: "healthy" | "degraded" | "rebuilding" | "failed" | "unknown";
  memberDisks: string[];
  activeMemberCount: number;
  totalMemberCount: number;
  failedMembers: string[];
  spareMemberCount?: number;
  rebuildProgressPercent?: number;
  syncSpeed?: string; // e.g., "125MB/s"
  estimatedRebuildTime?: string;
  controllerHealth?: "healthy" | "warning" | "critical" | "unknown";
  riskLevel: StorageRiskLevel;
}

export interface StorageHealthReport {
  timestamp: Date;
  physicalDisks: PhysicalDisk[];
  raidArrays: RaidArray[];
  overallRiskLevel: StorageRiskLevel;
  warnings: string[];
  errors: string[];
  recommendations: string[];
}

export class StorageHealthAgent {
  private cachedReport?: StorageHealthReport;
  private cacheTimestamp?: Date;
  private readonly cacheValidityMs = 60_000; // 1 minute

  /**
   * Get comprehensive storage health report
   */
  async getHealthReport(forceRefresh = false): Promise<StorageHealthReport> {
    // Return cached report if still valid
    if (
      !forceRefresh &&
      this.cachedReport &&
      this.cacheTimestamp &&
      Date.now() - this.cacheTimestamp.getTime() < this.cacheValidityMs
    ) {
      return this.cachedReport;
    }

    const timestamp = new Date();
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];

    // Step 1: Discover all physical disks
    const physicalDisks = await this.discoverPhysicalDisks();

    // Step 2: Collect SMART data for each disk
    for (const disk of physicalDisks) {
      try {
        disk.smart = await this.getSmartData(disk.devicePath);
        disk.temperatureCelsius = disk.smart.temperatureCelsius;
        disk.badSectors =
          disk.smart.reallocatedSectors +
          disk.smart.pendingSectors +
          disk.smart.uncorrectableSectors;
        disk.riskLevel = this.calculateDiskRiskLevel(disk);

        // Generate warnings and recommendations
        if (disk.riskLevel === "critical") {
          errors.push(`Disk ${disk.devicePath}: CRITICAL - Replace immediately!`);
          recommendations.push(`Replace ${disk.devicePath} as soon as possible to prevent data loss`);
        } else if (disk.riskLevel === "high") {
          warnings.push(`Disk ${disk.devicePath}: HIGH risk - ${disk.badSectors} bad sectors`);
          recommendations.push(`Plan replacement for ${disk.devicePath} within 30 days`);
        } else if (disk.riskLevel === "medium") {
          warnings.push(`Disk ${disk.devicePath}: Moderate wear detected`);
        }

        if (disk.temperatureCelsius && disk.temperatureCelsius > 55) {
          warnings.push(`Disk ${disk.devicePath}: High temperature ${disk.temperatureCelsius}°C`);
          recommendations.push(`Check cooling for ${disk.devicePath}`);
        }
      } catch (error) {
        warnings.push(`Failed to read SMART data for ${disk.devicePath}: ${error}`);
      }
    }

    // Step 3: Discover RAID arrays
    const raidArrays = await this.discoverRaidArrays(physicalDisks);

    // Step 4: Assess RAID health
    for (const raid of raidArrays) {
      raid.riskLevel = this.calculateRaidRiskLevel(raid);

      if (raid.status === "failed") {
        errors.push(`RAID ${raid.arrayName}: FAILED - Data may be lost!`);
        recommendations.push(`Investigate ${raid.arrayName} immediately`);
      } else if (raid.status === "degraded") {
        warnings.push(`RAID ${raid.arrayName}: DEGRADED - ${raid.failedMembers.length} disk(s) failed`);
        recommendations.push(`Replace failed disks in ${raid.arrayName}: ${raid.failedMembers.join(", ")}`);
      } else if (raid.status === "rebuilding") {
        warnings.push(
          `RAID ${raid.arrayName}: REBUILDING - ${raid.rebuildProgressPercent}% complete`
        );
        recommendations.push(
          `Monitor rebuild of ${raid.arrayName}, ETA: ${raid.estimatedRebuildTime || "unknown"}`
        );
      }
    }

    // Step 5: Calculate overall risk level
    const overallRiskLevel = this.calculateOverallRiskLevel(physicalDisks, raidArrays);

    const report: StorageHealthReport = {
      timestamp,
      physicalDisks,
      raidArrays,
      overallRiskLevel,
      warnings,
      errors,
      recommendations,
    };

    // Cache the report
    this.cachedReport = report;
    this.cacheTimestamp = timestamp;

    return report;
  }

  /**
   * Discover all physical disks using lsblk
   */
  private async discoverPhysicalDisks(): Promise<PhysicalDisk[]> {
    const disks: PhysicalDisk[] = [];

    try {
      // Use lsblk to discover all block devices
      const { stdout } = await execFileAsync("lsblk", [
        "-d", // List only disks, not partitions
        "-n", // No headers
        "-o", // Output columns
        "NAME,TYPE,SIZE,ROTA,MOUNTPOINT,MODEL",
        "-b", // Bytes for size
      ], { timeout: 5_000 });

      const lines = stdout.trim().split(/\r?\n/);

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;

        const [name, type] = parts;
        
        // Only process disk devices (not partitions, loops, etc.)
        if (!name || type !== "disk") continue;

        const devicePath = name.startsWith("/dev/") ? name : `/dev/${name}`;
        const size = parts[2] ? Number(parts[2]) : undefined;
        const rotational = parts[3] === "1";
        const mountPoint = parts[4] !== "-" ? parts[4] : undefined;
        const model = parts.slice(5).join(" ") || undefined;

        // Determine disk type
        let diskType: DiskType = "unknown";
        if (name.includes("nvme")) {
          diskType = "nvme";
        } else if (!rotational) {
          diskType = "ssd";
        } else if (rotational) {
          diskType = "hdd";
        }

        const disk: PhysicalDisk = {
          devicePath,
          deviceName: name,
          model,
          size,
          diskType,
          rotational,
          mountPoint,
          badSectors: 0,
          riskLevel: "none",
        };

        // Try to get serial and firmware
        try {
          const details = await this.getDiskDetails(devicePath);
          disk.serial = details.serial;
          disk.firmware = details.firmware;
        } catch {
          // Ignore errors for disk details
        }

        disks.push(disk);
      }
    } catch (error) {
      // If lsblk fails, fall back to scanning common device patterns
      const fallbackDevices = [
        "/dev/sda", "/dev/sdb", "/dev/sdc", "/dev/sdd",
        "/dev/nvme0n1", "/dev/nvme1n1",
        "/dev/vda", "/dev/vdb",
      ];

      for (const device of fallbackDevices) {
        try {
          // Check if device exists
          await execFileAsync("test", ["-b", device], { timeout: 1_000 });
          disks.push({
            devicePath: device,
            deviceName: device.replace("/dev/", ""),
            diskType: "unknown",
            rotational: false,
            badSectors: 0,
            riskLevel: "none",
          });
        } catch {
          // Device doesn't exist, skip
        }
      }
    }

    return disks;
  }

  /**
   * Get detailed disk information using smartctl
   */
  private async getDiskDetails(devicePath: string): Promise<{ serial?: string; firmware?: string }> {
    try {
      const { stdout } = await execFileAsync("smartctl", ["-i", devicePath], { timeout: 3_000 });
      const serialMatch = stdout.match(/Serial Number:\s*(.+)/i);
      const firmwareMatch = stdout.match(/Firmware Version:\s*(.+)/i);
      return {
        serial: serialMatch?.[1] ? serialMatch[1].trim() : undefined,
        firmware: firmwareMatch?.[1] ? firmwareMatch[1].trim() : undefined,
      };
    } catch {
      return {};
    }
  }

  /**
   * Get SMART data for a specific disk
   */
  private async getSmartData(devicePath: string): Promise<SmartData> {
    try {
      const { stdout } = await execFileAsync("smartctl", [
        "-n", "standby", // Don't wake up disk if in standby
        "-A", // Print attributes
        "-H", // Print health status
        "-j", // JSON output (if available)
        devicePath,
      ], { timeout: 5_000 });

      // Try to parse JSON first (modern smartctl)
      try {
        const json = JSON.parse(stdout);
        return this.parseSmartJson(json);
      } catch {
        // Fall back to text parsing
        return this.parseSmartText(stdout);
      }
    } catch {
      return {
        overallStatus: "unknown",
        reallocatedSectors: 0,
        pendingSectors: 0,
        uncorrectableSectors: 0,
        readErrors: 0,
        writeErrors: 0,
        interfaceCrcErrors: 0,
      };
    }
  }

  /**
   * Parse SMART data from JSON output
   */
  private parseSmartJson(json: any): SmartData {
    const attrs = json.ata_smart_attributes?.table || [];
    const findAttr = (ids: number[]) => {
      for (const id of ids) {
        const attr = attrs.find((a: any) => a.id === id);
        if (attr) return attr;
      }
      return null;
    };

    return {
      overallStatus: json.smart_status?.passed ? "passed" : "failed",
      reallocatedSectors: findAttr([5])?.raw?.value || 0,
      pendingSectors: findAttr([197])?.raw?.value || 0,
      uncorrectableSectors: findAttr([198])?.raw?.value || 0,
      temperatureCelsius: findAttr([194, 190])?.raw?.value,
      powerOnHours: findAttr([9])?.raw?.value,
      readErrors: findAttr([1])?.raw?.value || 0,
      writeErrors: findAttr([200])?.raw?.value || 0,
      remainingSsdLifePercent: findAttr([231, 177])?.value,
      interfaceCrcErrors: findAttr([199])?.raw?.value || 0,
      rawReadErrorRate: findAttr([1])?.raw?.value,
      seekErrorRate: findAttr([7])?.raw?.value,
      spinRetryCount: findAttr([10])?.raw?.value,
    };
  }

  /**
   * Parse SMART data from text output
   */
  private parseSmartText(stdout: string): SmartData {
    const lines = stdout.split(/\r?\n/);
    
    const extractValue = (pattern: RegExp): number | undefined => {
      const line = lines.find((l) => pattern.test(l));
      if (!line) return undefined;
      const match = line.match(/\d+/g);
      return match ? Number(match[match.length - 1]) : undefined;
    };

    return {
      overallStatus: /PASSED/i.test(stdout) ? "passed" : /FAIL/i.test(stdout) ? "failed" : "unknown",
      reallocatedSectors: extractValue(/Reallocated_Sector/i) || 0,
      pendingSectors: extractValue(/Current_Pending_Sector/i) || 0,
      uncorrectableSectors: extractValue(/Offline_Uncorrectable/i) || 0,
      temperatureCelsius: extractValue(/Temperature/i),
      powerOnHours: extractValue(/Power_On_Hours/i),
      readErrors: extractValue(/Raw_Read_Error/i) || 0,
      writeErrors: extractValue(/Write_Error/i) || 0,
      remainingSsdLifePercent: extractValue(/Wear_Leveling|Remaining_Life/i),
      interfaceCrcErrors: extractValue(/UDMA_CRC_Error|Interface_CRC/i) || 0,
      rawReadErrorRate: extractValue(/Raw_Read_Error_Rate/i),
      seekErrorRate: extractValue(/Seek_Error_Rate/i),
      spinRetryCount: extractValue(/Spin_Retry_Count/i),
    };
  }

  /**
   * Discover RAID arrays from multiple sources
   */
  private async discoverRaidArrays(physicalDisks: PhysicalDisk[]): Promise<RaidArray[]> {
    const arrays: RaidArray[] = [];

    // Check mdadm (Linux software RAID)
    arrays.push(...await this.discoverMdadmArrays());

    // Check ZFS
    arrays.push(...await this.discoverZfsArrays());

    // Check LVM
    arrays.push(...await this.discoverLvmArrays());

    // Check hardware RAID controllers
    arrays.push(...await this.discoverHardwareRaid());

    return arrays;
  }

  /**
   * Discover mdadm software RAID arrays
   */
  private async discoverMdadmArrays(): Promise<RaidArray[]> {
    const arrays: RaidArray[] = [];

    try {
      // First, find all md devices
      const { stdout: scanOut } = await execFileAsync("mdadm", ["--detail", "--scan"], { timeout: 5_000 });
      const arrayPaths = scanOut.match(/\/dev\/md\d+/g) || [];

      for (const arrayPath of arrayPaths) {
        try {
          const { stdout } = await execFileAsync("mdadm", ["--detail", arrayPath], { timeout: 5_000 });
          
          const nameMatch = stdout.match(/Name\s*:\s*(.+)/);
          const levelMatch = stdout.match(/Raid Level\s*:\s*raid(\d+)/i);
          const stateMatch = stdout.match(/State\s*:\s*(.+)/i);
          const devicesMatch = stdout.match(/Total Devices\s*:\s*(\d+)/i);
          const activeMatch = stdout.match(/Active Devices\s*:\s*(\d+)/i);
          const failedMatch = stdout.match(/Failed Devices\s*:\s*(\d+)/i);
          const spareMatch = stdout.match(/Spare Devices\s*:\s*(\d+)/i);
          const rebuildMatch = stdout.match(/Rebuild Status\s*:\s*(\d+)%/i);
          const syncSpeedMatch = stdout.match(/(\d+[KMG]\/sec)/i);

          // Extract member disks
          const memberDisks: string[] = [];
          const failedMembers: string[] = [];
          const diskRegex = /\s+\d+\s+\d+\s+\d+\s+\d+\s+(active|faulty|spare)\s+(sync|rebuild|spare)?\s+(\S+)/g;
          let diskMatch;
          while ((diskMatch = diskRegex.exec(stdout)) !== null) {
            const [, state, , device] = diskMatch;
            if (device) {
              memberDisks.push(device);
              if (state === "faulty") {
                failedMembers.push(device);
              }
            }
          }

          let status: RaidArray["status"] = "unknown";
          const stateStr = stateMatch?.[1] ? stateMatch[1].toLowerCase() : "";
          if (stateStr.includes("clean") || stateStr.includes("active")) {
            status = "healthy";
          } else if (stateStr.includes("rebuild") || stateStr.includes("recover")) {
            status = "rebuilding";
          } else if (stateStr.includes("degraded")) {
            status = "degraded";
          } else if (stateStr.includes("fail")) {
            status = "failed";
          }

          arrays.push({
            arrayName: arrayPath,
            raidType: "mdadm",
            level: levelMatch ? `RAID${levelMatch[1]}` : "unknown",
            status,
            memberDisks,
            activeMemberCount: activeMatch ? Number(activeMatch[1]) : memberDisks.length,
            totalMemberCount: devicesMatch ? Number(devicesMatch[1]) : memberDisks.length,
            failedMembers,
            spareMemberCount: spareMatch ? Number(spareMatch[1]) : 0,
            rebuildProgressPercent: rebuildMatch ? Number(rebuildMatch[1]) : undefined,
            syncSpeed: syncSpeedMatch ? syncSpeedMatch[1] : undefined,
            riskLevel: "none",
          });
        } catch (error) {
          // Skip arrays we can't read
        }
      }
    } catch {
      // mdadm not available or no arrays
    }

    return arrays;
  }

  /**
   * Discover ZFS pools and arrays
   */
  private async discoverZfsArrays(): Promise<RaidArray[]> {
    const arrays: RaidArray[] = [];

    try {
      const { stdout } = await execFileAsync("zpool", ["status", "-v"], { timeout: 5_000 });
      
      // Parse ZFS pool output
      const poolBlocks = stdout.split(/pool:/i).slice(1);
      
      for (const block of poolBlocks) {
        const lines = block.trim().split(/\r?\n/);
        const poolName = lines[0]?.trim() || "unknown";
        
        const stateMatch = block.match(/state:\s*(\w+)/i);
        const statusMatch = block.match(/status:\s*(.+)/i);
        const scanMatch = block.match(/scan:\s*(.+)/i);
        
        let status: RaidArray["status"] = "unknown";
        const stateStr = stateMatch?.[1] ? stateMatch[1].toLowerCase() : "";
        if (stateStr === "online") {
          status = "healthy";
        } else if (stateStr === "degraded") {
          status = "degraded";
        } else if (stateStr === "faulted" || stateStr === "unavail") {
          status = "failed";
        }

        // Check for resilver (rebuild)
        if (scanMatch?.[1] && /resilver|repair/i.test(scanMatch[1])) {
          status = "rebuilding";
        }

        const memberDisks: string[] = [];
        const failedMembers: string[] = [];
        
        // Extract member disks (look for disk identifiers)
        const diskRegex = /\s+(sd[a-z]|nvme\d+n\d+|c\d+t\d+d\d+)\s+(ONLINE|DEGRADED|FAULTED|OFFLINE)/gi;
        let diskMatch;
        while ((diskMatch = diskRegex.exec(block)) !== null) {
          const [, device, state] = diskMatch;
          if (device) {
            memberDisks.push(`/dev/${device}`);
            if (state !== "ONLINE") {
              failedMembers.push(`/dev/${device}`);
            }
          }
        }

        arrays.push({
          arrayName: poolName,
          raidType: "zfs",
          level: "ZFS Pool",
          status,
          memberDisks,
          activeMemberCount: memberDisks.length - failedMembers.length,
          totalMemberCount: memberDisks.length,
          failedMembers,
          riskLevel: "none",
        });
      }
    } catch {
      // ZFS not available
    }

    return arrays;
  }

  /**
   * Discover LVM logical volumes
   */
  private async discoverLvmArrays(): Promise<RaidArray[]> {
    const arrays: RaidArray[] = [];

    try {
      const { stdout } = await execFileAsync("lvs", ["--noheadings", "-o", "lv_name,vg_name,lv_health_status"], { timeout: 5_000 });
      
      const lines = stdout.trim().split(/\r?\n/);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;

        const [lvName, vgName, healthStatus] = parts;

        let status: RaidArray["status"] = "unknown";
        if (healthStatus && healthStatus !== "-") {
          status = healthStatus.toLowerCase().includes("partial") ? "degraded" : "healthy";
        } else {
          status = "healthy"; // Assume healthy if no status reported
        }

        arrays.push({
          arrayName: `/dev/${vgName}/${lvName}`,
          raidType: "lvm",
          level: "LVM",
          status,
          memberDisks: [],
          activeMemberCount: 0,
          totalMemberCount: 0,
          failedMembers: [],
          riskLevel: "none",
        });
      }
    } catch {
      // LVM not available
    }

    return arrays;
  }

  /**
   * Discover hardware RAID controllers
   */
  private async discoverHardwareRaid(): Promise<RaidArray[]> {
    const arrays: RaidArray[] = [];

    // Check for common hardware RAID tools
    // MegaRAID (LSI/Broadcom)
    arrays.push(...await this.checkMegaRaid());

    // HP Smart Array
    arrays.push(...await this.checkHpSmartArray());

    // Dell PERC
    arrays.push(...await this.checkDellPerc());

    return arrays;
  }

  private async checkMegaRaid(): Promise<RaidArray[]> {
    const arrays: RaidArray[] = [];
    
    try {
      const { stdout } = await execFileAsync("megacli", ["-LDInfo", "-Lall", "-aALL"], { timeout: 5_000 });
      
      // Parse MegaRAID output (implementation depends on output format)
      // This is a placeholder - actual implementation would parse the specific output format
      
    } catch {
      // MegaRAID not available
    }

    return arrays;
  }

  private async checkHpSmartArray(): Promise<RaidArray[]> {
    const arrays: RaidArray[] = [];
    
    try {
      const { stdout } = await execFileAsync("hpssacli", ["ctrl", "all", "show", "config"], { timeout: 5_000 });
      
      // Parse HP Smart Array output
      // This is a placeholder
      
    } catch {
      // HP Smart Array not available
    }

    return arrays;
  }

  private async checkDellPerc(): Promise<RaidArray[]> {
    const arrays: RaidArray[] = [];
    
    try {
      const { stdout } = await execFileAsync("perccli", ["/call", "show", "all"], { timeout: 5_000 });
      
      // Parse Dell PERC output
      // This is a placeholder
      
    } catch {
      // Dell PERC not available
    }

    return arrays;
  }

  /**
   * Calculate risk level for a physical disk
   */
  private calculateDiskRiskLevel(disk: PhysicalDisk): StorageRiskLevel {
    if (!disk.smart) return "none";

    const { smart } = disk;

    // Critical conditions
    if (smart.overallStatus === "failed") return "critical";
    if (smart.uncorrectableSectors > 0) return "critical";
    if (smart.reallocatedSectors > 100) return "critical";
    if (smart.remainingSsdLifePercent !== undefined && smart.remainingSsdLifePercent < 5) return "critical";

    // High risk conditions
    if (smart.reallocatedSectors > 10) return "high";
    if (smart.pendingSectors > 5) return "high";
    if (smart.remainingSsdLifePercent !== undefined && smart.remainingSsdLifePercent < 10) return "high";
    if (disk.temperatureCelsius && disk.temperatureCelsius > 60) return "high";

    // Medium risk conditions
    if (smart.reallocatedSectors > 0) return "medium";
    if (smart.pendingSectors > 0) return "medium";
    if (smart.interfaceCrcErrors > 100) return "medium";
    if (smart.remainingSsdLifePercent !== undefined && smart.remainingSsdLifePercent < 20) return "medium";
    if (disk.temperatureCelsius && disk.temperatureCelsius > 55) return "medium";

    // Low risk conditions
    if (smart.powerOnHours && smart.powerOnHours > 50000) return "low"; // ~5.7 years
    if (disk.temperatureCelsius && disk.temperatureCelsius > 50) return "low";

    return "none";
  }

  /**
   * Calculate risk level for a RAID array
   */
  private calculateRaidRiskLevel(raid: RaidArray): StorageRiskLevel {
    if (raid.status === "failed") return "critical";
    if (raid.status === "degraded" && raid.failedMembers.length > 1) return "critical";
    if (raid.status === "degraded") return "high";
    if (raid.status === "rebuilding") return "medium";
    if (raid.status === "unknown") return "low";
    return "none";
  }

  /**
   * Calculate overall storage risk level
   */
  private calculateOverallRiskLevel(disks: PhysicalDisk[], raids: RaidArray[]): StorageRiskLevel {
    const allRiskLevels = [
      ...disks.map((d) => d.riskLevel),
      ...raids.map((r) => r.riskLevel),
    ];

    if (allRiskLevels.includes("critical")) return "critical";
    if (allRiskLevels.includes("high")) return "high";
    if (allRiskLevels.includes("medium")) return "medium";
    if (allRiskLevels.includes("low")) return "low";
    return "none";
  }

  /**
   * Clear the cache to force a fresh scan
   */
  clearCache(): void {
    this.cachedReport = undefined;
    this.cacheTimestamp = undefined;
  }
}

/**
 * Singleton instance for easy access
 */
export const storageHealthAgent = new StorageHealthAgent();
