import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock('../dashboard/lib/backend', () => ({ getCurrentUser: mocks.getCurrentUser }));
import { requireAxProTenant, axProApiError } from '../dashboard/lib/backend/hikvision-axpro';
import { AxProError } from '../src/security-devices/integrations/hikvision/axpro/errors';
import { readAxProBody } from '../src/security-devices/integrations/hikvision/axpro/client';

const authenticated = (method = 'GET', headers: Record<string, string> = {}) => new NextRequest('https://dashboard.example/api/security-devices/integrations', { method, headers: { cookie: 'sentinel_access=opaque-session', ...headers } });

beforeEach(() => { mocks.getCurrentUser.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

describe('AX PRO API authorization', () => {
  it('does not accept cookie presence as authenticated identity', async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error('unauthenticated'));
    const error = await requireAxProTenant(authenticated()).catch(error => error);
    expect(error).toMatchObject({ status: 401 });
  });
  it('uses the verified tenant instead of DEFAULT_TENANT_ID', async () => {
    vi.stubEnv('DEFAULT_TENANT_ID', 'another-tenant');
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', tenantId: 'verified-tenant', role: 'company_admin' });
    expect(await requireAxProTenant(authenticated())).toBe('verified-tenant');
    expect(mocks.getCurrentUser).toHaveBeenCalledWith('opaque-session');
  });
  it.each(['operator', 'viewer', 'branch_manager', undefined])('rejects role %s', async role => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'person', tenantId: 'tenant', role });
    await expect(requireAxProTenant(authenticated('POST'))).rejects.toMatchObject({ status: 403 });
  });
  it('rejects an administrator without tenant identity', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', role: 'super_admin' });
    await expect(requireAxProTenant(authenticated())).rejects.toMatchObject({ status: 403 });
  });
  it('blocks setup until a mandatory password change is complete', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', tenantId: 'tenant', role: 'super_admin', mustChangePassword: true });
    await expect(requireAxProTenant(authenticated('POST'))).rejects.toMatchObject({ status: 403 });
  });
  it('rejects cross-site writes before verifying the session', async () => {
    await expect(requireAxProTenant(authenticated('POST', { origin: 'https://foreign.example' }))).rejects.toMatchObject({ status: 403 });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });
  it('accepts the configured public origin behind a reverse proxy', async () => {
    vi.stubEnv('PUBLIC_DASHBOARD_URL', 'https://public.example');
    mocks.getCurrentUser.mockResolvedValue({ id: 'admin', tenantId: 'tenant', role: 'company_admin' });
    const request = new NextRequest('http://dashboard:10000/api/security-devices/integrations', { method: 'POST', headers: { cookie: 'sentinel_access=opaque-session', origin: 'https://public.example' } });
    expect(await requireAxProTenant(request)).toBe('tenant');
  });
  it('does not leak database or secret provider error details', async () => {
    const response = axProApiError(new Error('postgres://user:secret@private-database'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret');
  });
  it('returns the specific receiver error status', () => expect(axProApiError(new AxProError('AXPRO_PAYLOAD_TOO_LARGE', 'Too large', 413)).status).toBe(413));
  it('bounds an inbound request without content-length', async () => {
    const request = new NextRequest('https://dashboard.example/events', { method: 'POST', body: 'x'.repeat(1_048_577) });
    await expect(readAxProBody(request)).rejects.toMatchObject({ status: 413 });
  });
});
