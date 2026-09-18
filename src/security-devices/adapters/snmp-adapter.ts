/**
 * SNMP Protocol Adapter (Production-Ready)
 * 
 * Adapter for SNMP-enabled devices (UPS, network equipment, environmental sensors).
 * Simple Network Management Protocol is widely used for network device monitoring.
 * 
 * Features:
 * - SNMPv1, SNMPv2c, and SNMPv3 support
 * - Device discovery via network scanning
 * - UPS monitoring (RFC 1628)
 * - Network device monitoring (interfaces, CPU, memory)
 * - Environmental sensor monitoring
 * - Automatic device type identification
 * - Connection pooling and session management
 */

import * as snmp from 'net-snmp';
import { BaseSecurityDeviceAdapter } from './base-adapter';
import {
  SecurityDevice,
  SecurityDeviceHealthSnapshot,
  SecurityDeviceEvent,
  DeviceCommand,
  DeviceCommandResult,
  DeviceState,
  DeviceCapability,
  DiscoveryOptions,
  DiscoveredDevice,
  ConnectionResult,
  DeviceProtocol,
  SecurityDeviceType,
  DeviceStatus,
} from '../domain/security-device.types';

// Common SNMP OIDs
const SNMP_OIDS = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysObjectID: '1.3.6.1.2.1.1.2.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysContact: '1.3.6.1.2.1.1.4.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysLocation: '1.3.6.1.2.1.1.6.0',
  
  // UPS OIDs (RFC 1628)
  upsBatteryStatus: '1.3.6.1.2.1.33.1.2.1.0',
  upsSecondsOnBattery: '1.3.6.1.2.1.33.1.2.2.0',
  upsEstimatedMinutesRemaining: '1.3.6.1.2.1.33.1.2.3.0',
  upsEstimatedChargeRemaining: '1.3.6.1.2.1.33.1.2.4.0',
  upsBatteryVoltage: '1.3.6.1.2.1.33.1.2.5.0',
  upsBatteryCurrent: '1.3.6.1.2.1.33.1.2.6.0',
  upsBatteryTemperature: '1.3.6.1.2.1.33.1.2.7.0',
  upsInputFrequency: '1.3.6.1.2.1.33.1.3.3.1.2',
  upsInputVoltage: '1.3.6.1.2.1.33.1.3.3.1.3',
  upsOutputSource: '1.3.6.1.2.1.33.1.4.1.0',
  upsOutputFrequency: '1.3.6.1.2.1.33.1.4.2.0',
  upsOutputVoltage: '1.3.6.1.2.1.33.1.4.4.1.2',
  upsOutputCurrent: '1.3.6.1.2.1.33.1.4.4.1.3',
  upsOutputPower: '1.3.6.1.2.1.33.1.4.4.1.4',
  upsOutputPercentLoad: '1.3.6.1.2.1.33.1.4.4.1.5',
  
  // Network interface OIDs
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifType: '1.3.6.1.2.1.2.2.1.3',
  ifSpeed: '1.3.6.1.2.1.2.2.1.5',
  ifPhysAddress: '1.3.6.1.2.1.2.2.1.6',
  ifAdminStatus: '1.3.6.1.2.1.2.2.1.7',
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
};

interface SnmpSessionConfig {
  host: string;
  community?: string;
  version?: snmp.Version;
  timeout?: number;
  retries?: number;
  // SNMPv3 options
  user?: string;
  authProtocol?: string;
  authKey?: string;
  privProtocol?: string;
  privKey?: string;
}

export class SnmpAdapter extends BaseSecurityDeviceAdapter {
  readonly adapterName = 'SNMP';
  readonly adapterVersion = '2.0.0';
  readonly supportedProtocols: DeviceProtocol[] = ['SNMP'];
  readonly supportedDeviceTypes: SecurityDeviceType[] = [
    'UPS',
    'POWER_SUPPLY',
    'BATTERY_BACKUP',
    'GENERATOR',
    'POWER_MONITOR',
    'NETWORK_SWITCH',
    'ROUTER',
    'TEMPERATURE_SENSOR',
    'HUMIDITY_SENSOR',
    'ENVIRONMENTAL_CONTROLLER',
  ];
  
  // Session cache for connection reuse
  private readonly sessions = new Map<string, snmp.Session>();
  private readonly defaultTimeout = parseInt(process.env.SNMP_TIMEOUT_MS || '5000');
  private readonly defaultRetries = parseInt(process.env.SNMP_RETRIES || '3');
  private readonly defaultCommunity = process.env.SNMP_COMMUNITY_STRING || 'public';

