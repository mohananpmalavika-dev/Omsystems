/**
 * Security Device Adapter Registry
 * 
 * Manages all device adapters and routes requests to the appropriate adapter.
 * Provides a unified interface for device operations across different protocols.
 */

import {
  SecurityDevice,
  SecurityDeviceAdapter,
  DeviceProtocol,
  SecurityDeviceType,
} from '../../types/security-device';
import { OnvifAdapter } from './onvif-adapter';
import { SnmpAdapter } from './snmp-adapter';
import { RestAdapter } from './rest-adapter';
import { MqttAdapter } from './mqtt-adapter';
import { AxProAdapter } from '../../integrations/hikvision/axpro';

export class SecurityDeviceAdapterRegistry {
  private static instance: SecurityDeviceAdapterRegistry;
  private adapters: Map<string, SecurityDeviceAdapter> = new Map();
  private protocolAdapterMap: Map<DeviceProtocol, string> = new Map();

  private constructor() {
    this.registerDefaultAdapters();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): SecurityDeviceAdapterRegistry {
    if (!SecurityDeviceAdapterRegistry.instance) {
      SecurityDeviceAdapterRegistry.instance = new SecurityDeviceAdapterRegistry();
    }
    return SecurityDeviceAdapterRegistry.instance;
  }

  /**
   * Register default adapters
   */
  private registerDefaultAdapters(): void {
    // Register ONVIF adapter
    const onvifAdapter = new OnvifAdapter();
    this.registerAdapter(onvifAdapter);
    this.mapProtocolToAdapter('ONVIF', onvifAdapter.adapterName);
    this.mapProtocolToAdapter('RTSP', onvifAdapter.adapterName);

    // Register SNMP adapter
    const snmpAdapter = new SnmpAdapter();
    this.registerAdapter(snmpAdapter);
    this.mapProtocolToAdapter('SNMP', snmpAdapter.adapterName);

    // Register REST adapter
    const restAdapter = new RestAdapter();
    this.registerAdapter(restAdapter);
    this.mapProtocolToAdapter('REST', restAdapter.adapterName);
    this.mapProtocolToAdapter('HTTP_API', restAdapter.adapterName);
    this.mapProtocolToAdapter('HTTPS_API', restAdapter.adapterName);

    // Register MQTT adapter
    const mqttAdapter = new MqttAdapter();
    this.registerAdapter(mqttAdapter);
    this.mapProtocolToAdapter('MQTT', mqttAdapter.adapterName);

    // Hikvision AX PRO adapter. It intentionally remains separate from the
    // generic REST adapter because AX PRO auth, payloads, and event mappings
    // are firmware/model-specific.
    const axProAdapter = new AxProAdapter();
    this.registerAdapter(axProAdapter);
    this.mapProtocolToAdapter('AX_PRO', axProAdapter.adapterName);
    this.mapProtocolToAdapter('ISAPI', axProAdapter.adapterName);
  }

  /**
   * Register a new adapter
   */
  public registerAdapter(adapter: SecurityDeviceAdapter): void {
    const key = this.getAdapterKey(adapter.adapterName, adapter.adapterVersion);
    
    if (this.adapters.has(key)) {
      console.warn(`Adapter ${key} is already registered. Overwriting.`);
    }

    this.adapters.set(key, adapter);
    console.log(`Registered adapter: ${key}`);
  }

  /**
   * Map a protocol to an adapter
   */
  public mapProtocolToAdapter(protocol: DeviceProtocol, adapterName: string): void {
    this.protocolAdapterMap.set(protocol, adapterName);
  }

