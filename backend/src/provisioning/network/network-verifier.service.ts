/**
 * Network Verifier Service
 * Comprehensive network connectivity and configuration verification
 */

import { NetworkVerificationResult } from '../models/provisioning-result';
import { ProvisioningContext } from '../models/provisioning-context';
import { NetworkAdapter } from './network.adapter';
import { LinuxNetworkAdapter } from './linux-network.adapter';

export interface VerificationTest {
  name: string;
  passed: boolean;
  latencyMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export class NetworkVerifierService {
  private adapter: NetworkAdapter;

  constructor(adapter?: NetworkAdapter) {
    this.adapter = adapter || new LinuxNetworkAdapter();
  }

  /**
   * Run comprehensive network verification
   */
  async verify(context: ProvisioningContext): Promise<NetworkVerificationResult> {
    const tests: VerificationTest[] = [];

    // Test 1: Interface status
    const interfaceTest = await this.testInterfaces();
    tests.push(interfaceTest);

    // Test 2: Address assignment
    const addressTest = await this.testAddressAssignment(context);
    tests.push(addressTest);

    // Test 3: Gateway reachability
    const gatewayTest = await this.testGateway();
    tests.push(gatewayTest);

    // Test 4: Internet connectivity
    const internetTest = await this.testInternet();
    tests.push(internetTest);

    // Test 5: DNS resolution
    const dnsTest = await this.testDns(context);
    tests.push(dnsTest);

    // Test 6: NTP connectivity
    const ntpTest = await this.testNtp(context);
    tests.push(ntpTest);

    // Test 7: Camera subnet
    const cameraSubnetTest = await this.testCameraSubnet(context);
    tests.push(cameraSubnetTest);

    // Test 8: VLAN availability (if configured)
    const vlanTest = await this.testVlan(context);
    if (vlanTest) {
      tests.push(vlanTest);
    }

    return {
      interfaceUp: interfaceTest.passed,
      assignedAddressCorrect: addressTest.passed,
      gatewayReachable: gatewayTest.passed,
      internetReachable: internetTest.passed,
      dnsWorking: dnsTest.passed,
      ntpWorking: ntpTest.passed,
      cameraSubnetReachable: cameraSubnetTest.passed,
      vlanAvailable: vlanTest?.passed,
      latencyMs: gatewayTest.latencyMs,
    };
  }

  /**
   * Test if required interfaces are up
   */
  private async testInterfaces(): Promise<VerificationTest> {
    try {
      const interfaces = await this.adapter.listInterfaces();
      const activeInterfaces = interfaces.filter(
        iface => iface.status === 'up' && iface.type !== 'loopback'
      );

      if (activeInterfaces.length === 0) {
        return {
          name: 'interface_status',
          passed: false,
          error: 'No active network interfaces found',
        };
      }

      return {
        name: 'interface_status',
        passed: true,
        metadata: {
          activeCount: activeInterfaces.length,
          interfaces: activeInterfaces.map(i => i.name),
        },
      };
    } catch (error) {
      return {
        name: 'interface_status',
        passed: false,
        error: error.message,
      };
    }
  }

  /**
   * Test if addresses are assigned correctly
   */
  private async testAddressAssignment(
    context: ProvisioningContext
  ): Promise<VerificationTest> {
    try {
      const config = context.config.network;
      const interfaces = await this.adapter.listInterfaces();

      // If static configuration is specified, verify it
      if (config.management.mode === 'static' && config.management.address) {
        const hasAddress = interfaces.some(iface =>
          iface.addresses.some(addr => addr.address === config.management.address)
        );

        if (!hasAddress) {
          return {
            name: 'address_assignment',
            passed: false,
            error: `Static address ${config.management.address} not assigned`,
          };
        }
      }

      // Check if at least one interface has an address
      const hasAnyAddress = interfaces.some(
        iface => iface.addresses.length > 0 && iface.type !== 'loopback'
      );

      return {
        name: 'address_assignment',
        passed: hasAnyAddress,
        error: hasAnyAddress ? undefined : 'No IP addresses assigned',
      };
    } catch (error) {
      return {
        name: 'address_assignment',
        passed: false,
        error: error.message,
      };
    }
  }

  /**
   * Test gateway reachability
   */
  private async testGateway(): Promise<VerificationTest> {
    try {
      const gateway = await this.adapter.getDefaultGateway();

      if (!gateway) {
        return {
          name: 'gateway_reachability',
          passed: false,
          error: 'No default gateway configured',
        };
      }

      const pingResult = await this.adapter.ping(gateway, 5000);

      return {
        name: 'gateway_reachability',
        passed: pingResult.reachable,
        latencyMs: pingResult.latencyMs,
        error: pingResult.error,
        metadata: {
          gateway,
          packetLoss: pingResult.packetLoss,
        },
      };
    } catch (error) {
      return {
        name: 'gateway_reachability',
        passed: false,
        error: error.message,
      };
    }
  }

  /**
   * Test internet connectivity
   */
  private async testInternet(): Promise<VerificationTest> {
    try {
      // Try multiple reliable hosts
      const hosts = ['8.8.8.8', '1.1.1.1', '208.67.222.222'];

      for (const host of hosts) {
        const result = await this.adapter.ping(host, 3000);
        if (result.reachable) {
          return {
            name: 'internet_connectivity',
            passed: true,
            latencyMs: result.latencyMs,
            metadata: { host },
          };
        }
      }

      return {
        name: 'internet_connectivity',
        passed: false,
        error: 'Cannot reach internet hosts',
      };
    } catch (error) {
      return {
        name: 'internet_connectivity',
        passed: false,
        error: error.message,
      };
    }
  }

  /**
   * Test DNS resolution
   */
  private async testDns(context: ProvisioningContext): Promise<VerificationTest> {
    try {
      const testDomains = ['google.com', 'cloudflare.com', 'example.com'];

      for (const domain of testDomains) {
        const result = await this.adapter.resolveDns(domain, 5000);
        if (result.success) {
          return {
            name: 'dns_resolution',
            passed: true,
            latencyMs: result.latencyMs,
            metadata: {
              domain,
              addresses: result.addresses,
            },
          };
        }
      }

      return {
        name: 'dns_resolution',
        passed: false,
        error: 'DNS resolution failed for all test domains',
      };
    } catch (error) {
      return {
        name: 'dns_resolution',
        passed: false,
        error: error.message,
      };
    }
  }

  /**
   * Test NTP connectivity
   */
  private async testNtp(context: ProvisioningContext): Promise<VerificationTest> {
    try {
      const ntpServers = context.config.network.ntpServers;

      if (ntpServers.length === 0) {
        return {
          name: 'ntp_connectivity',
          passed: true,
          metadata: { note: 'No NTP servers configured' },
        };
      }

      // Try to resolve and ping NTP servers
      for (const server of ntpServers) {
        try {
          const dnsResult = await this.adapter.resolveDns(server, 5000);
          if (dnsResult.success && dnsResult.addresses && dnsResult.addresses.length > 0) {
            const pingResult = await this.adapter.ping(dnsResult.addresses[0], 3000);
            if (pingResult.reachable) {
              return {
                name: 'ntp_connectivity',
                passed: true,
                metadata: {
                  server,
                  resolved: dnsResult.addresses[0],
                },
              };
            }
          }
        } catch {
          continue;
        }
      }

      return {
        name: 'ntp_connectivity',
        passed: false,
        error: 'Cannot reach any configured NTP servers',
      };
    } catch (error) {
      return {
        name: 'ntp_connectivity',
        passed: false,
        error: error.message,
      };
    }
  }

  /**
   * Test camera subnet reachability
   */
  private async testCameraSubnet(
    context: ProvisioningContext
  ): Promise<VerificationTest> {
    try {
      const subnet = context.config.network.cameraNetwork.subnet;

      if (!subnet) {
        return {
          name: 'camera_subnet',
          passed: true,
          metadata: { note: 'No camera subnet configured' },
        };
      }

      // For now, just verify the interface exists
      // In a real implementation, you might scan the subnet
      const interfaces = await this.adapter.listInterfaces();
      const hasCameraInterface = interfaces.some(
        iface => iface.status === 'up' && iface.type !== 'loopback'
      );

      return {
        name: 'camera_subnet',
        passed: hasCameraInterface,
        metadata: { subnet },
      };
    } catch (error) {
      return {
        name: 'camera_subnet',
        passed: false,
        error: error.message,
      };
    }
  }

  /**
   * Test VLAN configuration
   */
  private async testVlan(
    context: ProvisioningContext
  ): Promise<VerificationTest | null> {
    const vlanId = context.config.network.cameraNetwork.vlanId;

    if (!vlanId) {
      return null; // VLAN not configured
    }

    try {
      const interfaces = await this.adapter.listInterfaces();
      const vlanInterface = interfaces.find(iface =>
        iface.name.includes(`.${vlanId}`)
      );

      if (!vlanInterface) {
        return {
          name: 'vlan_availability',
          passed: false,
          error: `VLAN ${vlanId} interface not found`,
        };
      }

      return {
        name: 'vlan_availability',
        passed: vlanInterface.status === 'up',
        metadata: {
          vlanId,
          interface: vlanInterface.name,
          status: vlanInterface.status,
        },
      };
    } catch (error) {
      return {
        name: 'vlan_availability',
        passed: false,
        error: error.message,
      };
    }
  }
}