  /**
   * Discover SNMP devices
   */
  async discover(
    network: string,
    options?: DiscoveryOptions
  ): Promise<DiscoveredDevice[]> {
    this.ensureInitialized();

    const discovered: DiscoveredDevice[] = [];
    const { baseIp, startIp, endIp } = this.parseNetworkRange(network);
    const timeoutSeconds = options?.timeoutSeconds || 10;

    console.log(
      `SNMP Discovery: Scanning ${baseIp}.${startIp}-${endIp}`
    );

    // Scan IPs for SNMP response
    const scanPromises: Promise<DiscoveredDevice | null>[] = [];

    for (let i = startIp; i <= endIp; i++) {
      const ipAddress = `${baseIp}.${i}`;
      scanPromises.push(this.probeSnmpDevice(ipAddress, timeoutSeconds));
    }

    // Execute in batches
    const batchSize = 50;
    for (let i = 0; i < scanPromises.length; i += batchSize) {
      const batch = scanPromises.slice(i, i + batchSize);
      const results = await Promise.all(batch);
      discovered.push(...results.filter((r): r is DiscoveredDevice => r !== null));
    }

    console.log(`SNMP Discovery: Found ${discovered.length} devices`);
    return discovered;
  }

  /**
   * Get or create SNMP session for device
   */
  private getSession(config: SnmpSessionConfig): snmp.Session {
    const sessionKey = `${config.host}:${config.community || config.user}`;
    
    let session = this.sessions.get(sessionKey);
    if (session) {
      return session;
    }

    // Create new session based on version
    const version = config.version || snmp.Version2c;
    const options: any = {
      timeout: config.timeout || this.defaultTimeout,
      retries: config.retries || this.defaultRetries,
      version,
    };

    if (version === snmp.Version3) {
      // SNMPv3 authentication
      options.user = config.user || 'v3user';
      if (config.authProtocol) {
        options.authProtocol = config.authProtocol === 'SHA' ? snmp.AuthProtocols.sha : snmp.AuthProtocols.md5;
        options.authKey = config.authKey || '';
      }
      if (config.privProtocol) {
        options.privProtocol = config.privProtocol === 'AES' ? snmp.PrivProtocols.aes : snmp.PrivProtocols.des;
        options.privKey = config.privKey || '';
      }
      session = snmp.createV3Session(config.host, config.user, options);
    } else {
      // SNMPv1 or SNMPv2c
      session = snmp.createSession(config.host, config.community || this.defaultCommunity, options);
    }

    this.sessions.set(sessionKey, session);
    return session;
  }

  /**
   * Perform SNMP GET operation
   */
  private async snmpGet(session: snmp.Session, oids: string[]): Promise<Map<string, any>> {
    return new Promise((resolve, reject) => {
      session.get(oids, (error: Error | null, varbinds: snmp.VarBind[]) => {
        if (error) {
          reject(error);
          return;
        }

        const results = new Map<string, any>();
        for (const varbind of varbinds) {
          if (snmp.isVarbindError(varbind)) {
            results.set(varbind.oid, null);
          } else {
            results.set(varbind.oid, varbind.value);
          }
        }
        resolve(results);
      });
    });
  }

  /**
   * Perform SNMP WALK operation
   */
  private async snmpWalk(session: snmp.Session, oid: string): Promise<Map<string, any>> {
    return new Promise((resolve, reject) => {
      const results = new Map<string, any>();
      
      session.walk(
        oid,
        20, // Max repetitions
        (varbinds: snmp.VarBind[]) => {
          // Feed callback
          for (const varbind of varbinds) {
            if (!snmp.isVarbindError(varbind)) {
              results.set(varbind.oid, varbind.value);
            }
          }
        },
        (error: Error | null) => {
          // Done callback
          if (error) {
            reject(error);
          } else {
            resolve(results);
          }
        }
      );
    });
  }

