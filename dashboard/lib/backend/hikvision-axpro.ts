import { NextResponse } from 'next/server';
import { createPool } from '../../../src/database/pool';
import { HikvisionAxProIntegrationService } from '../../../src/security-devices/integrations/hikvision/axpro';
import { AxProError } from '../../../src/security-devices/integrations/hikvision/axpro/errors';
import { getCurrentUser } from '../backend';

let service: HikvisionAxProIntegrationService | undefined;

export function getHikvisionAxProIntegrationService(): HikvisionAxProIntegrationService {
  if (!service) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not configured');
    const pool = createPool(connectionString);
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

export async function requireAxProTenant(request: Request & { cookies?: { get(name: string): { value?: string } | undefined } }): Promise<string> {
  const token = requireSessionToken(request);
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    const expectedOrigins = new Set([new URL(request.url).origin]);
    if (process.env.PUBLIC_DASHBOARD_URL) expectedOrigins.add(new URL(process.env.PUBLIC_DASHBOARD_URL).origin);
    if ((origin && !expectedOrigins.has(origin)) || request.headers.get('sec-fetch-site') === 'cross-site') {
      throw new AxProError('AXPRO_FORBIDDEN', 'Cross-site integration requests are forbidden', 403);
    }
  }
  let user;
  try { user = await getCurrentUser(token); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/unauthenticated|invalid.*token|expired|session|authenticated_user_unavailable/i.test(message)) throw new AxProError('AXPRO_UNAUTHENTICATED', 'Authentication required', 401);
    throw new AxProError('AXPRO_AUTH_UNAVAILABLE', 'Session validation is unavailable', 503);
  }
  if (!user.tenantId || user.mustChangePassword || !['super_admin', 'company_admin', 'hq_admin'].includes(user.role || '')) {
    throw new AxProError('AXPRO_FORBIDDEN', 'A tenant administrator is required to manage AX PRO integrations', 403);
  }
  return user.tenantId;
}

export function axProApiError(error: unknown): NextResponse {
  if (error instanceof AxProError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status || 502 });
  const message = error instanceof Error ? error.message : '';
  if (message === 'unauthenticated') return NextResponse.json({ error: 'unauthenticated', message: 'Authentication required' }, { status: 401 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'invalid_request', message: 'Invalid JSON request' }, { status: 400 });
  if (/required|must be|disabled|between|format/.test(message)) return NextResponse.json({ error: 'invalid_request', message }, { status: 400 });
  return NextResponse.json({ error: 'axpro_unavailable', message: 'AX PRO integration is unavailable' }, { status: 503 });
}

