import { storageHealthAgent, type StorageHealthReport, type StorageRiskLevel } from "./storage-health-agent.js";

export interface StorageMonitoringConfig {
  checkIntervalMs: number; // How often to check storage health
  alertThresholds: {
    diskTemperatureWarning: number; // °C
    diskTemperatureCritical: number; // °C
    badSectorWarning: number;
    badSectorCritical: number;
    raidRebuildNotify: boolean;
  };
  notifications: {
    enabled: boolean;
    webhookUrl?: string;
    email?: string;
  };
}

export interface StorageAlert {
  timestamp: Date;
  severity: "info" | "warning" | "critical";
  category: "disk" | "raid" | "overall";
  message: string;
  devicePath?: string;
  arrayName?: string;
  metrics?: Record<string, any>;
}

export class StorageMonitoringService {
  private intervalId?: NodeJS.Timeout;
  private lastReport?: StorageHealthReport;
  private alertHistory: StorageAlert[] = [];
  private readonly maxAlertHistory = 1000;

  constructor(private readonly config: StorageMonitoringConfig) {}

  /**
   * Start continuous storage monitoring
   */
  start(): void {
    if (this.intervalId) {
      console.warn("Storage monitoring already started");
      return;
    }

    console.log(`Starting storage monitoring (interval: ${this.config.checkIntervalMs}ms)`);
    
    // Run initial check
    this.checkStorageHealth().catch((error) => {
      console.error("Initial storage health check failed:", error);
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.checkStorageHealth().catch((error) => {
        console.error("Storage health check failed:", error);
      });
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop storage monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log("Storage monitoring stopped");
    }
  }

  /**
   * Get the latest storage health report
   */
  getLatestReport(): StorageHealthReport | undefined {
    return this.lastReport;
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(count = 50): StorageAlert[] {
    return this.alertHistory.slice(-count);
  }

  /**
   * Get alerts for a specific device
   */
  getDeviceAlerts(devicePath: string, count = 50): StorageAlert[] {
    return this.alertHistory
      .filter((alert) => alert.devicePath === devicePath)
      .slice(-count);
  }

  /**
   * Clear alert history
   */
  clearAlertHistory(): void {
    this.alertHistory = [];
  }

  /**
   * Perform storage health check and generate alerts
   */
  private async checkStorageHealth(): Promise<void> {
    const report = await storageHealthAgent.getHealthReport(true); // Force refresh
    this.lastReport = report;

    // Process overall health
    await this.processOverallHealth(report);

    // Process individual disks
    for (const disk of report.physicalDisks) {
      await this.processDiskHealth(disk, report);
    }

    // Process RAID arrays
    for (const raid of report.raidArrays) {
      await this.processRaidHealth(raid, report);
    }

    // Trim alert history if it gets too large
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory = this.alertHistory.slice(-this.maxAlertHistory);
    }
  }

  /**
   * Process overall storage health
   */
  private async processOverallHealth(report: StorageHealthReport): Promise<void> {
    // Critical overall risk
    if (report.overallRiskLevel === "critical") {
      await this.createAlert({
        severity: "critical",
        category: "overall",
        message: `Storage risk level is CRITICAL! ${report.errors.length} errors detected.`,
        metrics: {
          errors: report.errors,
          recommendations: report.recommendations,
        },
      });
    }

    // High overall risk
    if (report.overallRiskLevel === "high") {
      await this.createAlert({
        severity: "warning",
        category: "overall",
        message: `Storage risk level is HIGH. Action required soon.`,
        metrics: {
          warnings: report.warnings,
          recommendations: report.recommendations,
        },
      });
    }

    // Report errors as individual alerts
    for (const error of report.errors) {
      await this.createAlert({
        severity: "critical",
        category: "overall",
        message: error,
      });
    }
  }

  /**
   * Process individual disk health
   */
  private async processDiskHealth(disk: any, report: StorageHealthReport): Promise<void> {
    const { thresholds } = this.config.alert;

    // Temperature alerts
    if (disk.temperatureCelsius) {
      if (disk.temperatureCelsius >= thresholds.diskTemperatureCritical) {
        await this.createAlert({
          severity: "critical",
          category: "disk",
          message: `Disk ${disk.devicePath} temperature CRITICAL: ${disk.temperatureCelsius}°C`,
          devicePath: disk.devicePath,
          metrics: {
            temperature: disk.temperatureCelsius,
            model: disk.model,
            serial: disk.serial,
          },
        });
      } else if (disk.temperatureCelsius >= thresholds.diskTemperatureWarning) {
        await this.createAlert({
          severity: "warning",
          category: "disk",
          message: `Disk ${disk.devicePath} temperature high: ${disk.temperatureCelsius}°C`,
          devicePath: disk.devicePath,
          metrics: {
            temperature: disk.temperatureCelsius,
          },
        });
      }
    }

    // Bad sector alerts
    if (disk.badSectors >= thresholds.badSectorCritical) {
      await this.createAlert({
        severity: "critical",
        category: "disk",
        message: `Disk ${disk.devicePath} has ${disk.badSectors} bad sectors - REPLACE IMMEDIATELY`,
        devicePath: disk.devicePath,
        metrics: {
          badSectors: disk.badSectors,
          reallocatedSectors: disk.smart?.reallocatedSectors,
          pendingSectors: disk.smart?.pendingSectors,
          uncorrectableSectors: disk.smart?.uncorrectableSectors,
        },
      });
    } else if (disk.badSectors >= thresholds.badSectorWarning) {
      await this.createAlert({
        severity: "warning",
        category: "disk",
        message: `Disk ${disk.devicePath} has ${disk.badSectors} bad sectors`,
        devicePath: disk.devicePath,
        metrics: {
          badSectors: disk.badSectors,
        },
      });
    }

    // SMART status alerts
    if (disk.smart?.overallStatus === "failed") {
      await this.createAlert({
        severity: "critical",
        category: "disk",
        message: `Disk ${disk.devicePath} SMART status: FAILED`,
        devicePath: disk.devicePath,
        metrics: {
          smart: disk.smart,
        },
      });
    }

    // SSD life remaining alerts
    if (disk.smart?.remainingSsdLifePercent !== undefined) {
      if (disk.smart.remainingSsdLifePercent < 5) {
        await this.createAlert({
          severity: "critical",
          category: "disk",
          message: `SSD ${disk.devicePath} life remaining: ${disk.smart.remainingSsdLifePercent}% - REPLACE NOW`,
          devicePath: disk.devicePath,
          metrics: {
            remainingLife: disk.smart.remainingSsdLifePercent,
          },
        });
      } else if (disk.smart.remainingSsdLifePercent < 10) {
        await this.createAlert({
          severity: "warning",
          category: "disk",
          message: `SSD ${disk.devicePath} life remaining: ${disk.smart.remainingSsdLifePercent}%`,
          devicePath: disk.devicePath,
          metrics: {
            remainingLife: disk.smart.remainingSsdLifePercent,
          },
        });
      }
    }

    // Disk risk level alerts
    if (disk.riskLevel === "critical" || disk.riskLevel === "high") {
      await this.createAlert({
        severity: disk.riskLevel === "critical" ? "critical" : "warning",
        category: "disk",
        message: `Disk ${disk.devicePath} risk level: ${disk.riskLevel.toUpperCase()}`,
        devicePath: disk.devicePath,
        metrics: {
          riskLevel: disk.riskLevel,
          model: disk.model,
          serial: disk.serial,
        },
      });
    }
  }

  /**
   * Process RAID array health
   */
  private async processRaidHealth(raid: any, report: StorageHealthReport): Promise<void> {
    // RAID failed
    if (raid.status === "failed") {
      await this.createAlert({
        severity: "critical",
        category: "raid",
        message: `RAID ${raid.arrayName} has FAILED - Data loss may occur!`,
        arrayName: raid.arrayName,
        metrics: {
          level: raid.level,
          memberDisks: raid.memberDisks,
          failedMembers: raid.failedMembers,
        },
      });
    }

    // RAID degraded
    if (raid.status === "degraded") {
      await this.createAlert({
        severity: "critical",
        category: "raid",
        message: `RAID ${raid.arrayName} is DEGRADED - ${raid.failedMembers.length} disk(s) failed: ${raid.failedMembers.join(", ")}`,
        arrayName: raid.arrayName,
        metrics: {
          level: raid.level,
          activeMemberCount: raid.activeMemberCount,
          totalMemberCount: raid.totalMemberCount,
          failedMembers: raid.failedMembers,
        },
      });
    }

    // RAID rebuilding
    if (raid.status === "rebuilding" && this.config.alertThresholds.raidRebuildNotify) {
      await this.createAlert({
        severity: "info",
        category: "raid",
        message: `RAID ${raid.arrayName} is rebuilding: ${raid.rebuildProgressPercent}% complete`,
        arrayName: raid.arrayName,
        metrics: {
          rebuildProgress: raid.rebuildProgressPercent,
          syncSpeed: raid.syncSpeed,
          estimatedTime: raid.estimatedRebuildTime,
        },
      });
    }

    // RAID risk level alerts
    if (raid.riskLevel === "critical" || raid.riskLevel === "high") {
      await this.createAlert({
        severity: raid.riskLevel === "critical" ? "critical" : "warning",
        category: "raid",
        message: `RAID ${raid.arrayName} risk level: ${raid.riskLevel.toUpperCase()}`,
        arrayName: raid.arrayName,
        metrics: {
          riskLevel: raid.riskLevel,
          status: raid.status,
          level: raid.level,
        },
      });
    }
  }

  /**
   * Create and store an alert
   */
  private async createAlert(alertData: Omit<StorageAlert, "timestamp">): Promise<void> {
    const alert: StorageAlert = {
      timestamp: new Date(),
      ...alertData,
    };

    // Add to history
    this.alertHistory.push(alert);

    // Log to console
    const logMethod = alert.severity === "critical" ? console.error : 
                      alert.severity === "warning" ? console.warn : 
                      console.info;
    
    logMethod(`[Storage Alert] [${alert.severity.toUpperCase()}] ${alert.message}`);

    // Send notification if enabled
    if (this.config.notifications.enabled) {
      await this.sendNotification(alert);
    }
  }

  /**
   * Send notification for an alert
   */
  private async sendNotification(alert: StorageAlert): Promise<void> {
    try {
      // Webhook notification
      if (this.config.notifications.webhookUrl) {
        await fetch(this.config.notifications.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            alert,
            report: this.lastReport ? {
              timestamp: this.lastReport.timestamp,
              overallRiskLevel: this.lastReport.overallRiskLevel,
              diskCount: this.lastReport.physicalDisks.length,
              raidCount: this.lastReport.raidArrays.length,
            } : null,
          }),
        });
      }