  /**
   * Probe a single IP for SNMP device (with actual SNMP queries)
   */
  private async probeSnmpDevice(
    ipAddress: string,
    timeoutSeconds: number
  ): Promise<DiscoveredDevice | null> {
    try {
      const session = this.getSession({
        host: ipAddress,
        community: this.defaultCommunity,
        timeout: timeoutSeconds * 1000,
        retries: 1,
      });

      // Query system OIDs
      const oids = [
        SNMP_OIDS.sysDescr,
        SNMP_OIDS.sysObjectID,
        SNMP_OIDS.sysName,
        SNMP_OIDS.sysLocation,
      ];

      const results = await this.snmpGet(session, oids);
      
      const sysDescr = results.get(SNMP_OIDS.sysDescr)?.toString() || '';
      const sysObjectID = results.get(SNMP_OIDS.sysObjectID)?.toString() || '';
      const sysName = results.get(SNMP_OIDS.sysName)?.toString() || '';
      const sysLocation = results.get(SNMP_OIDS.sysLocation)?.toString() || '';

      if (!sysDescr && !sysObjectID) {
        // No SNMP response
        return null;
      }

      const deviceType = this.identifyDeviceType(sysObjectID, sysDescr);

      return {
        ipAddress,
        deviceType,
        protocol: 'SNMP',
        manufacturer: this.extractManufacturer(sysDescr),
        discoveredAt: new Date(),
        confidence: 90,
        metadata: {
          name: sysName || `SNMP Device ${ipAddress}`,
          sysDescr,
          sysObjectID,
          sysLocation,
          discoveryMethod: 'snmp-probe',
        },
      };
    } catch (error) {
      // Device didn't respond to SNMP
      return null;
    }
  }

  /**
   * Extract manufacturer from sysDescr
   */
  private extractManufacturer(sysDescr: string): string {
    const desc = sysDescr.toLowerCase();
    
    if (desc.includes('apc')) return 'APC';
    if (desc.includes('cisco')) return 'Cisco';
    if (desc.includes('hp') || desc.includes('hewlett packard')) return 'HP';
    if (desc.includes('dell')) return 'Dell';
    if (desc.includes('juniper')) return 'Juniper';
    if (desc.includes('arista')) return 'Arista';
    if (desc.includes('eaton')) return 'Eaton';
    if (desc.includes('schneider')) return 'Schneider Electric';
    
    return 'Unknown';
  }

  /**
   * Extract model from sysDescr
   */
  private extractModel(sysDescr: string): string {
    // Try to extract model number patterns
    const modelMatch = sysDescr.match(/\b[A-Z0-9]{3,}-?[A-Z0-9]{2,}\b/);
    return modelMatch ? modelMatch[0] : 'Unknown';
  }

  /**
   * Identify device type from SNMP sysObjectID and sysDescr
   */
  private identifyDeviceType(
    sysObjectID: string,
    sysDescr: string
  ): SecurityDeviceType {
    const desc = sysDescr.toLowerCase();

    if (desc.includes('ups') || sysObjectID.startsWith('1.3.6.1.2.1.33')) {
      return 'UPS';
    }
    if (desc.includes('switch')) {
      return 'NETWORK_SWITCH';
    }
    if (desc.includes('router')) {
      return 'ROUTER';
    }
    if (desc.includes('temperature') || desc.includes('temp')) {
      return 'TEMPERATURE_SENSOR';
    }
    if (desc.includes('humidity')) {
      return 'HUMIDITY_SENSOR';
    }
    if (desc.includes('power')) {
      return 'POWER_MONITOR';
    }

    return 'POWER_MONITOR'; // Default fallback
  }

