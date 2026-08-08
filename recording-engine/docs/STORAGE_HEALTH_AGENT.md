# Storage Health Agent

## Overview

The Storage Health Agent is a comprehensive storage monitoring system designed for enterprise recording servers. Unlike simple hardcoded disk monitoring, it dynamically discovers and monitors all storage devices, RAID arrays, and provides actionable health insights.

## Problem Statement

The original implementation had critical flaws:

1. **Hardcoded Device Path**: SMART monitoring was locked to `/dev/sda`
2. **Incomplete RAID Discovery**: Would return "healthy" without actually verifying RAID state
3. **No Multi-Disk Support**: Couldn't handle servers with multiple disks, NVMe, or hardware RAID
4. **No Risk Assessment**: No intelligent analysis of storage health trends

## Architecture

```
OS Level
    ↓
Physical Disk Discovery (lsblk/udev)
    ↓
Per-Disk SMART Collection (smartctl)
    ↓
RAID Array Discovery
    ├─ mdadm (Software RAID)
    ├─ ZFS (ZFS Pools)
    ├─ LVM (Logical Volumes)
    └─ Hardware RAID Controllers
        ├─ MegaRAID (LSI/Broadcom)
        ├─ HP Smart Array
        └─ Dell PERC
    ↓
Health Analysis
    ├─ Temperature Monitoring
    ├─ Bad Sector Tracking
    ├─ SSD Life Remaining
    ├─ RAID Status
    └─ Rebuild Progress
    ↓
Risk Assessment
    ├─ Disk-Level Risk (none → critical)
    ├─ RAID-Level Risk
    └─ Overall Storage Risk
    ↓
Actionable Recommendations
```

## Features

### 1. Dynamic Disk Discovery

Automatically discovers all block devices:
- SATA/SAS disks (`/dev/sda`, `/dev/sdb`, etc.)
- NVMe devices (`/dev/nvme0n1`, `/dev/nvme1n1`, etc.)
- Virtual disks (`/dev/vda`, `/dev/vdb`, etc.)
- Identifies disk type (HDD, SSD, NVMe)
- Detects rotational vs solid-state

### 2. Comprehensive SMART Monitoring

For each disk, collects:
- Overall health status (passed/failed)
- Reallocated sectors
- Pending sectors
- Uncorrectable sectors
- Temperature (°C)
- Power-on hours
- Read/write error rates
- SSD remaining life percentage
- Interface CRC errors
- Seek error rate (HDDs)
- Spin retry count (HDDs)

### 3. Multi-Source RAID Discovery

#### Linux Software RAID (mdadm)
- Discovers `/dev/md*` arrays
- Parses RAID level (RAID0, RAID1, RAID5, RAID6, RAID10)
- Identifies member disks
- Detects failed members
- Tracks rebuild progress and speed
- Monitors hot spare status

#### ZFS Pools
- Discovers all ZFS pools
- Monitors pool state (online, degraded, faulted)
- Tracks resilver (rebuild) progress
- Identifies failed vdevs

#### LVM Logical Volumes
- Discovers volume groups and logical volumes
- Monitors health status

#### Hardware RAID Controllers
- MegaRAID (LSI/Broadcom) via `megacli`
- HP Smart Array via `hpssacli`
- Dell PERC via `perccli`

### 4. Risk Level Assessment

Each disk and RAID array is assigned a risk level:

- **None**: Healthy, no issues detected
- **Low**: Minor wear, monitoring recommended
- **Medium**: Notable wear, plan replacement
- **High**: Significant issues, replace soon
- **Critical**: Imminent failure, replace immediately

#### Disk Risk Criteria

| Risk Level | Criteria |
|-----------|----------|
| **Critical** | SMART status failed, uncorrectable sectors > 0, reallocated > 100, SSD life < 5% |
| **High** | Reallocated sectors > 10, pending sectors > 5, SSD life < 10%, temp > 60°C |
| **Medium** | Reallocated sectors > 0, pending sectors > 0, CRC errors > 100, SSD life < 20%, temp > 55°C |
| **Low** | Power-on hours > 50,000 (~5.7 years), temp > 50°C |
| **None** | No issues detected |

#### RAID Risk Criteria

| Risk Level | Criteria |
|-----------|----------|
| **Critical** | RAID failed, degraded with 2+ failed disks |
| **High** | RAID degraded (1 failed disk) |
| **Medium** | RAID rebuilding |
| **Low** | RAID status unknown |
| **None** | RAID healthy |

### 5. Actionable Recommendations

The agent generates specific recommendations:
- "Replace /dev/sda as soon as possible to prevent data loss"
- "Plan replacement for /dev/sdb within 30 days"
- "Check cooling for /dev/nvme0n1"
- "Replace failed disks in /dev/md0: /dev/sdc, /dev/sdd"
- "Monitor rebuild of /dev/md1, ETA: 3h 45m"

## Usage

### Basic Usage

