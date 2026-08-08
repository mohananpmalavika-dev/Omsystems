export interface CameraCredential {
  username: string;
  password: string;
  updatedAt: string;
}

interface DiscoveryBootstrapClient {
  getDiscoveryBootstrap(agentId: string): Promise<{
    credentials: Array<{ host?: string; username: string; password: string; updatedAt: string }>;
    vpnScanNetworks: string[];
  }>;
}

export class DatabaseCredentialProvider {
  private cache: Map<string, CameraCredential> = new Map();
  private vpnScanNetworks: string[] = [];
  private lastRefresh = 0;
  private readonly cacheTtlMs = 60_000;

  constructor(
    private readonly control: DiscoveryBootstrapClient,
    private readonly edgeAgentId: string,
  ) {}

  async get(host: string): Promise<CameraCredential | undefined> {
    if (Date.now() - this.lastRefresh > this.cacheTtlMs) {
      await this.refreshCache();
    }
    const hostKey = `host:${host}`;
    return this.cache.get(hostKey) ?? this.cache.get("default");
  }

  async getVpnScanNetworks() {
    if (Date.now() - this.lastRefresh > this.cacheTtlMs) await this.refreshCache();
    return this.vpnScanNetworks;
  }

  async getKnownHosts() {
    if (Date.now() - this.lastRefresh > this.cacheTtlMs) await this.refreshCache();
    return [...this.cache.keys()]
      .filter((key) => key.startsWith("host:"))
      .map((key) => key.slice("host:".length));
  }

  private async refreshCache() {
    const bootstrap = await this.control.getDiscoveryBootstrap(this.edgeAgentId);
    this.cache.clear();
    for (const item of bootstrap.credentials) {
      const credential: CameraCredential = {
        username: item.username,
        password: item.password,
        updatedAt: item.updatedAt,
      };
      this.cache.set(item.host ? `host:${item.host}` : "default", credential);
    }
    this.vpnScanNetworks = bootstrap.vpnScanNetworks;
    this.lastRefresh = Date.now();
  }
}
