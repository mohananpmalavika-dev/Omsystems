/**
 * Subnet Discovery Provider
 * Scans approved subnets for camera-relevant services
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as net from 'net';
import { DiscoveredCamera } from '../models/provisioning-result';
import { DiscoveryContext } from '../models/provisioning-context';
import { DeviceDiscoveryProvider } from './discovery-provider.interface';

const execAsync = promisify(exec);

export class SubnetDiscoveryProvider implements DeviceDiscoveryProvider {
  readonly name = 'subnet-scan';

  private readonly DEFAULT_SCAN_PORTS = [80, 443, 554, 8000, 8080, 8899];
  private readonly SCAN_TIMEOUT = 2000; // 2 seconds per port

  /**
   * Discover devices by scanning approved subnets
   */
  async discover(context: DiscoveryContext): Promise<DiscoveredCamera[]> {
    const discovered: DiscoveredCamera[] = [];
    const scanPorts = context.scanPorts.length > 0 
      ? context.scanPorts 
      : this.DEFAULT_SCAN_PORTS;

    for (const subnet of context.approvedSubnets) {
      const hosts = this.expandSubnet(subnet);
      
      // Limit concurrent scans to avoid overwhelming the network
      const batchSize = 20;
      for (let i = 0; i < hosts.length; i += batchSize) {
        const batch = hosts.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(host => this.scanHost(host, scanPorts))
        );

        discovered.push(...results.filter(r => r !== null) as DiscoveredCamera[]);
      }
    }

    return discovered;
  }

  /**
   * Check if subnet scanning is available
   */
  async isAvailable(): Promise<boolean> {
    return true; // Always available as it uses Node.js net module
  }

  /**
   * Scan a single host for camera services
   */
  private async scanHost(
    ipAddress: string,
    ports: number[]
  ): Promise<DiscoveredCamera | null> {
    const openPorts: number[] = [];

    // Scan all ports concurrently
    const results = await Promise.all(
      ports.map(port => this.checkPort(ipAddress, port))
    );

    results.forEach((isOpen, index) => {
      if (isOpen) {
        openPorts.push(ports[index]);
      }
    });

    // If no relevant ports are open, skip this host
    if (openPorts.length === 0) {
      return null;
    }

    // Try to identify the device
    const vendor = await this.identifyVendor(ipAddress, openPorts);

    return {
      discoverySource: 'subnet',
      ipAddress,
      discoveredAt: new Date(),
      vendor,
      serviceUrls: this.buildServiceUrls(ipAddress, openPorts),
    };
  }

  /**
   * Check if a port is open
   */
  private checkPort(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, this.SCAN_TIMEOUT);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  /**
   * Try to identify vendor from HTTP response
   */
  private async identifyVendor(
    ipAddress: string,
    openPorts: number[]
  ): Promise<string | undefined> {
    // Try HTTP/HTTPS ports first
    const httpPorts = openPorts.filter(p => [80, 443, 8000, 8080].includes(p));

    for (const port of httpPorts) {
      try {
        const protocol = port === 443 ? 'https' : 'http';
        const { stdout } = await execAsync(
          `curl -s -m 3 --insecure ${protocol}://${ipAddress}:${port}/ | head -n 20`,
          { timeout: 5000 }
        );

        // Check for vendor identifiers in response
        if (stdout.includes('Axis') || stdout.includes('axis')) {
          return 'Axis';
        }
        if (stdout.includes('Hikvision') || stdout.includes('hikvision')) {
          return 'Hikvision';
        }
        if (stdout.includes('Dahua') || stdout.includes('dahua')) {
          return 'Dahua';
        }
        if (stdout.includes('Hanwha') || stdout.includes('hanwha')) {
          return 'Hanwha';
        }
        if (stdout.includes('Bosch') || stdout.includes('bosch')) {
          return 'Bosch';
        }
        if (stdout.includes('Uniview') || stdout.includes('uniview')) {
          return 'Uniview';
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  /**
   * Build service URLs from open ports
   */
  private buildServiceUrls(ipAddress: string, openPorts: number[]): string[] {
    const urls: string[] = [];

    for (const port of openPorts) {
      if (port === 554) {
        urls.push(`rtsp://${ipAddress}:${port}`);
      } else if (port === 443) {
        urls.push(`https://${ipAddress}:${port}`);
      } else if ([80, 8000, 8080].includes(port)) {
        urls.push(`http://${ipAddress}:${port}`);
      }
    }

    return urls;
  }

  /**
   * Expand CIDR subnet to individual IP addresses
   */
  private expandSubnet(cidr: string): string[] {
    const [network, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr, 10);

    if (prefix > 24) {
      // For /25 and above, scan all addresses
      return this.expandSmallSubnet(network, prefix);
    }

    // For larger subnets, use a sampling strategy to avoid excessive scanning
    if (prefix < 24) {
      return this.sampleSubnet(network, prefix);
    }

    // For /24, scan the full subnet
    return this.expandSmallSubnet(network, prefix);
  }

  /**
   * Expand small subnet (>/= 24) to all hosts
   */
  private expandSmallSubnet(network: string, prefix: number): string[] {
    const hosts: string[] = [];
    const [a, b, c, d] = network.split('.').map(Number);

    const hostBits = 32 - prefix;
    const totalHosts = Math.pow(2, hostBits);

    // Skip network and broadcast addresses
    for (let i = 1; i < totalHosts - 1; i++) {
      const ip = this.intToIp((this.ipToInt(network) & ~(totalHosts - 1)) + i);
      hosts.push(ip);
    }

    return hosts;
  }

  /**
   * Sample large subnet to avoid excessive scanning
   */
  private sampleSubnet(network: string, prefix: number): string[] {
    const hosts: string[] = [];
    const [a, b, c] = network.split('.').map(Number);

    // For /16 or /20, sample common ranges
    // Focus on .1-.50, .100-.150, .200-.254 in each /24
    const ranges = [
      { start: 1, end: 50 },
      { start: 100, end: 150 },
      { start: 200, end: 254 },
    ];

    const subnets = prefix <= 16 ? 4 : 16; // Sample 4-16 /24 subnets

    for (let subnet = 0; subnet < subnets; subnet++) {
      const subnetBase = prefix <= 16 ? subnet : c + subnet;
      
      for (const range of ranges) {
        for (let d = range.start; d <= range.end; d++) {
          hosts.push(`${a}.${b}.${subnetBase}.${d}`);
        }
      }
    }

    return hosts;
  }

  /**
   * Convert IP string to integer
   */
  private ipToInt(ip: string): number {
    return ip
      .split('.')
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  /**
   * Convert integer to IP string
   */
  private intToIp(int: number): string {
    return [
      (int >>> 24) & 255,
      (int >>> 16) & 255,
      (int >>> 8) & 255,
      int & 255,
    ].join('.');
  }
}
