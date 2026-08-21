import { Pool } from 'pg';
import { HikvisionAxProIntegrationService } from '../../../backend/src/integrations/hikvision/axpro';

let pool: Pool | undefined;
let service: HikvisionAxProIntegrationService | undefined;

export function getHikvisionAxProIntegrationService(): HikvisionAxProIntegrationService {
  if (!service) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not configured');
    pool = new Pool({ connectionString });
    service = new HikvisionAxProIntegrationService(pool);
  }
  return service;
}

export function getConfiguredTenantId(): string {
  const tenantId = process.env.DEFAULT_TENANT_ID;
  if (!tenantId) throw new Error('DEFAULT_TENANT_ID is not configured');
  return tenantId;
}

export function requireSessionToken(request: Request & { cookies?: { get(name: string): { value?: string } | undefined } }): string {
  const token = request.cookies?.get('sentinel_access')?.value;
  if (!token) throw new Error('unauthenticated');
  return token;
}

