# Enterprise Infrastructure Monitoring - SNMP Collection Framework

## Overview

The SNMP Collection Framework provides the foundation for monitoring enterprise network devices, power systems, and infrastructure components across all branch locations in Sentinel Grid.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│           SNMP Collection Framework                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ SNMP v2c     │  │ SNMP v3      │  │ Vendor SDKs  │ │
│  │ Collector    │  │ Collector    │  │ (SSH/API)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Device-Specific Collectors                 │ │
│  ├────────────────────────────────────────────────────┤ │
│  │ Switches │ Firewalls │ UPS │ Generators │ Routers │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              Metric Processors                      │ │
│  ├────────────────────────────────────────────────────┤ │
│  │  Health Score  │  Topology  │  Alerting  │ Trends │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌──────────────────────┐
              │  PostgreSQL Database  │
              │  (Infrastructure DB)  │
              └──────────────────────┘
```

## Supported Protocols

### 1. SNMP v2c
- **Use Case**: Legacy devices, simple monitoring
- **Security**: Community string-based (less secure)
- **Performance**: Fast, low overhead
- **Typical Devices**: Older switches, basic UPS units

### 2. SNMP v3
- **Use Case**: Modern devices, secure environments
- **Security**: User-based authentication, encryption support
- **Auth Protocols**: MD5, SHA, SHA224, SHA256, SHA384, SHA512
- **Privacy Protocols**: DES, AES, AES128, AES192, AES256
- **Security Levels**:
  - `noAuthNoPriv`: No authentication, no encryption
  - `authNoPriv`: Authentication only
  - `authPriv`: Authentication + encryption (recommended)

### 3. Vendor-Specific APIs
- **Cisco**: REST API, NETCONF
- **HP/Aruba**: REST API
- **Fortinet**: FortiGate API
- **Palo Alto**: PAN-OS API

## Standard MIB-II OIDs

The framework supports standard MIB-II OIDs that work across most vendors:

### System Information
```
sysDescr          1.3.6.1.2.1.1.1.0      System description
sysUpTime         1.3.6.1.2.1.1.3.0      System uptime (timeticks)
sysName           1.3.6.1.2.1.1.5.0      System hostname
sysLocation       1.3.6.1.2.1.1.6.0      Physical location
```

### Interface Statistics
```
ifNumber          1.3.6.1.2.1.2.1.0      Number of interfaces
ifDescr           1.3.6.1.2.1.2.2.1.2    Interface description
ifOperStatus      1.3.6.1.2.1.2.2.1.8    Operational status (up/down)
ifInOctets        1.3.6.1.2.1.2.2.1.10   Bytes received
ifOutOctets       1.3.6.1.2.1.2.2.1.16   Bytes transmitted
ifInErrors        1.3.6.1.2.1.2.2.1.14   Input errors
ifOutErrors       1.3.6.1.2.1.2.2.1.20   Output errors
```

### CPU & Memory (HOST-RESOURCES-MIB)
```
hrProcessorLoad   1.3.6.1.2.1.25.3.3.1.2  CPU load percentage
hrStorageSize     1.3.6.1.2.1.25.2.3.1.5  Total memory/storage
hrStorageUsed     1.3.6.1.2.1.25.2.3.1.6  Used memory/storage
```

## Vendor-Specific OIDs

### Cisco
```typescript
cpuUsage          1.3.6.1.4.1.9.9.109.1.1.1.1.5      5-minute CPU avg
memoryPoolUsed    1.3.6.1.4.1.9.9.48.1.1.1.5         Memory used
temperature       1.3.6.1.4.1.9.9.13.1.3.1.3         Temperature
fanStatus         1.3.6.1.4.1.9.9.13.1.4.1.3         Fan status
powerSupplyStatus 1.3.6.1.4.1.9.9.13.1.5.1.3         PSU status
```

### APC UPS (PowerNet-MIB)
```typescript
upsBasicBatteryStatus       1.3.6.1.4.1.318.1.1.1.2.1.1.0    Battery status
upsAdvBatteryCapacity       1.3.6.1.4.1.318.1.1.1.2.2.1.0    Battery %
upsAdvBatteryRunTimeRemaining 1.3.6.1.4.1.318.1.1.1.2.2.3.0  Runtime minutes
upsAdvInputVoltage          1.3.6.1.4.1.318.1.1.1.3.2.1.0    Input voltage
upsAdvOutputVoltage         1.3.6.1.4.1.318.1.1.1.4.2.1.0    Output voltage
upsAdvOutputLoad            1.3.6.1.4.1.318.1.1.1.4.2.3.0    Load %
```

## Usage Examples

### Basic SNMP Query
```typescript
import { SNMPCollectorService, STANDARD_OIDS } from './snmp-collector.service';

