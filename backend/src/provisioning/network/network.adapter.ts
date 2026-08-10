/**
 * Network Adapter Interface
 * Abstraction for network configuration operations
 */

export interface NetworkInterface {
  name: string;
  type: 'physical' | 'virtual' | 'loopback';
  mac?: string;
  status: 'up' | 'down' | 'unknown';
  addresses: NetworkAddress[];
  mtu?: number;
  speed?: string;
}

export interface NetworkAddress {
  address: string;
  prefixLength: number;
  family: 'ipv4' | 'ipv6';
  scope: 'global' | 'link' | 'host';
}

export interface StaticIpConfig {
  address: string;
  prefixLength: number;
  gateway?: string;
}

export interface VlanConfig {
  vlanId: number;
  parentInterface: string;
  address?: string;
  prefixLength?: number;
}

export interface PingResult {
  reachable: boolean;
  latencyMs?: number;
  packetLoss?: number;
  error?: string;
}

export interface DnsResult {
  success: boolean;
  addresses?: string[];
  latencyMs?: number;
  error?: string;
}

/**
 * Network adapter interface for platform-specific implementations
 */
export interface NetworkAdapter {
  /**
   * List all network interfaces
   */
  listInterfaces(): Promise<NetworkInterface[]>;

  /**
   * Configure static IP address on an interface
   */
  configureStaticAddress(
    interfaceName: string,
    config: StaticIpConfig
  ): Promise<void>;

  /**
   * Configure DHCP on an interface
   */
  configureDhcp(interfaceName: string): Promise<void>;

  /**
   * Configure VLAN
   */
  configureVlan(config: VlanConfig): Promise<void>;

  /**
   * Set DNS servers
   */
  setDns(servers: string[]): Promise<void>;

  /**
   * Set NTP servers
   */
  setNtp(servers: string[]): Promise<void>;

  /**
   * Ping a host
   */
  ping(address: string, timeoutMs?: number): Promise<PingResult>;

  /**
   * Resolve DNS hostname
   */
  resolveDns(hostname: string, timeoutMs?: number): Promise<DnsResult>;

  /**
   * Bring interface up
   */
  interfaceUp(interfaceName: string): Promise<void>;

  /**
   * Bring interface down
   */
  interfaceDown(interfaceName: string): Promise<void>;

  /**
   * Get default gateway
   */
  getDefaultGateway(): Promise<string | null>;

  /**
   * Check if interface exists
   */
  interfaceExists(interfaceName: string): Promise<boolean>;
}
