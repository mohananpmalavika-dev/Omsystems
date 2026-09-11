/**
 * SNMP Collector Service
 * 
 * Handles SNMP polling for infrastructure devices
 */

import { Pool } from 'pg';
import snmp from 'net-snmp';

export interface SNMPTarget {
  host: string;
  port?: number;
  timeout?: number;
  retries?: number;
  credentials: {
    version: string;
    community: string;
  };
}

export const STANDARD_OIDS = {
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  ifSpeed: '1.3.6.1.2.1.2.2.1.5',
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',
  ifHCInOctets: '1.3.6.1.2.1.31.1.1.1.6',
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10',
  ifInErrors: '1.3.6.1.2.1.2.2.1.14',
  ifOutErrors: '1.3.6.1.2.1.2.2.1.20',
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',
  hrStorageUsed: '1.3.6.1.2.1.25.2.3.1.6',
  hrStorageSize: '1.3.6.1.2.1.25.2.3.1.5',
  entPhySensorValue: '1.3.6.1.2.1.99.1.1.1.4',
};

export const VENDOR_OIDS = {
  cisco: {
    cpuUsage: '1.3.6.1.4.1.9.9.109.1.1.1.1.8',
    memoryPoolUsed: '1.3.6.1.4.1.9.9.48.1.1.1.5',
    memoryPoolFree: '1.3.6.1.4.1.9.9.48.1.1.1.6',
    temperature: '1.3.6.1.4.1.9.9.13.1.3.1.3',
  },
  hp: {
    cpuUtilization: '1.3.6.1.4.1.11.2.14.11.5.1.9.6.1.0',
    memoryTotal: '1.3.6.1.4.1.11.2.14.11.5.1.1.2.1.1.1.5',
    memoryFree: '1.3.6.1.4.1.11.2.14.11.5.1.1.2.1.1.1.6',
    temperature: '1.3.6.1.4.1.11.2.14.11.1.2.6.1.4',
  },
  dell: {
    cpuUsage: '1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.9.0',
    memoryUsage: '1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.1.0',
    temperature: '1.3.6.1.4.1.674.10895.3000.1.2.110.7.1.1.3',
  },
  fortinet: {},
  paloalto: {},
  apc: {
    upsBasicBatteryStatus: '1.3.6.1.4.1.318.1.1.1.2.1.1.0',
    upsAdvBatteryCapacity: '1.3.6.1.4.1.318.1.1.1.2.2.1.0',
    upsAdvBatteryTemperature: '1.3.6.1.4.1.318.1.1.1.2.2.2.0',
    upsAdvBatteryRunTimeRemaining: '1.3.6.1.4.1.318.1.1.1.2.2.3.0',
    upsAdvInputVoltage: '1.3.6.1.4.1.318.1.1.1.3.2.1.0',
    upsAdvInputFrequency: '1.3.6.1.4.1.318.1.1.1.3.2.4.0',
    upsAdvOutputVoltage: '1.3.6.1.4.1.318.1.1.1.4.2.1.0',
    upsAdvOutputFrequency: '1.3.6.1.4.1.318.1.1.1.4.2.2.0',
    upsAdvOutputLoad: '1.3.6.1.4.1.318.1.1.1.4.2.3.0',
    upsAdvOutputCurrent: '1.3.6.1.4.1.318.1.1.1.4.2.4.0',
  },
  eaton: {},
};

export class SNMPCollectorService {
  constructor(private pool: Pool) {}

  private createSession(target: SNMPTarget) {
    const requestedVersion = target.credentials.version.toLowerCase();
    const version = requestedVersion === 'v1' || requestedVersion === '1'
      ? snmp.Version1
      : requestedVersion === 'v2c' || requestedVersion === '2c' || requestedVersion === '2'
        ? snmp.Version2c
        : undefined;

    if (version === undefined) {
      throw new Error(`unsupported_snmp_version:${target.credentials.version}`);
    }
    if (!target.host.trim() || !target.credentials.community) {
      throw new Error('snmp_target_credentials_required');
    }

    return snmp.createSession(target.host, target.credentials.community, {
      version,
      port: target.port ?? 161,
      timeout: target.timeout ?? 5_000,
      retries: target.retries ?? 1,
      transport: target.host.includes(':') ? 'udp6' : 'udp4',
    });
  }

  /**
   * Collect single SNMP OID
   */
  async collect(
    ipAddress: string,
    oid: string,
    community: string = 'public',
    version: string = 'v2c'
  ): Promise<any> {
    const [result] = await this.snmpGet({
      host: ipAddress,
      credentials: { community, version },
    }, [oid]);
    return result?.value ?? null;
  }

  /**
   * Collect multiple SNMP OIDs
   */
  async collectMultiple(
    ipAddress: string,
    oids: string[],
    community: string = 'public',
    version: string = 'v2c'
  ): Promise<Record<string, any>> {
    const varbinds = await this.snmpGet({
      host: ipAddress,
      credentials: { community, version },
    }, oids);
    const results: Record<string, any> = {};
    for (const varbind of varbinds) results[varbind.oid] = varbind.value;
    return results;
  }

  /**
   * SNMP GET operation
   */
  async snmpGet(target: SNMPTarget, oids: string[]): Promise<any[]> {
    if (oids.length === 0) return [];
    const session = this.createSession(target);
    try {
      return await new Promise<any[]>((resolve, reject) => {
        session.get(oids, (error: Error | null, varbinds: any[]) => {
          if (error) return reject(error);
          const failures = varbinds.filter((varbind) => snmp.isVarbindError(varbind));
          if (failures.length > 0) {
            return reject(new Error(`snmp_get_failed:${failures.map((entry) => snmp.varbindError(entry)).join(',')}`));
          }
          resolve(varbinds.map((varbind) => ({ oid: varbind.oid, value: varbind.value, type: varbind.type })));
        });
      });
    } finally {
      session.close();
    }
  }

  /**
   * SNMP WALK operation
   */
  async snmpWalk(target: SNMPTarget, oid: string): Promise<any[]> {
    const session = this.createSession(target);
    try {
      return await new Promise<any[]>((resolve, reject) => {
        const values: any[] = [];
        session.walk(
          oid,
          20,
          (varbinds: any[]) => {
            for (const varbind of varbinds) {
              if (snmp.isVarbindError(varbind)) {
                reject(new Error(`snmp_walk_failed:${snmp.varbindError(varbind)}`));
                return false;
              }
              values.push({ oid: varbind.oid, value: varbind.value, type: varbind.type });
            }
            return true;
          },
          (error: Error | null) => error ? reject(error) : resolve(values),
        );
      });
    } finally {
      session.close();
    }
  }

  /**
   * Parse SNMP value
   */
  parseValue(value: any): number {
    if (value === null || value === undefined) return 0;
    const num = parseFloat(String(value));
    return isNaN(num) ? 0 : num;
  }
}

export default SNMPCollectorService;