const snmpCollector = new SNMPCollectorService(pool);

const target = {
  host: '192.168.1.10',
  port: 161,
  credentials: {
    version: '2c',
    community: 'public'
  }
};

// Get system information
const sysInfo = await snmpCollector.getSystemInfo(target);
console.log('Device:', sysInfo.name);
console.log('Uptime:', sysInfo.uptime);
```

### SNMP v3 with Authentication
```typescript
const secureTarget = {
  host: '10.0.1.1',
  credentials: {
    version: '3',
    username: 'snmpuser',
    authProtocol: 'SHA256',
    authPassword: 'authPass123',
    privProtocol: 'AES256',
    privPassword: 'privPass123',
    securityLevel: 'authPriv'
  }
};

const results = await snmpCollector.snmpGet(secureTarget, [
  STANDARD_OIDS.sysUpTime,
  STANDARD_OIDS.sysName
]);
```

### Bulk Collection for Interfaces
```typescript
// Walk interface table efficiently
const interfaces = await snmpCollector.getInterfaceStats(target);

interfaces.forEach(iface => {
  console.log(`Port ${iface.index}: ${iface.description}`);
  console.log(`  Status: ${iface.operStatus}`);
  console.log(`  Speed: ${iface.speed} Mbps`);
  console.log(`  RX: ${iface.rxBytes} bytes`);
  console.log(`  TX: ${iface.txBytes} bytes`);
});
```

## Collection Strategies

### 1. Polling Intervals

Different metrics require different collection frequencies:

| Metric Type | Interval | Reason |
|------------|----------|---------|
| Critical Status (UPS on battery, firewall sessions) | 30 seconds | Immediate action needed |
| Performance Metrics (CPU, memory, bandwidth) | 5 minutes | Real-time monitoring |
| Configuration & Inventory | 1 hour | Rarely changes |
| Historical Trends | 15 minutes | Balance between granularity and storage |

### 2. SNMP Operations

**GET**: Retrieve specific OID values
```typescript
// Get single values
const result = await snmpCollector.snmpGet(target, ['1.3.6.1.2.1.1.3.0']);
```

**WALK**: Traverse an OID tree
```typescript
// Get all interfaces
const interfaces = await snmpCollector.snmpWalk(target, '1.3.6.1.2.1.2.2.1.2');
```

**BULK GET**: Efficient retrieval of multiple rows
```typescript
// Get 10 rows of interface data
const bulk = await snmpCollector.snmpBulkGet(target, 0, 10, ['1.3.6.1.2.1.2.2.1']);
```

### 3. Error Handling

```typescript
try {
  const result = await snmpCollector.snmpGet(target, oids);
} catch (error) {
  if (error.message.includes('Timeout')) {
    // Device unreachable - mark offline
    await markDeviceOffline(deviceId);
  } else if (error.message.includes('Authentication')) {
    // Credential issue - alert admin
    await createAlert('SNMP authentication failed', deviceId);
  } else {
    // General error - log and retry
    console.error('SNMP error:', error);
  }
}
```

## Integration with Services

### Switch Monitoring Service
```typescript
export class SwitchMonitoringService {
  async collectSwitchMetrics(switchId: string) {
    const switchConfig = await this.getSwitchConfig(switchId);
    const target = this.buildSNMPTarget(switchConfig);
    
    // Collect health metrics
    const cpuOid = this.selectCPUOid(switchConfig.manufacturer);
    const memOid = this.selectMemoryOid(switchConfig.manufacturer);
    
    const results = await this.snmp.snmpGet(target, [cpuOid, memOid]);
    
    // Store in database
    await this.storeSwitchMetrics({
      switchId,
      cpuUsage: results[0].value,
      memoryUsage: results[1].value,
      observedAt: new Date()
    });
  }
}
```

### UPS Monitoring Service
```typescript
export class UPSMonitoringService {
  async collectUPSMetrics(upsId: string) {
    const upsConfig = await this.getUPSConfig(upsId);
    const target = this.buildSNMPTarget(upsConfig);
    
    // Use vendor-specific OIDs for APC
    const oids = [
      VENDOR_OIDS.apc.upsAdvBatteryCapacity,
      VENDOR_OIDS.apc.upsAdvBatteryRunTimeRemaining,
      VENDOR_OIDS.apc.upsAdvOutputLoad,
      VENDOR_OIDS.apc.upsAdvInputVoltage,
      VENDOR_OIDS.apc.upsAdvOutputVoltage
    ];
    
    const results = await this.snmp.snmpGet(target, oids);
    
    const metrics = {
      upsId,
      batteryHealthPercent: results[0].value,
      estimatedRuntimeMinutes: results[1].value,
      loadPercent: results[2].value,
      inputVoltage: results[3].value,
      outputVoltage: results[4].value,
      runningOnBattery: results[2].value > 0 && results[3].value < 100,
      observedAt: new Date()
    };
    
    await this.storeUPSMetrics(metrics);
    
    // Check for critical conditions
    if (metrics.runningOnBattery) {
      await this.createCriticalAlert(upsId, 'UPS running on battery');
    }
  }
}
```

## Performance Optimization

### 1. Connection Pooling
Reuse SNMP sessions to avoid overhead:
```typescript
private sessionCache = new Map<string, SNMPSession>();

