# Storage Health Agent - Quick Reference

## Risk Levels

| Level | Icon | Meaning | Action |
|-------|------|---------|--------|
| **NONE** | 🟢 | Healthy | Normal monitoring |
| **LOW** | 🟡 | Minor wear | Monitor more frequently |
| **MEDIUM** | 🟠 | Notable wear | Plan replacement in 90 days |
| **HIGH** | 🔴 | Significant issues | Replace within 30 days |
| **CRITICAL** | 🚨 | Imminent failure | **REPLACE IMMEDIATELY** |

## Disk Risk Triggers

### Critical (🚨 Replace Immediately)
- SMART status: FAILED
- Uncorrectable sectors > 0
- Reallocated sectors > 100
- SSD life < 5%

### High (🔴 Replace Within 30 Days)
- Reallocated sectors > 10
- Pending sectors > 5
- SSD life < 10%
- Temperature > 60°C

### Medium (🟠 Plan Replacement)
- Reallocated sectors > 0
- Pending sectors > 0
- Interface CRC errors > 100
- SSD life < 20%
- Temperature > 55°C

### Low (🟡 Monitor)
- Power-on hours > 50,000 (~5.7 years)
- Temperature > 50°C

## RAID Risk Triggers

### Critical (🚨 Immediate Action)
- RAID status: FAILED
- RAID degraded with 2+ failed disks

### High (🔴 Replace Failed Disks)
- RAID degraded (1 failed disk)

### Medium (🟠 Monitor Rebuild)
- RAID rebuilding

### Low (🟡 Check Status)
- RAID status: UNKNOWN

## Common SMART Attributes

| ID | Name | Critical Value | What It Means |
|----|------|----------------|---------------|
| 5 | Reallocated_Sector_Ct | >0 | Disk has relocated bad sectors |
| 9 | Power_On_Hours | - | Total hours disk has been powered |
| 194 | Temperature_Celsius | >55°C | Current disk temperature |
| 197 | Current_Pending_Sector | >0 | Sectors waiting to be remapped |
| 198 | Offline_Uncorrectable | >0 | **Critical** - Can't read/write |
| 199 | UDMA_CRC_Error_Count | >100 | Cable or interface issues |
| 231 | SSD_Life_Left | <10% | SSD wear level critical |

## RAID Status Meanings

### mdadm (Linux Software RAID)
- **clean**: Healthy and synchronized
- **active**: Healthy and in use
- **degraded**: One or more disks failed
- **recovering**: Rebuilding after disk replacement
- **resyncing**: Verifying data consistency

### ZFS
- **ONLINE**: Healthy
- **DEGRADED**: One or more disks failed
- **FAULTED**: Critical failure
- **UNAVAIL**: Pool unavailable
- **resilver**: Rebuilding (ZFS term for rebuild)

## Quick Commands

### Check Storage Health
```bash
# Full health report
node dist/examples/storage-health-demo.js

# Just the summary
curl http://localhost:3000/api/storage/health | jq '.overallRiskLevel'
```

### Check Specific Disk
```bash
# SMART status
sudo smartctl -H /dev/sda

# SMART attributes
sudo smartctl -A /dev/sda

# Temperature only
sudo smartctl -A /dev/sda | grep Temperature
```

### Check RAID Status
```bash
# mdadm (Linux software RAID)
cat /proc/mdstat
sudo mdadm --detail /dev/md0

# ZFS
sudo zpool status
sudo zpool list

# LVM
sudo lvs
sudo vgs
```

### Emergency Procedures

#### Disk Showing Critical Risk
```bash
# 1. Verify with direct SMART check
sudo smartctl -H /dev/sda
sudo smartctl -A /dev/sda

# 2. Check if disk is in RAID
cat /proc/mdstat

# 3. If in RAID, prepare replacement
#    Order new disk matching specs

# 4. Once replacement arrives:
#    a. Mark disk as failed (if not auto-detected)
sudo mdadm --fail /dev/md0 /dev/sda

#    b. Remove from array
sudo mdadm --remove /dev/md0 /dev/sda

#    c. Power down, physically replace disk

#    d. Add new disk to array
sudo mdadm --add /dev/md0 /dev/sda

#    e. Monitor rebuild
watch cat /proc/mdstat
```

#### RAID Degraded
```bash
# 1. Check which disk failed
cat /proc/mdstat
sudo mdadm --detail /dev/md0

# 2. Check if hot spare activated
#    (should show spare rebuilding)

# 3. If no hot spare, follow disk replacement above

# 4. Monitor rebuild progress
watch -n 1 cat /proc/mdstat

# 5. Check sync speed (if slow)
cat /proc/sys/dev/raid/speed_limit_min
cat /proc/sys/dev/raid/speed_limit_max

# 6. Increase rebuild speed if needed (careful - impacts performance)
echo 100000 | sudo tee /proc/sys/dev/raid/speed_limit_min
```