      // Email notification (placeholder - implement with your email service)
      if (this.config.notifications.email) {
        // TODO: Implement email notification
        console.log(`Email notification would be sent to: ${this.config.notifications.email}`);
      }
    } catch (error) {
      console.error("Failed to send notification:", error);
    }
  }

  /**
   * Get health summary statistics
   */
  getHealthSummary(): {
    overallRiskLevel: StorageRiskLevel | "unknown";
    totalDisks: number;
    healthyDisks: number;
    warningDisks: number;
    criticalDisks: number;
    totalRaids: number;
    healthyRaids: number;
    degradedRaids: number;
    rebuildingRaids: number;
    failedRaids: number;
    recentAlerts: {
      critical: number;
      warning: number;
      info: number;
    };
  } {
    if (!this.lastReport) {
      return {
        overallRiskLevel: "unknown",
        totalDisks: 0,
        healthyDisks: 0,
        warningDisks: 0,
        criticalDisks: 0,
        totalRaids: 0,
        healthyRaids: 0,
        degradedRaids: 0,
        rebuildingRaids: 0,
        failedRaids: 0,
        recentAlerts: { critical: 0, warning: 0, info: 0 },
      };
    }

    const disks = this.lastReport.physicalDisks;
    const raids = this.lastReport.raidArrays;
    
    // Count alerts from last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentAlerts = this.alertHistory.filter((a) => a.timestamp >= oneHourAgo);

    return {
      overallRiskLevel: this.lastReport.overallRiskLevel,
      totalDisks: disks.length,
      healthyDisks: disks.filter((d) => d.riskLevel === "none" || d.riskLevel === "low").length,
      warningDisks: disks.filter((d) => d.riskLevel === "medium" || d.riskLevel === "high").length,
      criticalDisks: disks.filter((d) => d.riskLevel === "critical").length,
      totalRaids: raids.length,
      healthyRaids: raids.filter((r) => r.status === "healthy").length,
      degradedRaids: raids.filter((r) => r.status === "degraded").length,
      rebuildingRaids: raids.filter((r) => r.status === "rebuilding").length,
      failedRaids: raids.filter((r) => r.status === "failed").length,
      recentAlerts: {
        critical: recentAlerts.filter((a) => a.severity === "critical").length,
        warning: recentAlerts.filter((a) => a.severity === "warning").length,
        info: recentAlerts.filter((a) => a.severity === "info").length,
      },
    };
  }
}

/**
 * Create a storage monitoring service with default configuration
 */
export function createStorageMonitoringService(
  overrides?: Partial<StorageMonitoringConfig>
): StorageMonitoringService {
  const defaultConfig: StorageMonitoringConfig = {
    checkIntervalMs: 5 * 60 * 1000, // 5 minutes
    alertThresholds: {
      diskTemperatureWarning: 55,
      diskTemperatureCritical: 60,
      badSectorWarning: 1,
      badSectorCritical: 10,
      raidRebuildNotify: true,
    },
    notifications: {
      enabled: false,
    },
  };

  const config = { ...defaultConfig, ...overrides };
  return new StorageMonitoringService(config);
}
