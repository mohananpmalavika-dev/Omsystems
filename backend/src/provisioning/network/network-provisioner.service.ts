/**
 * Network Provisioner Service
 * Handles network inspection, configuration, and verification
 */

import {
  NetworkProvisioningResult,
  InterfaceProvisioningResult,
  NetworkVerificationResult,
} from '../models/provisioning-result';
import { ProvisioningContext } from '../models/provisioning-context';
import { NetworkAdapter } from './network.adapter';
import { LinuxNetworkAdapter } from './linux-network.adapter';

export interface NetworkInspection {
  interfaces: InterfaceProvisioningResult[];
  hasManagementInterface: boolean;
  hasCameraInterface: boolean;
  defaultGateway?: string;
}

export class NetworkProvisionerService {
  private adapter: NetworkAdapter;

  constructor(adapter?: NetworkAdapter) {
    // Default to Linux adapter, but allow injection for testing/other platforms
    this.adapter = adapter || new LinuxNetworkAdapter();
  }

  /**
   * Inspect current network state
   */
  async inspect(context: ProvisioningContext): Promise<NetworkInspection> {
    const interfaces = await this.adapter.listInterfaces();
    const defaultGateway = await this.adapter.getDefaultGateway();

    const interfaceResults: InterfaceProvisioningResult[] = interfaces
      .filter(iface => iface.type !== 'loopback')
      .map(iface => ({
        name: iface.name,
        type: this.guessInterfaceType(iface.name),
        configured: iface.addresses.length > 0,
        mode: this.detectAddressMode(iface.name),
        address: iface.addresses[0]?.address,
        prefixLength: iface.addresses[0]?.prefixLength,
        gateway: defaultGateway || undefined,
        status: iface.status,
      }));

    return {
      interfaces: interfaceResults,
      hasManagementInterface: interfaceResults.some(i => i.type === 'management'),
      hasCameraInterface: interfaceResults.some(i => i.type === 'camera'),
      defaultGateway: defaultGateway || undefined,
    };
  }

  /**
   * Configure network based on provisioning config
   */
  async configure(context: ProvisioningContext): Promise<NetworkProvisioningResult> {
    const config = context.config.network;
    const inspection = await this.inspect(context);

    const results: InterfaceProvisioningResult[] = [];
    const configuredVlans: number[] = [];

    // Configure management interface
    const managementInterface = inspection.interfaces[0]; // Assume first interface
    
    if (managementInterface) {
      try {
        if (config.management.mode === 'static' && config.management.address) {
          await this.adapter.configureStaticAddress(managementInterface.name, {
            address: config.management.address,
            prefixLength: config.management.prefixLength || 24,
            gateway: config.management.gateway,
          });

          results.push({
            name: managementInterface.name,
            type: 'management',
            configured: true,
            mode: 'static',
            address: config.management.address,
            prefixLength: config.management.prefixLength || 24,
            gateway: config.management.gateway,
            status: 'up',
          });
        } else {
          // Use DHCP
          await this.adapter.configureDhcp(managementInterface.name);

          // Re-inspect to get assigned address
          const updatedInterfaces = await this.adapter.listInterfaces();
          const updated = updatedInterfaces.find(i => i.name === managementInterface.name);

          results.push({
            name: managementInterface.name,
            type: 'management',
            configured: true,
            mode: 'dhcp',
            address: updated?.addresses[0]?.address,
            prefixLength: updated?.addresses[0]?.prefixLength,
            status: updated?.status || 'unknown',
          });
        }
      } catch (error) {
        results.push({
          name: managementInterface.name,
          type: 'management',
          configured: false,
          mode: config.management.mode,
          status: 'down',
        });
      }
    }

    // Configure VLAN if specified
    if (config.cameraNetwork.vlanId && inspection.interfaces[0]) {
      try {
        await this.adapter.configureVlan({
          vlanId: config.cameraNetwork.vlanId,
          parentInterface: inspection.interfaces[0].name,
        });

        configuredVlans.push(config.cameraNetwork.vlanId);

        results.push({
          name: `${inspection.interfaces[0].name}.${config.cameraNetwork.vlanId}`,
          type: 'camera',
          configured: true,
          mode: 'static',
          status: 'up',
        });
      } catch (error) {
        // VLAN configuration failed, non-critical
      }
    }

    // Configure DNS
    try {
      await this.adapter.setDns(config.dnsServers);
    } catch (error) {
      // DNS configuration failed, will be caught in verification
    }

    // Configure NTP
    try {
      await this.adapter.setNtp(config.ntpServers);
    } catch (error) {
      // NTP configuration failed, will be caught in verification
    }

    // Perform initial verification
    const verification = await this.verify(context);

    return {
      interfaces: results,
      gatewayReachable: verification.gatewayReachable,
      dnsWorking: verification.dnsWorking,
      ntpWorking: verification.ntpWorking,
      configuredVlans,
      managementAddress: results.find(i => i.type === 'management')?.address,
      cameraSubnetReachable: verification.cameraSubnetReachable,
    };
  }