#### High Temperature
```bash
# 1. Check all disk temperatures
for disk in /dev/sd?; do
  echo -n "$disk: "
  sudo smartctl -A $disk | grep Temperature | awk '{print $10}°C'
done

# 2. Check system fans
sensors  # requires lm-sensors package

# 3. Actions:
#    - Verify server room cooling
#    - Check for dust/blocked vents
#    - Verify fan operation
#    - Consider adding fans or improving airflow
```

## Monitoring Integration

### Prometheus Metrics
```
storage_risk_level                           # Overall risk (0-4)
storage_disks_total                          # Total disks
storage_disk_temperature_celsius{device}     # Per-disk temp
storage_disk_bad_sectors{device}             # Per-disk bad sectors
storage_raid_status{array,status}            # Per-RAID status
```

### Alert Thresholds (Recommended)
```yaml
- storage_risk_level >= 4: CRITICAL (page on-call)
- storage_risk_level >= 3: WARNING (ticket)
- storage_disk_temperature_celsius > 60: CRITICAL
- storage_disk_temperature_celsius > 55: WARNING
- storage_disk_bad_sectors > 10: CRITICAL
- storage_disk_bad_sectors > 0: WARNING
- storage_raid_status{status="degraded"}: CRITICAL
- storage_raid_status{status="rebuilding"}: INFO
```

## API Endpoints

### Get Health Report
```
GET /api/storage/health
```

Response:
```json
{
  "timestamp": "2026-08-08T10:30:00Z",
  "overallRiskLevel": "low",
  "physicalDisks": [...],
  "raidArrays": [...],
  "warnings": [...],
  "errors": [...],
  "recommendations": [...]
}
```

### Get Health Summary
```
GET /api/storage/health/summary
```

Response:
```json
{
  "overallRiskLevel": "low",
  "totalDisks": 4,
  "healthyDisks": 4,
  "warningDisks": 0,
  "criticalDisks": 0,
  "totalRaids": 1,
  "healthyRaids": 1,
  "degradedRaids": 0
}
```

### Force Health Check
```
POST /api/storage/health/check
```

## Interpretation Guide

### Good Report Example
```
Overall Risk Level: NONE
Physical Disks: 4/4 healthy
RAID Arrays: 1/1 healthy
Warnings: 0
Errors: 0
```
**Action:** Continue normal monitoring

### Warning Report Example
```
Overall Risk Level: MEDIUM
Physical Disks: 3/4 healthy, 1 warning
RAID Arrays: 1/1 healthy
Warnings:
  - Disk /dev/sdb: Moderate wear detected
  - Disk /dev/sdb: 5 bad sectors
Recommendations:
  - Plan replacement for /dev/sdb within 90 days
```
**Action:** Order replacement disk, monitor closely

### Critical Report Example
```
Overall Risk Level: CRITICAL
Physical Disks: 2/4 healthy, 1 warning, 1 critical
RAID Arrays: 0/1 healthy, 1 degraded
Errors:
  - Disk /dev/sdc: CRITICAL - Replace immediately!
  - RAID /dev/md0: DEGRADED - 1 disk failed
Warnings:
  - RAID /dev/md0: Running on minimum disks
Recommendations:
  - Replace /dev/sdc immediately to prevent data loss
  - Replace failed disks in /dev/md0: /dev/sdc
```
**Action:** IMMEDIATE - Replace failed disk ASAP

## Support

### Log Files
```bash
# Storage health logs
tail -f /var/log/recording-engine/storage-health.log

# System logs
journalctl -u recording-engine -f

# Disk errors
dmesg | grep -i "disk\|ata\|scsi\|nvme"
```

### Common Issues

**"No physical disks detected"**
- Check if `lsblk` is installed
- Run as root/sudo
- Verify disks are connected: `ls -la /dev/sd* /dev/nvme*`

**"SMART data unavailable"**
- Install smartmontools: `sudo apt install smartmontools`
- Enable SMART: `sudo smartctl -s on /dev/sda`
- Check if disk supports SMART: `sudo smartctl -i /dev/sda`

**"RAID not detected"**
- Install mdadm: `sudo apt install mdadm`
- Check if RAID exists: `cat /proc/mdstat`
- For hardware RAID, install vendor tools (megacli, hpssacli, perccli)

### Contact
- Emergency storage issues: page on-call engineer
- Questions: infrastructure-team@example.com
- Documentation: https://docs.internal/storage-health

## Version
Document Version: 1.0  
Last Updated: 2026-08-08  
Storage Health Agent: v1.0.0
