export interface CameraCredential {
  username: string;
  password: string;
  updatedAt: string;
}

interface DiscoveryBootstrapClient {
  getDiscoveryBootstrap(agentId: string): Promise<{
    credentials: Array<{ host?: string; username: string; password: string | null; updatedAt: string }>;
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
    return this.cache.get(`host:${host}`);
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

  invalidate() {
    this.cache.clear();
    this.vpnScanNetworks = [];
    this.lastRefresh = 0;
  }

  private async refreshCache() {
    const bootstrap = await this.control.getDiscoveryBootstrap(this.edgeAgentId);
    this.cache.clear();
    for (const item of bootstrap.credentials) {
      // Discovery credentials are device-scoped. Never try a branch default
      // against unrelated cameras or recorders on the LAN.
      if (!item.host) continue;
      const credential: CameraCredential = {
        username: item.username,
        password: item.password ?? "",
        updatedAt: item.updatedAt,
      };
      this.cache.set(`host:${item.host}`, credential);
    }
    this.vpnScanNetworks = bootstrap.vpnScanNetworks;
    this.lastRefresh = Date.now();
  }
}
