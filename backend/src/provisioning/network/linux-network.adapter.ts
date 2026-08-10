/**
 * Linux Network Adapter
 * Implementation for Linux-based systems using ip, nmcli, and system utilities
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as dns } from 'dns';
import {
  NetworkAdapter,
  NetworkInterface,
  NetworkAddress,
  StaticIpConfig,
  VlanConfig,
  PingResult,
  DnsResult,
} from './network.adapter';

const execAsync = promisify(exec);

export class LinuxNetworkAdapter implements NetworkAdapter {
  /**
   * List all network interfaces
   */
  async listInterfaces(): Promise<NetworkInterface[]> {
    try {
      // Use 'ip -json addr' for structured output
      const { stdout } = await execAsync('ip -json addr show');
      const interfaces = JSON.parse(stdout);

      return interfaces.map((iface: any) => ({
        name: iface.ifname,
        type: this.detectInterfaceType(iface.ifname),
        mac: iface.address,
        status: iface.operstate === 'UP' ? 'up' : 'down',
        addresses: this.parseAddresses(iface.addr_info || []),
        mtu: iface.mtu,
      }));
    } catch (error) {
      // Fallback to parsing text output if json not available
      return this.listInterfacesLegacy();
    }
  }

  /**
   * Configure static IP address
   */
  async configureStaticAddress(
    interfaceName: string,
    config: StaticIpConfig
  ): Promise<void> {
    // Check if interface exists
    const exists = await this.interfaceExists(interfaceName);
    if (!exists) {
      throw new Error(`Interface ${interfaceName} does not exist`);
    }

    // Try NetworkManager first (more common on modern systems)
    try {
      const commands = [
        `nmcli con mod ${interfaceName} ipv4.method manual`,
        `nmcli con mod ${interfaceName} ipv4.addresses ${config.address}/${config.prefixLength}`,
      ];

      if (config.gateway) {
        commands.push(
          `nmcli con mod ${interfaceName} ipv4.gateway ${config.gateway}`
        );
      }

      commands.push(`nmcli con up ${interfaceName}`);

      for (const cmd of commands) {
        await execAsync(cmd);
      }

      return;
    } catch (nmError) {
      // Fallback to ip command
      try {
        // Flush existing addresses
        await execAsync(`ip addr flush dev ${interfaceName}`);

        // Add new address
        await execAsync(
          `ip addr add ${config.address}/${config.prefixLength} dev ${interfaceName}`
        );

        // Bring interface up
        await execAsync(`ip link set ${interfaceName} up`);

        // Add default route if gateway specified
        if (config.gateway) {
          await execAsync(`ip route add default via ${config.gateway}`);
        }
      } catch (ipError) {
        throw new Error(
          `Failed to configure static IP: ${ipError.message}`
        );
      }
    }
  }

  /**
   * Configure DHCP
   */
  async configureDhcp(interfaceName: string): Promise<void> {
    const exists = await this.interfaceExists(interfaceName);
    if (!exists) {
      throw new Error(`Interface ${interfaceName} does not exist`);
    }

    try {
      // Try NetworkManager
      await execAsync(`nmcli con mod ${interfaceName} ipv4.method auto`);
      await execAsync(`nmcli con up ${interfaceName}`);
    } catch (nmError) {
      // Fallback to dhclient
      try {
        await execAsync(`dhclient ${interfaceName}`);
      } catch (dhclientError) {
        throw new Error(
          `Failed to configure DHCP: ${dhclientError.message}`
        );
      }
    }
  }

  /**
   * Configure VLAN
   */
  async configureVlan(config: VlanConfig): Promise<void> {
    const vlanInterface = `${config.parentInterface}.${config.vlanId}`;

    try {
      // Create VLAN interface
      await execAsync(
        `ip link add link ${config.parentInterface} name ${vlanInterface} type vlan id ${config.vlanId}`
      );

      // Bring it up
      await execAsync(`ip link set ${vlanInterface} up`);

      // Configure IP if provided
      if (config.address && config.prefixLength) {
        await execAsync(
          `ip addr add ${config.address}/${config.prefixLength} dev ${vlanInterface}`
        );
      }
    } catch (error) {
      throw new Error(`Failed to configure VLAN: ${error.message}`);
    }
  }

  /**
   * Set DNS servers
   */
  async setDns(servers: string[]): Promise<void> {
    try {
      // Try systemd-resolved first
      const resolvConf = '/etc/systemd/resolved.conf';
      const dnsLine = `DNS=${servers.join(' ')}`;

      // Check if systemd-resolved is available
      try {
        await execAsync('systemctl is-active systemd-resolved');

        // Update resolved.conf
        await execAsync(
          `sed -i 's/^DNS=.*/DNS=${servers.join(' ')}/' ${resolvConf} || echo '${dnsLine}' >> ${resolvConf}`
        );

        // Restart systemd-resolved
        await execAsync('systemctl restart systemd-resolved');

        return;
      } catch {
        // systemd-resolved not available, fallback to /etc/resolv.conf
      }

      // Fallback: directly modify /etc/resolv.conf
      const resolvContent = servers
        .map(server => `nameserver ${server}`)
        .join('\n');

      await execAsync(`echo "${resolvContent}" > /etc/resolv.conf`);
    } catch (error) {
      throw new Error(`Failed to set DNS servers: ${error.message}`);
    }
  }

  /**
   * Set NTP servers
   */
  async setNtp(servers: string[]): Promise<void> {
    try {
      // Try systemd-timesyncd first
      try {
        await execAsync('systemctl is-active systemd-timesyncd');

        const ntpConf = '/etc/systemd/timesyncd.conf';
        const ntpLine = `NTP=${servers.join(' ')}`;

        await execAsync(
          `sed -i 's/^NTP=.*/NTP=${servers.join(' ')}/' ${ntpConf} || echo '${ntpLine}' >> ${ntpConf}`
        );

        await execAsync('systemctl restart systemd-timesyncd');

        return;
      } catch {
        // timesyncd not available
      }

      // Try chrony
      try {
        await execAsync('which chronyc');

        const chronyCon = '/etc/chrony/chrony.conf';
        const serverLines = servers
          .map(server => `server ${server} iburst`)
          .join('\n');

        // Backup and update chrony.conf
        await execAsync(`cp ${chronyCon} ${chronyCon}.bak`);
        await execAsync(`echo "${serverLines}" >> ${chronyCon}`);
        await execAsync('systemctl restart chronyd');

        return;
      } catch {
        // chrony not available
      }

      // Try ntpd as last resort
      try {
        await execAsync('which ntpd');

        const ntpConf = '/etc/ntp.conf';
        const serverLines = servers
          .map(server => `server ${server} iburst`)
          .join('\n');

        await execAsync(`cp ${ntpConf} ${ntpConf}.bak`);
        await execAsync(`echo "${serverLines}" >> ${ntpConf}`);
        await execAsync('systemctl restart ntpd');
      } catch {
        throw new Error('No NTP service available');
      }
    } catch (error) {
      throw new Error(`Failed to set NTP servers: ${error.message}`);
    }
  }

  /**
   * Ping a host
   */
  async ping(address: string, timeoutMs = 5000): Promise<PingResult> {
    try {
      const timeoutSec = Math.ceil(timeoutMs / 1000);
      const { stdout } = await execAsync(
        `ping -c 4 -W ${timeoutSec} ${address}`
      );

      // Parse latency from output
      const match = stdout.match(/rtt min\/avg\/max\/mdev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
      const latencyMs = match ? parseFloat(match[2]) : undefined;

      // Parse packet loss
      const lossMatch = stdout.match(/([\d.]+)% packet loss/);
      const packetLoss = lossMatch ? parseFloat(lossMatch[1]) : 0;

      return {
        reachable: true,
        latencyMs,
        packetLoss,
      };
    } catch (error) {
      return {
        reachable: false,
        error: error.message,
      };
    }
  }

  /**
   * Resolve DNS hostname
   */
  async resolveDns(hostname: string, timeoutMs = 5000): Promise<DnsResult> {
    const startTime = Date.now();

    try {
      const addresses = await Promise.race([
        dns.resolve4(hostname),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('DNS timeout')), timeoutMs)
        ),
      ]);

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        addresses,
        latencyMs,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Bring interface up
   */
  async interfaceUp(interfaceName: string): Promise<void> {
    try {
      await execAsync(`ip link set ${interfaceName} up`);
    } catch (error) {
      throw new Error(`Failed to bring interface up: ${error.message}`);
    }
  }

  /**
   * Bring interface down
   */
  async interfaceDown(interfaceName: string): Promise<void> {
    try {
      await execAsync(`ip link set ${interfaceName} down`);
    } catch (error) {
      throw new Error(`Failed to bring interface down: ${error.message}`);
    }
  }

  /**
   * Get default gateway
   */
  async getDefaultGateway(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('ip route show default');
      const match = stdout.match(/default via ([\d.]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if interface exists
   */
  async interfaceExists(interfaceName: string): Promise<boolean> {
    try {
      await execAsync(`ip link show ${interfaceName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse addresses from ip command output
   */
  private parseAddresses(addrInfo: any[]): NetworkAddress[] {
    return addrInfo
      .filter((addr: any) => addr.family === 'inet' || addr.family === 'inet6')
      .map((addr: any) => ({
        address: addr.local,
        prefixLength: addr.prefixlen,
        family: addr.family === 'inet' ? 'ipv4' : 'ipv6',
        scope: addr.scope,
      }));
  }

  /**
   * Detect interface type from name
   */
  private detectInterfaceType(name: string): 'physical' | 'virtual' | 'loopback' {
    if (name === 'lo') return 'loopback';
    if (name.startsWith('veth') || name.startsWith('br') || name.includes('.')) {
      return 'virtual';
    }
    return 'physical';
  }

  /**
   * Legacy interface listing (fallback)
   */
  private async listInterfacesLegacy(): Promise<NetworkInterface[]> {
    try {
      const { stdout } = await execAsync('ip addr show');
      const interfaces: NetworkInterface[] = [];
      
      // Basic parsing of text output
      const lines = stdout.split('\n');
      let currentInterface: Partial<NetworkInterface> | null = null;

      for (const line of lines) {
        const ifaceMatch = line.match(/^\d+: ([^:]+):/);
        if (ifaceMatch) {
          if (currentInterface) {
            interfaces.push(currentInterface as NetworkInterface);
          }
          currentInterface = {
            name: ifaceMatch[1].split('@')[0],
            type: this.detectInterfaceType(ifaceMatch[1]),
            status: line.includes('state UP') ? 'up' : 'down',
            addresses: [],
          };
        }

        if (currentInterface) {
          const addrMatch = line.match(/inet ([0-9.]+)\/(\d+)/);
          if (addrMatch) {
            currentInterface.addresses!.push({
              address: addrMatch[1],
              prefixLength: parseInt(addrMatch[2]),
              family: 'ipv4',
              scope: 'global',
            });
          }
        }
      }

      if (currentInterface) {
        interfaces.push(currentInterface as NetworkInterface);
      }

      return interfaces;
    } catch (error) {
      throw new Error(`Failed to list interfaces: ${error.message}`);
    }
  }
}