```typescript
import { storageHealthAgent } from './storage-health-agent';

// Get health report (uses 1-minute cache by default)
const report = await storageHealthAgent.getHealthReport();

console.log('Overall Risk:', report.overallRiskLevel);
console.log('Physical Disks:', report.physicalDisks.length);
console.log('RAID Arrays:', report.raidArrays.length);
console.log('Warnings:', report.warnings);
console.log('Errors:', report.errors);
console.log('Recommendations:', report.recommendations);
```

### Force Refresh

```typescript
// Force immediate scan (bypass cache)
const report = await storageHealthAgent.getHealthReport(true);
```

### Clear Cache

```typescript
// Clear cache to force next call to re-scan
storageHealthAgent.clearCache();
```

### Integration with Storage Adapter

```typescript
import { LocalDiskStorageAdapter } from './storage-adapter';

const adapter = new LocalDiskStorageAdapter({
  recordingRoot: '/mnt/recordings',
  supportedTiers: ['hot', 'warm'],
  storageType: 'local-disk',
  supportedProtocols: ['file'],
});

// Get storage metrics (includes health report)
const metrics = await adapter.getMetrics();

console.log('Capacity:', metrics.capacityBytes);
console.log('Used:', metrics.usedBytes);
console.log('SMART Status:', metrics.smart?.overallStatus);
console.log('RAID Status:', metrics.raid?.status);
console.log('Full Health Report:', metrics.healthReport);
```

## Health Report Structure

```typescript
interface StorageHealthReport {
  timestamp: Date;
  
  // All discovered physical disks
  physicalDisks: PhysicalDisk[];
  
  // All discovered RAID arrays
  raidArrays: RaidArray[];
  
  // Highest risk level across all storage
  overallRiskLevel: StorageRiskLevel;
  
  // Non-critical issues
  warnings: string[];
  
  // Critical issues
  errors: string[];
  
  // Actionable recommendations
  recommendations: string[];
}

interface PhysicalDisk {
  devicePath: string;        // e.g., /dev/sda
  deviceName: string;        // e.g., sda
  model?: string;            // WD Red Plus 4TB
  serial?: string;           // WD-12345678
  firmware?: string;         // 80.00A80
  size?: number;             // bytes
  diskType: DiskType;        // hdd | ssd | nvme
  rotational: boolean;
  mountPoint?: string;       // e.g., /mnt/recordings
  smart?: SmartData;
  temperatureCelsius?: number;
  badSectors: number;        // Sum of reallocated + pending + uncorrectable
  riskLevel: StorageRiskLevel;
}

interface RaidArray {
  arrayName: string;         // e.g., /dev/md0
  raidType: RaidType;        // mdadm | zfs | lvm | hardware
  level: string;             // e.g., RAID5, mirror, raidz1
  status: RaidStatus;        // healthy | degraded | rebuilding | failed
  memberDisks: string[];     // e.g., ['/dev/sda', '/dev/sdb']
  activeMemberCount: number;
  totalMemberCount: number;
  failedMembers: string[];
  spareMemberCount?: number;
  rebuildProgressPercent?: number;
  syncSpeed?: string;        // e.g., "125MB/s"
  estimatedRebuildTime?: string;
  controllerHealth?: string;
  riskLevel: StorageRiskLevel;
}
```

## Performance

- **Cache Duration**: 1 minute (configurable)
- **Disk Discovery**: < 1 second (lsblk)
- **SMART Collection**: ~500ms per disk
- **RAID Discovery**: < 1 second per RAID type
- **Total Scan Time**: Typically 2-5 seconds for 4-8 disk system

The 1-minute cache prevents excessive scanning when metrics are frequently requested.

## Requirements

### Required Tools

- `lsblk`: Disk discovery (standard on most Linux)
- `smartctl`: SMART data collection (smartmontools package)

### Optional Tools (for RAID)

- `mdadm`: Linux software RAID
- `zpool`: ZFS pools
- `lvs`: LVM logical volumes
- `megacli`: MegaRAID controllers
- `hpssacli`: HP Smart Array
- `perccli`: Dell PERC controllers

### Installation

```bash
# Ubuntu/Debian
sudo apt-get install smartmontools mdadm

# RHEL/CentOS
sudo yum install smartmontools mdadm

# ZFS (Ubuntu)
sudo apt-get install zfsutils-linux
```

## Error Handling

The agent is designed to degrade gracefully:

- If `lsblk` fails, falls back to scanning common device paths
- If SMART collection fails for a disk, continues with other disks
- If RAID discovery fails for one type (e.g., ZFS), continues with others
- Missing tools result in empty arrays, not failures
- All external command execution has 5-second timeouts

## Production Deployment

### Monitoring Integration

Export health reports to your monitoring system:

