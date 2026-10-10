import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forwardAxProEvent } from '../scripts/axpro-forward-event.mjs';

const directories: string[] = [];
const environment = {
  AXPRO_FORWARD_BASE_URL: 'https://dashboard.example',
  AXPRO_FORWARD_TENANT_ID: 'tenant-one',
  AXPRO_FORWARD_INTEGRATION_ID: '11111111-1111-4111-8111-111111111111',
  AXPRO_FORWARD_SECRET: 'a'.repeat(64),
};
const event = { eventId: '00001', eventType: 'panic', zoneId: '007', dateTime: '2026-10-10T15:30:00+05:30' };
function file(body = JSON.stringify(event, null, 2)) {
  const directory = mkdtempSync(join(tmpdir(), 'axpro-forward-test-'));
  directories.push(directory);
  const path = join(directory, 'event.json');
  writeFileSync(path, body);
  return path;
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true }); });

describe('AX PRO receiver forwarding', () => {
  it('signs the original file bytes with the configured integration secret', async () => {
    const path = file();
    const original = readFileSync(path, 'utf8');
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    expect(await forwardAxProEvent(path, environment, fetch)).toEqual({ accepted: true });
    const [url, options] = fetch.mock.calls[0]!;
    expect(url.toString()).toBe(`https://dashboard.example/api/security-devices/integrations/${environment.AXPRO_FORWARD_INTEGRATION_ID}/events`);
    expect(options.body).toBe(original);
    expect(options.redirect).toBe('error');
    expect(options.headers['x-sentinel-tenant-id']).toBe(environment.AXPRO_FORWARD_TENANT_ID);
    const timestamp = options.headers['x-sentinel-axpro-timestamp'];
    expect(options.headers['x-sentinel-axpro-signature']).toBe(`sha256=${createHmac('sha256', environment.AXPRO_FORWARD_SECRET).update(`${timestamp}.${original}`).digest('hex')}`);
    expect(readFileSync(path, 'utf8')).toBe(original);
  });
  it.each([401, 409, 413, 500, 503])('leaves the event queued on HTTP %s', async status => {
    const path = file(); const original = readFileSync(path, 'utf8');
    await expect(forwardAxProEvent(path, environment, vi.fn().mockResolvedValue(new Response('{}', { status })))).rejects.toThrow(`HTTP ${status}`);
    expect(readFileSync(path, 'utf8')).toBe(original);
  });
  it('leaves the event queued on a network timeout', async () => {
    const path = file();
    await expect(forwardAxProEvent(path, environment, vi.fn().mockRejectedValue(new Error('timeout')))).rejects.toThrow();
    expect(readFileSync(path, 'utf8')).toContain('00001');
  });
  it('rejects oversized files before attempting delivery', async () => {
    const fetch = vi.fn();
    await expect(forwardAxProEvent(file('x'.repeat(1_048_577)), environment, fetch)).rejects.toThrow('1 MiB');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{ ...event, dateTime: 'invalid' }, { ...event, eventId: '' }, { ...event, eventType: 123 }, [event]])('rejects invalid normalized records', async payload => {
    const fetch = vi.fn();
    await expect(forwardAxProEvent(file(JSON.stringify(payload)), environment, fetch)).rejects.toThrow('Normalized events require');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects insecure forwarding without leaking URL credentials', async () => {
    await expect(forwardAxProEvent(file(), { ...environment, AXPRO_FORWARD_BASE_URL: 'http://username:private@host' }, vi.fn())).rejects.toThrow('must be an HTTPS URL');
  });
});
