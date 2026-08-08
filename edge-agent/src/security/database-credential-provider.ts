import pg from 'pg';
const { Client } = pg;

export interface CameraCredential {
  username: string;
  password: string;
  updatedAt: string;
}

export class DatabaseCredentialProvider {
  private client: pg.Client | null = null;
  private cache: Map<string, CameraCredential> = new Map();
  private lastRefresh = 0;
  private readonly CACHE_TTL_MS = 60_000; // 1 minute

  constructor(
    private readonly databaseUrl: string,
    private readonly branchId: string,
    private readonly edgeAgentId: string
  ) {}

  async connect() {
    if (this.client) return;
    
    this.client = new Client({
      connectionString: this.databaseUrl,
      ssl: { rejectUnauthorized: false }
    });
    
    await this.client.connect();
  }

  async get(host: string): Promise<CameraCredential | undefined> {
    // Refresh cache if expired
    if (Date.now() - this.lastRefresh > this.CACHE_TTL_MS) {
      await this.refreshCache();
    }

    // Try host-specific credential first
    const hostKey = `host:${host}`;
    if (this.cache.has(hostKey)) {
      return this.cache.get(hostKey);
    }

    // Fall back to default credential
    return this.cache.get('default');
  }

  private async refreshCache() {
    if (!this.client) await this.connect();

    try {
      const result = await this.client!.query(
        `SELECT username, password, ip_address, updated_at 
         FROM camera_credentials 
         WHERE branch_id = $1 AND edge_agent_id = $2
         ORDER BY ip_address NULLS LAST`,
        [this.branchId, this.edgeAgentId]
      );

      this.cache.clear();

      for (const row of result.rows) {
        const credential: CameraCredential = {
          username: row.username,
          password: row.password,
          updatedAt: row.updated_at
        };

        if (row.ip_address) {
          this.cache.set(`host:${row.ip_address}`, credential);
        } else {
          this.cache.set('default', credential);
        }
      }

      this.lastRefresh = Date.now();
    } catch (error) {
      console.error('Failed to refresh credentials from database:', error);
      // Keep using cached credentials on error
    }
  }

  async close() {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
