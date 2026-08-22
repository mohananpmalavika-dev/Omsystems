#!/usr/bin/env node
/**
 * Storage Health Agent Demo
 * 
 * This script demonstrates the Storage Health Agent's capabilities
 * by running a comprehensive storage scan and displaying the results.
 */

import { storageHealthAgent } from "../src/storage-health-agent.js";
import { createStorageMonitoringService } from "../src/storage-monitoring-service.js";

// ANSI color codes for pretty output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function riskLevelColor(level: string): string {
  switch (level) {
    case "critical": return "red";
    case "high": return "red";
    case "medium": return "yellow";
    case "low": return "yellow";
    case "none": return "green";
    default: return "reset";
  }
}

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "passed":
    case "healthy":
    case "online":
      return "green";
    case "degraded":
    case "rebuilding":
    case "warning":
      return "yellow";
    case "failed":
    case "critical":
    case "faulted":
      return "red";
    default:
      return "dim";
  }
}

async function runDemo() {
  console.log(colorize("\n╔═══════════════════════════════════════════════════════╗", "cyan"));
  console.log(colorize("║     Storage Health Agent - Comprehensive Scan       ║", "cyan"));
  console.log(colorize("╚═══════════════════════════════════════════════════════╝\n", "cyan"));

  console.log(colorize("🔍 Discovering physical disks and RAID arrays...", "blue"));
  console.log();

  const startTime = Date.now();
  const report = await storageHealthAgent.getHealthReport(true);
  const scanDuration = Date.now() - startTime;

  // Overall Summary
  console.log(colorize("═══════════════════════════════════════════════════════", "cyan"));
  console.log(colorize("  OVERALL STORAGE HEALTH", "bright"));
  console.log(colorize("═══════════════════════════════════════════════════════", "cyan"));
  console.log();
  
  const riskColor = riskLevelColor(report.overallRiskLevel);
  console.log(`  Overall Risk Level: ${colorize(report.overallRiskLevel.toUpperCase(), riskColor)}`);
  console.log(`  Scan Duration: ${scanDuration}ms`);
  console.log(`  Physical Disks Found: ${report.physicalDisks.length}`);
  console.log(`  RAID Arrays Found: ${report.raidArrays.length}`);
  console.log();

  // Physical Disks
  if (report.physicalDisks.length > 0) {
    console.log(colorize("═══════════════════════════════════════════════════════", "cyan"));
    console.log(colorize("  PHYSICAL DISKS", "bright"));
    console.log(colorize("═══════════════════════════════════════════════════════", "cyan"));
    console.log();

    for (const disk of report.physicalDisks) {
      const riskColor = riskLevelColor(disk.riskLevel);
      
      console.log(colorize(`  ${disk.devicePath}`, "bright"));
      console.log(`    Type: ${disk.diskType.toUpperCase()} ${disk.rotational ? "(Rotational)" : "(Solid State)"}`);
      
      if (disk.model) {
        console.log(`    Model: ${disk.model}`);
      }
      
      if (disk.serial) {
        console.log(`    Serial: ${disk.serial}`);
      }

      if (disk.size) {
        const sizeGB = (disk.size / 1024 / 1024 / 1024).toFixed(2);
        console.log(`    Size: ${sizeGB} GB`);
      }

      if (disk.mountPoint) {
        console.log(`    Mount: ${disk.mountPoint}`);
      }

      console.log(`    Risk Level: ${colorize(disk.riskLevel.toUpperCase(), riskColor)}`);

      // SMART data
      if (disk.smart) {
        const smartColor = statusColor(disk.smart.overallStatus);
        console.log(`    SMART Status: ${colorize(disk.smart.overallStatus.toUpperCase(), smartColor)}`);
        
        if (disk.temperatureCelsius !== undefined) {
          const tempColor = disk.temperatureCelsius > 55 ? "red" : 
                           disk.temperatureCelsius > 50 ? "yellow" : "green";
          console.log(`    Temperature: ${colorize(`${disk.temperatureCelsius}°C`, tempColor)}`);
        }

        if (disk.smart.powerOnHours !== undefined) {
          const years = (disk.smart.powerOnHours / 8760).toFixed(1);
          console.log(`    Power-On Hours: ${disk.smart.powerOnHours.toLocaleString()} (~${years} years)`);
        }

        if (disk.badSectors > 0) {
          console.log(colorize(`    ⚠ Bad Sectors: ${disk.badSectors}`, "red"));
          console.log(`      - Reallocated: ${disk.smart.reallocatedSectors}`);
          console.log(`      - Pending: ${disk.smart.pendingSectors}`);
          console.log(`      - Uncorrectable: ${disk.smart.uncorrectableSectors}`);
        }

        if (disk.smart.remainingSsdLifePercent !== undefined) {
          const lifeColor = disk.smart.remainingSsdLifePercent < 10 ? "red" :
                           disk.smart.remainingSsdLifePercent < 20 ? "yellow" : "green";
          console.log(`    SSD Life Remaining: ${colorize(`${disk.smart.remainingSsdLifePercent}%`, lifeColor)}`);
        }

        if (disk.smart.interfaceCrcErrors > 0) {
          console.log(colorize(`    ⚠ Interface CRC Errors: ${disk.smart.interfaceCrcErrors}`, "yellow"));
        }
      }

      console.log();
    }
  } else {
    console.log(colorize("  No physical disks detected", "dim"));
    console.log();
  }

  // RAID Arrays
  if (report.raidArrays.length > 0) {
    console.log(colorize("═══════════════════════════════════════════════════════", "cyan"));
    console.log(colorize("  RAID ARRAYS", "bright"));
    console.log(colorize("═══════════════════════════════════════════════════════", "cyan"));
    console.log();

    for (const raid of report.raidArrays) {
      const statusCol = statusColor(raid.status);
      const riskColor = riskLevelColor(raid.riskLevel);

      console.log(colorize(`  ${raid.arrayName}`, "bright"));
      console.log(`    Type: ${raid.raidType.toUpperCase()}`);
      console.log(`    Level: ${raid.level}`);
      console.log(`    Status: ${colorize(raid.status.toUpperCase(), statusCol)}`);
      console.log(`    Risk Level: ${colorize(raid.riskLevel.toUpperCase(), riskColor)}`);
      console.log(`    Members: ${raid.activeMemberCount}/${raid.totalMemberCount} active`);

      if (raid.memberDisks.length > 0) {
        console.log(`    Disks: ${raid.memberDisks.join(", ")}`);
      }

      if (raid.failedMembers.length > 0) {
        console.log(colorize(`    ⚠ Failed: ${raid.failedMembers.join(", ")}`, "red"));
      }

      if (raid.spareMemberCount !== undefined && raid.spareMemberCount > 0) {
        console.log(`    Hot Spares: ${raid.spareMemberCount}`);
      }

      if (raid.status === "rebuilding") {
        console.log(colorize(`    Rebuild Progress: ${raid.rebuildProgressPercent}%`, "yellow"));
        if (raid.syncSpeed) {
          console.log(`    Sync Speed: ${raid.syncSpeed}`);
        }
        if (raid.estimatedRebuildTime) {
          console.log(`    Estimated Time: ${raid.estimatedRebuildTime}`);
        }
      }

      if (raid.controllerHealth) {
        const ctrlColor = statusColor(raid.controllerHealth);
        console.log(`    Controller: ${colorize(raid.controllerHealth.toUpperCase(), ctrlColor)}`);
      }

      console.log();
    }
  } else {
    console.log(colorize("  No RAID arrays detected", "dim"));
    console.log();
  }

  // Errors
  if (report.errors.length > 0) {
    console.log(colorize("═══════════════════════════════════════════════════════", "red"));
    console.log(colorize("  ❌ CRITICAL ERRORS", "red"));
    console.log(colorize("═══════════════════════════════════════════════════════", "red"));
    console.log();

    for (const error of report.errors) {
      console.log(colorize(`  • ${error}`, "red"));
    }
    console.log();
  }

  // Warnings
  if (report.warnings.length > 0) {
    console.log(colorize("═══════════════════════════════════════════════════════", "yellow"));
    console.log(colorize("  ⚠ WARNINGS", "yellow"));
    console.log(colorize("═══════════════════════════════════════════════════════", "yellow"));
    console.log();

    for (const warning of report.warnings) {
      console.log(colorize(`  • ${warning}`, "yellow"));
    }
    console.log();
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log(colorize("═══════════════════════════════════════════════════════", "cyan"));
    console.log(colorize("  💡 RECOMMENDATIONS", "cyan"));
    console.log(colorize("═══════════════════════════════════════════════════════", "cyan"));
    console.log();

    for (const rec of report.recommendations) {
      console.log(colorize(`  • ${rec}`, "cyan"));
    }
    console.log();
  }

  // Final status
  console.log(colorize("═══════════════════════════════════════════════════════", "green"));
  if (report.overallRiskLevel === "none") {
    console.log(colorize("  ✓ All storage systems are healthy", "green"));
  } else if (report.overallRiskLevel === "low") {
    console.log(colorize("  ✓ Storage systems are mostly healthy", "green"));
  } else if (report.overallRiskLevel === "medium") {
    console.log(colorize("  ⚠ Storage requires monitoring", "yellow"));
  } else if (report.overallRiskLevel === "high") {
    console.log(colorize("  ⚠ Storage requires attention soon", "yellow"));
  } else {
    console.log(colorize("  ❌ IMMEDIATE ACTION REQUIRED", "red"));
  }
  console.log(colorize("═══════════════════════════════════════════════════════\n", "green"));

  // Demo monitoring service
  console.log(colorize("\n╔═══════════════════════════════════════════════════════╗", "cyan"));
  console.log(colorize("║     Storage Monitoring Service Demo                 ║", "cyan"));
  console.log(colorize("╚═══════════════════════════════════════════════════════╝\n", "cyan"));

  const monitoringService = createStorageMonitoringService({
    checkIntervalMs: 10_000, // 10 seconds for demo
    alertThresholds: {
      diskTemperatureWarning: 55,
      diskTemperatureCritical: 60,
      badSectorWarning: 1,
      badSectorCritical: 10,
      raidRebuildNotify: true,
    },
    notifications: {
      enabled: false, // Disabled for demo
    },
  });

  console.log(colorize("Starting monitoring service (will run for 30 seconds)...", "blue"));
  monitoringService.start();

  // Let it run for 30 seconds
  await new Promise((resolve) => setTimeout(resolve, 30_000));

  monitoringService.stop();

  const summary = monitoringService.getHealthSummary();
  const alerts = monitoringService.getRecentAlerts(10);

  console.log();
  console.log(colorize("═══════════════════════════════════════════════════════", "cyan"));
  console.log(colorize("  MONITORING SUMMARY", "bright"));
  console.log(colorize("═══════════════════════════════════════════════════════", "cyan"));
  console.log();
  console.log(`  Total Disks: ${summary.totalDisks}`);
  console.log(`  Healthy: ${colorize(String(summary.healthyDisks), "green")}`);
  console.log(`  Warning: ${colorize(String(summary.warningDisks), "yellow")}`);
  console.log(`  Critical: ${colorize(String(summary.criticalDisks), "red")}`);
  console.log();
  console.log(`  Total RAID Arrays: ${summary.totalRaids}`);
  console.log(`  Healthy: ${colorize(String(summary.healthyRaids), "green")}`);
  console.log(`  Degraded: ${colorize(String(summary.degradedRaids), "yellow")}`);
  console.log(`  Rebuilding: ${colorize(String(summary.rebuildingRaids), "yellow")}`);
  console.log(`  Failed: ${colorize(String(summary.failedRaids), "red")}`);
  console.log();
  console.log(`  Recent Alerts (last hour):`);
  console.log(`    Critical: ${colorize(String(summary.recentAlerts.critical), "red")}`);
  console.log(`    Warning: ${colorize(String(summary.recentAlerts.warning), "yellow")}`);
  console.log(`    Info: ${colorize(String(summary.recentAlerts.info), "dim")}`);

  if (alerts.length > 0) {
    console.log();
    console.log(colorize("  Recent Alerts:", "bright"));
    for (const alert of alerts.slice(-5)) {
      const severityColor = alert.severity === "critical" ? "red" :
                           alert.severity === "warning" ? "yellow" : "dim";
      console.log(colorize(`    [${alert.severity.toUpperCase()}] ${alert.message}`, severityColor));
    }
  }

  console.log();
  console.log(colorize("═══════════════════════════════════════════════════════\n", "cyan"));
  console.log(colorize("✓ Demo complete!", "green"));
  console.log();
}

// Run the demo
runDemo().catch((error) => {
  console.error(colorize("\n❌ Demo failed:", "red"), error);
  process.exit(1);
});