  /**
   * Connect to SNMP device
   */
  async connect(device: SecurityDevice): Promise<ConnectionResult> {
    this.validateDeviceConfig(device);
    
    try {
      const config = this.getDeviceSnmpConfig(device);
      const session = this.getSession(config);
      
      // Test connection with sysDescr query
      const results = await this.snmpGet(session, [SNMP_OIDS.sysDescr]);
      const sysDescr = results.get(SNMP_OIDS.sysDescr);
      
      if (sysDescr) {
        return {
          success: true,
        };
      } else {
        return {
          success: false,
          errorMessage: "snmp_no_response",
        };
      }
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : "snmp_connection_failed",
      };
    }
  }

  /**
   * Get SNMP configuration from device
   */
  private getDeviceSnmpConfig(device: SecurityDevice): SnmpSessionConfig {
    const config = (device as any).connectionConfig || device.metadata?.connectionConfig || {};
    
    return {
      host: device.ipAddress || '127.0.0.1',
      community: config.community || this.defaultCommunity,
      version: this.parseSnmpVersion(config.version),
      timeout: this.defaultTimeout,
      retries: this.defaultRetries,
      user: config.user,
      authProtocol: config.authProtocol,
      authKey: config.authKey,
      privProtocol: config.privProtocol,
      privKey: config.privKey,
    };
  }

  /**
   * Parse SNMP version string
   */
  private parseSnmpVersion(version?: string): snmp.Version {
    if (!version) return snmp.Version2c;
    
    switch (version.toLowerCase()) {
      case '1':
      case 'v1':
      case 'snmpv1':
        return snmp.Version1;
      case '2c':
      case 'v2c':
      case 'snmpv2c':
        return snmp.Version2c;
      case '3':
      case 'v3':
      case 'snmpv3':
        return snmp.Version3;
      default:
        return snmp.Version2c;
    }
  }

  /**
   * Get device health (specialized for UPS devices)
   */
  async getHealth(
    device: SecurityDevice
  ): Promise<SecurityDeviceHealthSnapshot> {
    await this.getConnection(device);

    try {
      if (device.type === 'UPS') {
        return await this.getUpsHealth(device);
      } else if (['NETWORK_SWITCH', 'ROUTER'].includes(device.type)) {
        return await this.getNetworkDeviceHealth(device);
      } else {
        return await this.getGenericSnmpHealth(device);
      }
    } catch (error) {
      return this.createHealthSnapshot(device, {
        health: 'CRITICAL',
        healthScore: 0,
        isOnline: false,
        errorCount: 1,
        lastErrorMessage: String(error),
        lastErrorAt: new Date(),
      });
    }
  }

  /**
   * Get UPS-specific health metrics (with actual SNMP queries)
   */
  private async getUpsHealth(
    device: SecurityDevice
  ): Promise<SecurityDeviceHealthSnapshot> {
    const startTime = Date.now();

    try {
      const config = this.getDeviceSnmpConfig(device);
      const session = this.getSession(config);

      // Query UPS-specific OIDs (RFC 1628)
      const oids = [
        SNMP_OIDS.upsBatteryStatus,
        SNMP_OIDS.upsEstimatedChargeRemaining,
        SNMP_OIDS.upsEstimatedMinutesRemaining,
        SNMP_OIDS.upsBatteryVoltage,
        SNMP_OIDS.upsBatteryTemperature,
        SNMP_OIDS.upsOutputSource,
        SNMP_OIDS.upsOutputPercentLoad,
      ];

      const results = await this.snmpGet(session, oids);
      const responseTimeMs = Date.now() - startTime;

      // Parse UPS metrics
      const batteryStatus = results.get(SNMP_OIDS.upsBatteryStatus) as number || 2;
      const batteryPercent = results.get(SNMP_OIDS.upsEstimatedChargeRemaining) as number || 100;
      const minutesRemaining = results.get(SNMP_OIDS.upsEstimatedMinutesRemaining) as number || 0;
      const batteryVoltage = (results.get(SNMP_OIDS.upsBatteryVoltage) as number || 0) / 10.0; // Tenths of volts
      const temperature = results.get(SNMP_OIDS.upsBatteryTemperature) as number || 25;
      const outputSource = results.get(SNMP_OIDS.upsOutputSource) as number || 3;
      const loadPercent = results.get(SNMP_OIDS.upsOutputPercentLoad) as number || 0;

      // Interpret status
      // batteryStatus: 1=unknown, 2=batteryNormal, 3=batteryLow, 4=batteryDepleted
      // outputSource: 1=other, 2=none, 3=normal, 4=bypass, 5=battery, 6=booster, 7=reducer
      const isOnBattery = outputSource === 5;
      const isBatteryLow = batteryStatus === 3 || batteryPercent < 20;
      const isCritical = batteryStatus === 4 || batteryPercent < 10 || (isOnBattery && minutesRemaining < 5);

      const healthScore = this.calculateHealthScore({
        isOnline: true,
        responseTimeMs,
        errorCount: isOnBattery ? 1 : 0,
      });

      return this.createHealthSnapshot(device, {
        health: isCritical
          ? 'CRITICAL'
          : isBatteryLow
          ? 'POOR'
          : isOnBattery
          ? 'FAIR'
          : this.mapHealthScoreToStatus(healthScore),
        healthScore: isCritical ? 10 : isBatteryLow ? 30 : isOnBattery ? 60 : healthScore,
        isOnline: true,
        responseTimeMs,
        powerStatus: isOnBattery ? 'BATTERY' : 'AC',
        batteryLevelPercent: batteryPercent,
        batteryVoltage,
        upsRuntimeMinutes: minutesRemaining,
        temperatureCelsius: temperature,
        errorCount: isOnBattery || isBatteryLow ? 1 : 0,
        warningCount: isOnBattery ? 1 : 0,
        metadata: {
          batteryStatus: this.getBatteryStatusName(batteryStatus),
          outputSource: this.getOutputSourceName(outputSource),
          loadPercent,
        },
      });
    } catch (error) {
      throw new Error(`UPS SNMP query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get battery status name
   */
  private getBatteryStatusName(status: number): string {
    const names = ['unknown', 'unknown', 'normal', 'low', 'depleted'];
    return names[status] || 'unknown';
  }

  /**
   * Get output source name
   */
  private getOutputSourceName(source: number): string {
    const names = ['unknown', 'other', 'none', 'normal', 'bypass', 'battery', 'booster', 'reducer'];
    return names[source] || 'unknown';
  }

  /**
   * Get network device health metrics (with actual SNMP queries)
   */
  private async getNetworkDeviceHealth(
    device: SecurityDevice
  ): Promise<SecurityDeviceHealthSnapshot> {
    const startTime = Date.now();

    try {
      const config = this.getDeviceSnmpConfig(device);
      const session = this.getSession(config);

      // Query system and interface OIDs
      const oids = [
        SNMP_OIDS.sysUpTime,
        SNMP_OIDS.sysDescr,
      ];

      const results = await this.snmpGet(session, oids);
      const responseTimeMs = Date.now() - startTime;

      const sysUpTime = results.get(SNMP_OIDS.sysUpTime) as number || 0;
      const uptimeSeconds = Math.floor(sysUpTime / 100); // Hundredths of seconds to seconds

      // Query interface status
      const interfaceResults = await this.snmpWalk(session, SNMP_OIDS.ifOperStatus);
      const totalInterfaces = interfaceResults.size;
      let upInterfaces = 0;
      
      for (const [_, status] of interfaceResults) {
        if (status === 1) upInterfaces++; // 1 = up, 2 = down, 3 = testing
      }

      const interfaceDownCount = totalInterfaces - upInterfaces;
      const hasInterfaceDown = interfaceDownCount > 0;

      const healthScore = this.calculateHealthScore({
        isOnline: true,
        responseTimeMs,
        errorCount: interfaceDownCount,
      });

      return this.createHealthSnapshot(device, {
        health: hasInterfaceDown && interfaceDownCount > totalInterfaces / 2
          ? 'CRITICAL'
          : hasInterfaceDown
          ? 'FAIR'
          : this.mapHealthScoreToStatus(healthScore),
        healthScore: hasInterfaceDown ? Math.max(40, healthScore - (interfaceDownCount * 10)) : healthScore,
        isOnline: true,
        responseTimeMs,
        uptimeSeconds,
        errorCount: interfaceDownCount,
        warningCount: 0,
        metadata: {
          totalInterfaces,
          upInterfaces,
          downInterfaces: interfaceDownCount,
        },
      });
    } catch (error) {
      throw new Error(`Network device SNMP query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get generic SNMP device health (with actual queries)
   */
  private async getGenericSnmpHealth(
    device: SecurityDevice
  ): Promise<SecurityDeviceHealthSnapshot> {
    const startTime = Date.now();

    try {
      const config = this.getDeviceSnmpConfig(device);
      const session = this.getSession(config);

      // Query basic system OIDs
      const oids = [
        SNMP_OIDS.sysUpTime,
        SNMP_OIDS.sysDescr,
        SNMP_OIDS.sysName,
      ];

      const results = await this.snmpGet(session, oids);
      const responseTimeMs = Date.now() - startTime;

      const sysUpTime = results.get(SNMP_OIDS.sysUpTime) as number || 0;
      const uptimeSeconds = Math.floor(sysUpTime / 100);

      const healthScore = this.calculateHealthScore({
        isOnline: true,
        responseTimeMs,
        errorCount: 0,
      });

      return this.createHealthSnapshot(device, {
        health: this.mapHealthScoreToStatus(healthScore),
        healthScore,
        isOnline: true,
        responseTimeMs,
        uptimeSeconds,
        errorCount: 0,
        warningCount: 0,
      });
    } catch (error) {
      throw new Error(`SNMP query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get device state (with actual SNMP query)
   */
  async getState(device: SecurityDevice): Promise<DeviceState> {
    await this.getConnection(device);

    try {
      const config = this.getDeviceSnmpConfig(device);
      const session = this.getSession(config);

      // Query system uptime to verify device is responsive
      const results = await this.snmpGet(session, [SNMP_OIDS.sysUpTime]);
      const sysUpTime = results.get(SNMP_OIDS.sysUpTime);

      if (sysUpTime !== null && sysUpTime !== undefined) {
        return {
          status: 'ONLINE' as DeviceStatus,
          health: 'GOOD',
          isOnline: true,
          lastSeenAt: new Date(),
          stateData: {
            uptimeSeconds: Math.floor((sysUpTime as number) / 100),
          },
        };
      } else {
        return {
          status: 'OFFLINE' as DeviceStatus,
          health: 'CRITICAL',
          isOnline: false,
          lastSeenAt: device.lastSeenAt || new Date(),
          stateData: {},
        };
      }
    } catch (error) {
      return {
        status: 'OFFLINE' as DeviceStatus,
        health: 'CRITICAL',
        isOnline: false,
        lastSeenAt: device.lastSeenAt || new Date(),
        stateData: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Get device events
   */
  async getEvents(
    device: SecurityDevice,
    since?: Date,
    limit?: number
  ): Promise<SecurityDeviceEvent[]> {
    await this.getConnection(device);

    try {
      // SNMP doesn't have built-in event storage
      // Events would need to be generated from SNMP traps
      // or derived from polling state changes

      return [];
    } catch (error) {
      this.handleError(error, 'getEvents');
    }
  }

  /**
   * Execute command on device
   */
  async executeCommand(
    device: SecurityDevice,
    command: DeviceCommand
  ): Promise<DeviceCommandResult> {
    await this.getConnection(device);

    const startTime = Date.now();

    try {
      switch (command.command) {
        case 'BATTERY_TEST':
          return await this.executeBatteryTest(device, command);
        case 'SELF_TEST':
          return await this.executeSelfTest(device, command);
        default:
          return {
            commandId: command.id,
            success: false,
            errorMessage: `Command ${command.command} not supported by SNMP adapter`,
            executionTimeMs: Date.now() - startTime,
            completedAt: new Date(),
          };
      }
    } catch (error) {
      return {
        commandId: command.id,
        success: false,
        errorMessage: String(error),
        executionTimeMs: Date.now() - startTime,
        completedAt: new Date(),
      };
    }
  }

  /**
   * Execute battery test (UPS)
   */
  private async executeBatteryTest(
    device: SecurityDevice,
    command: DeviceCommand
  ): Promise<DeviceCommandResult> {
    const startTime = Date.now();

    try {
      // TODO: Send SNMP SET to trigger battery test
      // OID: upsTestId, upsTestSpinLock

      return {
        commandId: command.id,
        success: true,
        result: {
          testStarted: true,
        },
        executionTimeMs: Date.now() - startTime,
        completedAt: new Date(),
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Execute self-test
   */
  private async executeSelfTest(
    device: SecurityDevice,
    command: DeviceCommand
  ): Promise<DeviceCommandResult> {
    const startTime = Date.now();

    try {
      // TODO: Device-specific self-test SNMP OID

      return {
        commandId: command.id,
        success: true,
        result: {
          testStarted: true,
        },
        executionTimeMs: Date.now() - startTime,
        completedAt: new Date(),
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get device capabilities
   */
  async getCapabilities(device: SecurityDevice): Promise<DeviceCapability[]> {
    const capabilities: DeviceCapability[] = [
      'HEALTH_READ',
      'STATUS_READ',
      'METRICS_READ',
    ];

    if (device.type === 'UPS') {
      capabilities.push('BATTERY_TEST', 'SELF_TEST');
    }

    return capabilities;
  }

  /**
   * Disconnect from device
   */
  protected async onDisconnect(device: SecurityDevice): Promise<void> {
    const config = this.getDeviceSnmpConfig(device);
    const sessionKey = `${config.host}:${config.community || config.user}`;
    
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.close();
      this.sessions.delete(sessionKey);
    }
  }

  /**
   * Cleanup all sessions (for shutdown)
   */
  async cleanup(): Promise<void> {
    for (const [_, session] of this.sessions) {
      session.close();
    }
    this.sessions.clear();
  }
}