getSession(host: string, credentials: SNMPCredentials): SNMPSession {
  const key = `${host}:${JSON.stringify(credentials)}`;
  if (!this.sessionCache.has(key)) {
    const session = snmp.createSession(host, credentials);
    this.sessionCache.set(key, session);
  }
  return this.sessionCache.get(key)!;
}
```

### 2. Batch Processing
Group devices by branch for efficient collection:
```typescript
async collectBranchInfrastructure(branchId: string) {
  const devices = await this.getAllDevices(branchId);
  
  const promises = devices.map(device => 
    this.collectDeviceMetrics(device).catch(err => {
      console.error(`Failed to collect ${device.id}:`, err);
    })
  );
  
  await Promise.allSettled(promises);
}
```

### 3. Caching
Cache infrequently changing data:
```typescript
@Cache({ ttl: 3600 }) // Cache for 1 hour
async getDeviceInventory(deviceId: string) {
  // System description, model, serial rarely change
  return await this.snmp.snmpGet(target, [
    STANDARD_OIDS.sysDescr,
    STANDARD_OIDS.sysObjectID
  ]);
}
```

## Security Best Practices

### 1. Credential Management
- Store SNMP credentials encrypted in database
- Use separate credentials per branch/device type
- Rotate community strings regularly
- Use SNMPv3 with authPriv for sensitive environments

### 2. Network Segmentation
- Place monitored devices in management VLAN
- Restrict SNMP access to monitoring server IPs only
- Use firewall rules to limit SNMP port (161/UDP) access

### 3. Read-Only Access
- Always use read-only SNMP communities
- Never grant SNMP write access for monitoring
- Separate credentials for configuration management

## Troubleshooting

### Device Not Responding
```bash
# Test SNMP connectivity
snmpget -v2c -c public 192.168.1.10 1.3.6.1.2.1.1.5.0

# Test SNMPv3
snmpget -v3 -l authPriv -u snmpuser -a SHA -A authPass -x AES -X privPass \
  192.168.1.10 1.3.6.1.2.1.1.5.0
```

### OID Not Supported
- Check device MIB support
- Try vendor-specific OIDs
- Fall back to standard MIB-II OIDs
- Use SNMP walk to discover available OIDs

### Timeout Issues
- Increase timeout value (default 5 seconds)
- Check network latency
- Verify device SNMP service is enabled
- Check firewall rules

## Production Deployment

### Dependencies
```bash
npm install net-snmp --save
npm install @types/net-snmp --save-dev
```

### Environment Variables
```env
SNMP_DEFAULT_COMMUNITY=public
SNMP_DEFAULT_TIMEOUT=5000
SNMP_DEFAULT_RETRIES=3
SNMP_MAX_CONCURRENT_SESSIONS=50
SNMP_COLLECTION_INTERVAL_SECONDS=300
```

### Monitoring Scheduler
```typescript
import cron from 'node-cron';

// Collect critical metrics every minute
cron.schedule('* * * * *', async () => {
  await infrastructureMonitor.collectCriticalMetrics();
});

// Collect performance metrics every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await infrastructureMonitor.collectPerformanceMetrics();
});

// Collect inventory data hourly
cron.schedule('0 * * * *', async () => {
  await infrastructureMonitor.collectInventoryData();
});
```

## Next Steps

1. **Implement Device-Specific Collectors**: Switch, Firewall, UPS, Generator services
2. **Health Scoring Engine**: Calculate unified health scores from collected metrics
3. **Alerting Integration**: Feed metrics into alert command center
4. **Topology Discovery**: Use LLDP/CDP for automatic network mapping
5. **Dashboard Integration**: Visualize infrastructure health in executive dashboard