  /**
   * Get adapter for a device
   */
  public getAdapterForDevice(device: SecurityDevice): SecurityDeviceAdapter {
    // Try to get adapter by explicit adapter name in device metadata
    if (device.metadata?.adapterName) {
      const adapter = this.getAdapter(
        device.metadata.adapterName,
        device.metadata.adapterVersion
      );
      if (adapter) return adapter;
    }

    // Get adapter by protocol
    const adapterName = this.protocolAdapterMap.get(device.protocol);
    if (!adapterName) {
      throw new Error(
        `No adapter registered for protocol: ${device.protocol}`
      );
    }

    const adapter = this.getAdapter(adapterName);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterName}`);
    }

    return adapter;
  }

  /**
   * Get adapter by name and optional version
   */
  public getAdapter(
    name: string,
    version?: string
  ): SecurityDeviceAdapter | undefined {
    if (version) {
      const key = this.getAdapterKey(name, version);
      return this.adapters.get(key);
    }

    // If no version specified, get latest version
    for (const [key, adapter] of this.adapters) {
      if (key.startsWith(`${name}@`)) {
        return adapter;
      }
    }

    return undefined;
  }

  /**
   * Get all registered adapters
   */
  public getAllAdapters(): SecurityDeviceAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapters that support a specific protocol
   */
  public getAdaptersByProtocol(protocol: DeviceProtocol): SecurityDeviceAdapter[] {
    return this.getAllAdapters().filter((adapter) =>
      adapter.supportedProtocols.includes(protocol)
    );
  }

  /**
   * Get adapters that support a specific device type
   */
  public getAdaptersByDeviceType(
    deviceType: SecurityDeviceType
  ): SecurityDeviceAdapter[] {
    return this.getAllAdapters().filter((adapter) =>
      adapter.supportedDeviceTypes.includes(deviceType)
    );
  }

  /**
   * Check if a protocol is supported
   */
  public isProtocolSupported(protocol: DeviceProtocol): boolean {
    return this.protocolAdapterMap.has(protocol);
  }

  /**
   * Check if a device type is supported
   */
  public isDeviceTypeSupported(deviceType: SecurityDeviceType): boolean {
    return this.getAllAdapters().some((adapter) =>
      adapter.supportedDeviceTypes.includes(deviceType)
    );
  }

  /**
   * Initialize an adapter
   */
  public async initializeAdapter(
    adapterName: string,
    config: Record<string, any>
  ): Promise<void> {
    const adapter = this.getAdapter(adapterName);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterName}`);
    }

    await adapter.initialize(config);
    console.log(`Initialized adapter: ${adapterName}`);
  }

  /**
   * Initialize all adapters
   */
  public async initializeAllAdapters(
    config: Record<string, Record<string, any>>
  ): Promise<void> {
    const initPromises: Promise<void>[] = [];

    for (const [key, adapter] of this.adapters) {
      const adapterConfig = config[adapter.adapterName] || {};
      initPromises.push(adapter.initialize(adapterConfig));
    }

    await Promise.all(initPromises);
    console.log(`Initialized ${this.adapters.size} adapters`);
  }

  /**
   * Get adapter statistics
   */
  public getStatistics(): {
    totalAdapters: number;
    adaptersPerProtocol: Record<string, number>;
    adaptersPerDeviceType: Record<string, number>;
    supportedProtocols: DeviceProtocol[];
    supportedDeviceTypes: SecurityDeviceType[];
  } {
    const adaptersPerProtocol: Record<string, number> = {};
    const adaptersPerDeviceType: Record<string, number> = {};
    const supportedProtocols = new Set<DeviceProtocol>();
    const supportedDeviceTypes = new Set<SecurityDeviceType>();

    for (const adapter of this.getAllAdapters()) {
      // Count adapters per protocol
      for (const protocol of adapter.supportedProtocols) {
        adaptersPerProtocol[protocol] = (adaptersPerProtocol[protocol] || 0) + 1;
        supportedProtocols.add(protocol);
      }

      // Count adapters per device type
      for (const deviceType of adapter.supportedDeviceTypes) {
        adaptersPerDeviceType[deviceType] =
          (adaptersPerDeviceType[deviceType] || 0) + 1;
        supportedDeviceTypes.add(deviceType);
      }
    }

    return {
      totalAdapters: this.adapters.size,
      adaptersPerProtocol,
      adaptersPerDeviceType,
      supportedProtocols: Array.from(supportedProtocols),
      supportedDeviceTypes: Array.from(supportedDeviceTypes),
    };
  }

  /**
   * Get adapter key
   */
  private getAdapterKey(name: string, version: string): string {
    return `${name}@${version}`;
  }

  /**
   * Unregister an adapter
   */
  public unregisterAdapter(name: string, version?: string): boolean {
    if (version) {
      const key = this.getAdapterKey(name, version);
      return this.adapters.delete(key);
    }

    // Remove all versions
    let removed = false;
    for (const key of this.adapters.keys()) {
      if (key.startsWith(`${name}@`)) {
        this.adapters.delete(key);
        removed = true;
      }
    }

    return removed;
  }

  /**
   * Clear all adapters
   */
  public clear(): void {
    this.adapters.clear();
    this.protocolAdapterMap.clear();
  }

  /**
   * Discover devices using all compatible adapters
   */
  public async discoverDevices(
    network: string,
    options?: {
      protocols?: DeviceProtocol[];
      deviceTypes?: SecurityDeviceType[];
      timeoutSeconds?: number;
    }
  ): Promise<Map<string, any[]>> {
    const results = new Map<string, any[]>();
    const adaptersToUse = this.getAdaptersForDiscovery(options);

    console.log(
      `Starting discovery with ${adaptersToUse.length} adapters on network ${network}`
    );

    // Run discovery in parallel
    const discoveryPromises = adaptersToUse.map(async (adapter) => {
      try {
        const discovered = await adapter.discover(network, options);
        results.set(adapter.adapterName, discovered);
        console.log(
          `${adapter.adapterName}: Found ${discovered.length} devices`
        );
      } catch (error) {
        console.error(`${adapter.adapterName} discovery failed:`, error);
        results.set(adapter.adapterName, []);
      }
    });

    await Promise.all(discoveryPromises);

    return results;
  }

  /**
   * Get adapters to use for discovery based on options
   */
  private getAdaptersForDiscovery(options?: {
    protocols?: DeviceProtocol[];
    deviceTypes?: SecurityDeviceType[];
  }): SecurityDeviceAdapter[] {
    let adapters = this.getAllAdapters();

    if (options?.protocols && options.protocols.length > 0) {
      adapters = adapters.filter((adapter) =>
        adapter.supportedProtocols.some((p) => options.protocols!.includes(p))
      );
    }

    if (options?.deviceTypes && options.deviceTypes.length > 0) {
      adapters = adapters.filter((adapter) =>
        adapter.supportedDeviceTypes.some((t) =>
          options.deviceTypes!.includes(t)
        )
      );
    }

    return adapters;
  }
}

// Export singleton instance
export const adapterRegistry = SecurityDeviceAdapterRegistry.getInstance();