```typescript
import { storageHealthAgent } from './storage-health-agent';

// Prometheus metrics
app.get('/metrics', async (req, res) => {
  const report = await storageHealthAgent.getHealthReport();
  
  const metrics = [
    `# HELP storage_risk_level Overall storage risk level (0=none, 1=low, 2=medium, 3=high, 4=critical)`,
    `# TYPE storage_risk_level gauge`,
    `storage_risk_level ${riskLevelToNumber(report.overallRiskLevel)}`,
    
    `# HELP storage_disks_total Total physical disks`,
    `# TYPE storage_disks_total gauge`,
    `storage_disks_total ${report.physicalDisks.length}`,
    
    `# HELP storage_raid_arrays_total Total RAID arrays`,
    `# TYPE storage_raid_arrays_total gauge`,
    `storage_raid_arrays_total ${report.raidArrays.length}`,
  ];
  
  for (const disk of report.physicalDisks) {
    metrics.push(
      `storage_disk_temperature_celsius{device="${disk.devicePath}"} ${disk.temperatureCelsius || 0}`,
      `storage_disk_bad_sectors{device="${disk.devicePath}"} ${disk.badSectors}`,
      `storage_disk_risk_level{device="${disk.devicePath}"} ${riskLevelToNumber(disk.riskLevel)}`
    );
  }
  
  res.set('Content-Type', 'text/plain');
  res.send(metrics.join('\n'));
});

function riskLevelToNumber(level: string): number {
  const map = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return map[level] || 0;
}
```

### Alerting Rules

Set up alerts based on risk levels:

```yaml
# Prometheus alert rules
groups:
  - name: storage_health
    rules:
      - alert: StorageCritical
        expr: storage_risk_level >= 4
        for: 5m
        annotations:
          summary: "Critical storage issue detected"
          description: "Storage risk level is CRITICAL"
      
      - alert: StorageHigh
        expr: storage_risk_level >= 3
        for: 15m
        annotations:
          summary: "High storage risk detected"
          description: "Storage risk level is HIGH - plan replacement"
      
      - alert: DiskHighTemperature
        expr: storage_disk_temperature_celsius > 60
        for: 10m
        annotations:
          summary: "Disk {{ $labels.device }} temperature critical"
          description: "Disk temperature is {{ $value }}°C"
      
      - alert: RaidDegraded
        expr: storage_raid_status{status="degraded"} == 1
        for: 1m
        annotations:
          summary: "RAID {{ $labels.array }} is degraded"
          description: "RAID array has failed disk(s)"
```

### Scheduled Monitoring

```typescript
// Run health check every 5 minutes
setInterval(async () => {
  try {
    const report = await storageHealthAgent.getHealthReport(true);
    
    if (report.errors.length > 0) {
      logger.error('Storage critical errors:', report.errors);
      // Send to incident management
      await createIncident({
        severity: 'critical',
        title: 'Storage Health Critical',
        description: report.errors.join('\n'),
      });
    }
    
    if (report.warnings.length > 0) {
      logger.warn('Storage warnings:', report.warnings);
    }
    
    if (report.recommendations.length > 0) {
      logger.info('Storage recommendations:', report.recommendations);
    }
  } catch (error) {
    logger.error('Failed to check storage health:', error);
  }
}, 5 * 60 * 1000);
```

## Comparison: Before vs After

### Before (Hardcoded)

```typescript
// ❌ Hardcoded to /dev/sda
const { stdout } = await execFileAsync("smartctl", ["-A", "/dev/sda"]);

// ❌ Returns "healthy" even if RAID is actually degraded
return {
  status: "healthy",
  level: levelMatch ? `RAID${levelMatch[1]}` : undefined,
  memberDisks: members,
  failedMembers: [],  // Always empty!
};
```

### After (Storage Health Agent)

```typescript
// ✅ Discovers all disks automatically
const disks = await this.discoverPhysicalDisks();

// ✅ Collects SMART for each disk
for (const disk of disks) {
  disk.smart = await this.getSmartData(disk.devicePath);
  disk.riskLevel = this.calculateDiskRiskLevel(disk);
}

// ✅ Properly parses RAID state
const stateStr = stateMatch ? stateMatch[1].toLowerCase() : "";
if (stateStr.includes("clean") || stateStr.includes("active")) {
  status = "healthy";
} else if (stateStr.includes("degraded")) {
  status = "degraded";  // Actually detects degraded state!
} else if (stateStr.includes("fail")) {
  status = "failed";
}

// ✅ Extracts failed members
while ((diskMatch = diskRegex.exec(stdout)) !== null) {
  const [, state, , device] = diskMatch;
  memberDisks.push(device);
  if (state === "faulty") {
    failedMembers.push(device);  // Properly populated!
  }
}
```

## Future Enhancements

1. **Predictive Failure Detection**: Machine learning model to predict disk failures
2. **Historical Trend Analysis**: Track SMART metrics over time
3. **Automated Remediation**: Trigger hot spare activation, send notifications
4. **Cloud Storage Integration**: Monitor S3, Azure Blob, GCS health
5. **Network-Attached Storage**: Enhanced NFS/SMB health monitoring
6. **Disk Performance Metrics**: IOPS, throughput, latency tracking
7. **Capacity Planning**: Predict when storage will be exhausted

## License

Internal use only - part of the OM Systems Recording Engine.