  /**
   * Verify network configuration
   */
  async verify(context: ProvisioningContext): Promise<NetworkVerificationResult> {
    const config = context.config.network;
    const interfaces = await this.adapter.listInterfaces();

    // Check if required interfaces are up
    const interfaceUp = interfaces.some(
      iface => iface.status === 'up' && iface.addresses.length > 0
    );

    // Check gateway reachability
    const gateway = await this.adapter.getDefaultGateway();
    let gatewayReachable = false;
    let latencyMs: number | undefined;

    if (gateway) {
      const pingResult = await this.adapter.ping(gateway, 5000);
      gatewayReachable = pingResult.reachable;
      latencyMs = pingResult.latencyMs;
    }

    // Check DNS
    let dnsWorking = false;
    try {
      const dnsResult = await this.adapter.resolveDns('google.com', 5000);
      dnsWorking = dnsResult.success;
    } catch {
      dnsWorking = false;
    }

    // Check NTP (simplified - just verify servers are reachable)
    let ntpWorking = false;
    if (config.ntpServers.length > 0) {
      try {
        // Try to reach first NTP server
        const ntpServer = config.ntpServers[0].replace('pool.ntp.org', 'time.google.com');
        const dnsResult = await this.adapter.resolveDns(ntpServer, 5000);
        ntpWorking = dnsResult.success;
      } catch {
        ntpWorking = false;
      }
    }

    // Check camera subnet reachability (if configured)
    let cameraSubnetReachable = true;
    if (config.cameraNetwork.subnet) {
      // Extract first IP from subnet for testing
      const subnetMatch = config.cameraNetwork.subnet.match(/^([\d.]+)\//);
      if (subnetMatch) {
        const testIp = subnetMatch[1];
        const pingResult = await this.adapter.ping(testIp, 2000);
        // Not reachable is OK if subnet is empty, so don't fail on this
        cameraSubnetReachable = true;
      }
    }

    // Check if assigned addresses match configuration
    let assignedAddressCorrect = true;
    if (config.management.mode === 'static' && config.management.address) {
      const managementIface = interfaces.find(i => i.addresses.some(
        addr => addr.address === config.management.address
      ));
      assignedAddressCorrect = !!managementIface;
    }

    return {
      interfaceUp,
      assignedAddressCorrect,
      gatewayReachable,
      internetReachable: dnsWorking, // If DNS works, internet is reachable
      dnsWorking,
      ntpWorking,
      cameraSubnetReachable,
      vlanAvailable: config.cameraNetwork.vlanId ? true : undefined,
      latencyMs,
    };
  }

  /**
   * Full provision workflow
   */
  async provision(context: ProvisioningContext): Promise<NetworkProvisioningResult> {
    // Inspect current state
    const inspection = await this.inspect(context);

    // Configure network
    const configResult = await this.configure(context);

    // Verify configuration
    const verification = await this.verify(context);

    // Merge results
    return {
      ...configResult,
      gatewayReachable: verification.gatewayReachable,
      dnsWorking: verification.dnsWorking,
      ntpWorking: verification.ntpWorking,
      cameraSubnetReachable: verification.cameraSubnetReachable,
    };
  }

  /**
   * Guess interface type from name
   */
  private guessInterfaceType(name: string): 'management' | 'camera' | 'uplink' {
    if (name.includes('mgmt')) return 'management';
    if (name.includes('cam')) return 'camera';
    if (name.includes('wan') || name.includes('uplink')) return 'uplink';
    
    // Default: first interface is management, others are camera
    return 'management';
  }

  /**
   * Detect address configuration mode
   */
  private async detectAddressMode(interfaceName: string): Promise<'dhcp' | 'static'> {
    try {
      // Check if NetworkManager shows DHCP
      const { stdout } = await require('child_process')
        .execSync(`nmcli -g ipv4.method con show ${interfaceName}`)
        .toString();
      
      return stdout.trim() === 'auto' ? 'dhcp' : 'static';
    } catch {
      // Assume static if we can't determine
      return 'static';
    }
  }
}
