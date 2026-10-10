import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AxProClient, AXPRO_MAX_BODY_BYTES, parseAxProPayload } from '../src/security-devices/integrations/hikvision/axpro/client.js';
import { mapAxProEvent, mapAxProHealth, resolveEventType } from '../src/security-devices/integrations/hikvision/axpro/mapper.js';
import { HikvisionAxProIntegrationService } from '../src/security-devices/integrations/hikvision/axpro/integration.service.js';
import { AxProPollingWorker } from '../src/security-devices/integrations/hikvision/axpro/polling-worker.js';
import type { AxProConnectionConfig } from '../src/security-devices/integrations/hikvision/axpro/types.js';

const integrationId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const tenantId = 'tenant-one';
const config: AxProConnectionConfig = { host: '192.168.1.10', port: 443, protocol: 'HTTPS', credentialSecretId: 'secret://branches/panel#credentials', branchId, pollingIntervalSeconds: 60, enabled: true };
const credentials = { username: 'installer', password: 'private-password' };
const context = { tenantId, branchId, deviceId: 'hub-1' };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('AX PRO transport', () => {
  it('negotiates digest without preemptive Basic and preserves endpoint queries', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 401, headers: { 'www-authenticate': 'Digest realm="panel", nonce="nonce", qop="auth", algorithm=SHA-256' } }))
      .mockResolvedValueOnce(new Response('{"DeviceInfo":{"model":"DS-PWA64-L-WB"}}'));
    const client = new AxProClient({ ...config, endpointPaths: { systemInfo: '/ISAPI/System/deviceInfo?format=json' } }, credentials, fetch);
    const result = await client.getSystemInfo();
    expect(fetch.mock.calls[0]?.[1].headers.Authorization).toBeUndefined();
    expect(fetch.mock.calls[0]?.[0]).toContain('?format=json');
    expect(fetch.mock.calls[0]?.[1].redirect).toBe('error');
    const header = fetch.mock.calls[1]?.[1].headers.Authorization as string;
    const cnonce = /cnonce="([^"]+)"/.exec(header)![1];
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const ha1 = hash('installer:panel:private-password');
    const ha2 = hash('GET:/ISAPI/System/deviceInfo?format=json');
    expect(header).toContain(`response="${hash(`${ha1}:nonce:00000001:${cnonce}:auth:${ha2}`)}"`);
    expect(result.data).toEqual({ DeviceInfo: { model: 'DS-PWA64-L-WB' } });
  });

  it('supports Basic only after a Basic challenge in auto mode', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 401, headers: { 'www-authenticate': 'Basic realm="panel"' } })).mockResolvedValueOnce(new Response('{}'));
    await new AxProClient(config, credentials, fetch).getSystemInfo();
    expect(fetch.mock.calls[1]?.[1].headers.Authorization).toBe(`Basic ${Buffer.from('installer:private-password').toString('base64')}`);
  });

  it('keeps the timeout active while the response body stalls', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } })));
    const pending = new AxProClient({ ...config, timeoutMs: 100 }, credentials, fetch).getSystemInfo();
    const assertion = expect(pending).rejects.toMatchObject({ code: 'AXPRO_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });

  it('rejects oversized streamed responses without a content-length header', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('x'.repeat(AXPRO_MAX_BODY_BYTES + 1)));
    await expect(new AxProClient(config, credentials, fetch).getSystemInfo()).rejects.toMatchObject({ code: 'AXPRO_PAYLOAD_TOO_LARGE' });
  });

  it.each(['host/path', 'host?other=true', 'user@host', 'host\\path', 'host#fragment'])('rejects an invalid host %s', host => {
    expect(() => new AxProClient({ ...config, host }, credentials)).toThrow('host must be');
  });
  it.each([0, -1, Number.NaN, 1_000_000])('rejects invalid timeout %s', timeoutMs => {
    expect(() => new AxProClient({ ...config, timeoutMs }, credentials)).toThrow('timeoutMs');
  });
  it('rejects insecure transport in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => new AxProClient({ ...config, protocol: 'HTTP' }, credentials)).toThrow('HTTP is disabled');
  });
  it('does not downgrade an unsupported digest qop', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 401, headers: { 'www-authenticate': 'Digest realm="panel", nonce="nonce", qop="auth-int"' } }));
    await expect(new AxProClient(config, credentials, fetch).getSystemInfo()).rejects.toMatchObject({ code: 'AXPRO_DIGEST_QOP_UNSUPPORTED' });
  });
  it('sanitizes network errors containing credentials', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('https://installer:private-password@host'));
    await expect(new AxProClient(config, credentials, fetch).getSystemInfo()).rejects.toThrow('AX PRO request could not be completed');
  });
});

describe('AX PRO mapping and payloads', () => {
  it.each([
    ['disarmed', 'ALARM_DISARMED'], ['armed', 'ALARM_ARMED'], ['tamperRestore', 'ALARM_CLEARED'],
    ['batteryRestored', 'ALARM_CLEARED'], ['zoneAlarm', 'ALARM_TRIGGERED'], ['unknown-code', 'AX_PRO_EVENT_UNMAPPED'],
    ['orangeObjectFire', 'AX_PRO_EVENT_UNMAPPED'], ['panic', 'PANIC_BUTTON_PRESSED'],
    ['fireTriggered', 'FIRE_ALARM_TRIGGERED'], ['smokeTriggered', 'SMOKE_DETECTED'],
  ])('maps %s to %s', (type, expected) => expect(resolveEventType({ eventType: type }).eventType).toBe(expected));
  it('keeps an inactive alarm as a clear event', () => expect(resolveEventType({ eventType: 'tamper', eventState: 'inactive' }).eventType).toBe('ALARM_CLEARED'));
  it('parses real ISAPI dateTime and does not mistake a panel serial for an event ID', () => {
    const first = mapAxProEvent({ serialNo: 'panel-1', eventType: 'motion', dateTime: '2026-10-10T09:00:00Z' }, context, config);
    const second = mapAxProEvent({ serialNo: 'panel-1', eventType: 'motion', dateTime: '2026-10-10T09:01:00Z' }, context, config);
    expect(first.occurredAt.toISOString()).toBe('2026-10-10T09:00:00.000Z');
    expect(first.metadata.idempotencyKey).not.toBe(second.metadata.idempotencyKey);
  });
  it('deduplicates payloads irrespective of key order or re-enrolled hub ID', () => {
    const first = mapAxProEvent({ eventType: 'motion', zoneId: '1', dateTime: '2026-10-10T09:00:00Z' }, context, config);
    const second = mapAxProEvent({ dateTime: '2026-10-10T09:00:00Z', zoneId: '1', eventType: 'motion' }, { ...context, deviceId: 'hub-2' }, config);
    expect(first.metadata.idempotencyKey).toBe(second.metadata.idempotencyKey);
  });
  it.each(['<bad>', '<!DOCTYPE foo [<!ENTITY foo "bar">]><foo>&foo;</foo>', 'not-json', ''])('rejects malformed payloads', body => expect(() => parseAxProPayload(body)).toThrow());
  it('does not treat absent battery voltage as zero', () => expect(mapAxProHealth({ batteryVoltage: null }).batteryVoltage).toBeUndefined());
  it('preserves XML zone IDs with leading zeroes while converting numeric health values', () => {
    const payload = parseAxProPayload('<EventNotificationAlert><eventId>00012</eventId><zoneId>007</zoneId><eventType>panic</eventType><dateTime>2026-10-10T09:00:00Z</dateTime></EventNotificationAlert>');
    const event = mapAxProEvent(payload, context, config);
    expect(event.metadata.axProDeviceId).toBe('007');
    expect(event.metadata.sourceEventId).toBe('00012');
    const health = mapAxProHealth(parseAxProPayload('<Status><online>0</online><batteryLevel>90</batteryLevel><tamper>1</tamper></Status>'));
    expect(health).toMatchObject({ isOnline: false, batteryLevelPercent: 90, tamper: true });
  });
  it('rejects deeply nested payloads before recursive mapping', () => {
    expect(() => parseAxProPayload('{"nested":'.repeat(100) + '{}' + '}'.repeat(100))).toThrow();
  });
});

function databaseFixture() {
  const row = { id: integrationId, tenant_id: tenantId, credential_ref_id: config.credentialSecretId, connection_config: { ...config, endpointPaths: { events: '/events' } }, status: 'ACTIVE', event_cursor_at: new Date('2026-10-10T09:00:00Z') };
  const hub = { id: 'hub-1', tenant_id: tenantId, branch_id: branchId, type: 'AX_PRO_HUB', status: 'ONLINE', metadata: { axProIntegrationId: integrationId, axProConfig: config } };
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT * FROM security_device_integrations')) return { rows: [row] };
    if (sql.includes('SELECT * FROM security_devices')) return { rows: [hub] };
    return { rows: [], rowCount: 1 };
  });
  const transactionQuery = vi.fn(async (sql: string) => {
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
    if (sql.includes('FOR UPDATE')) return { rows: [row] };
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn();
  const pool = { query, connect: vi.fn(async () => ({ query: transactionQuery, release })) };
  const service = new HikvisionAxProIntegrationService(pool as any);
  return { row, hub, query, transactionQuery, release, pool, service, adapter: (service as any).adapter };
}

describe('AX PRO ingestion and polling', () => {
  it('persists a signed event and its counters in a transaction', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const secret = 'a'.repeat(64);
    vi.stubEnv('AXPRO_RECEIVER_SECRETS', JSON.stringify({ [`${tenantId}:${integrationId}`]: secret }));
    const db = databaseFixture();
    const body = JSON.stringify({ eventId: '1', eventType: 'panic', zoneId: '7' });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    expect(await db.service.ingestReceiverEvent(tenantId, integrationId, body, 'application/json', signature, timestamp)).toEqual({ accepted: 1, ignored: 0 });
    const calls = db.transactionQuery.mock.calls as unknown as [string, any[]][];
    expect(calls[0]?.[0]).toBe('BEGIN');
    expect(calls.at(-1)?.[0]).toBe('COMMIT');
    const insertion = calls.find(([sql]) => sql.includes('INSERT INTO security_device_events'))!;
    expect(JSON.parse(insertion[1][12])).toMatchObject({ axProIntegrationId: integrationId });
    const counters = calls.find(([sql]) => sql.includes('events_processed_today'))!;
    expect(counters[1]).toEqual([tenantId, integrationId, 1, null]);
  });

  it('rolls back event batches before counters can advance on an insertion failure', async () => {
    const db = databaseFixture();
    db.transactionQuery.mockImplementation(async sql => {
      if (sql.includes('FOR UPDATE')) return { rows: [db.row] } as any;
      if (sql.includes('INSERT INTO')) throw new Error('storage failure');
      return { rows: [], rowCount: 1 };
    });
    const event = mapAxProEvent({ eventId: '1', eventType: 'panic' }, context, config);
    await expect((db.service as any).persistResolvedEvents(tenantId, integrationId, [event])).rejects.toThrow('storage failure');
    expect(db.transactionQuery.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(db.transactionQuery.mock.calls.some(([sql]) => sql.includes('events_processed_today'))).toBe(false);
    expect(db.release).toHaveBeenCalled();
  });

  it('does not count duplicates again', async () => {
    const db = databaseFixture();
    db.transactionQuery.mockImplementation(async sql => ({ rows: sql.includes('FOR UPDATE') ? [db.row] : [], rowCount: sql.includes('INSERT INTO') ? 0 : 1 }));
    expect(await (db.service as any).persistResolvedEvents(tenantId, integrationId, [mapAxProEvent({ eventId: '1', eventType: 'panic' }, context, config)])).toBe(0);
  });

  it.each(['bad', 'a'.repeat(64) + 'nonhex'])('rejects malformed signatures without database access', async signature => {
    vi.stubEnv('AXPRO_RECEIVER_SHARED_SECRET', 'a'.repeat(64));
    const db = databaseFixture();
    await expect(db.service.ingestReceiverEvent(tenantId, integrationId, '{}', 'application/json', signature, String(Math.floor(Date.now() / 1000)))).rejects.toMatchObject({ status: 401 });
    expect(db.query).not.toHaveBeenCalled();
  });
  it('refuses a global receiver secret in production', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AXPRO_RECEIVER_SHARED_SECRET', 'a'.repeat(64)); vi.stubEnv('AXPRO_RECEIVER_SECRETS', '{}');
    await expect(databaseFixture().service.ingestReceiverEvent(tenantId, integrationId, '{}', '', 'a'.repeat(64), '1234567890')).rejects.toMatchObject({ status: 503 });
  });
  it('rejects expired signed timestamps', async () => {
    vi.stubEnv('AXPRO_RECEIVER_SHARED_SECRET', 'a'.repeat(64));
    const db = databaseFixture();
    await expect(db.service.ingestReceiverEvent(tenantId, integrationId, '{}', '', 'a'.repeat(64), String(Math.floor(Date.now() / 1000) - 301))).rejects.toMatchObject({ status: 401 });
  });
  it('rejects disabled integrations', async () => {
    const db = databaseFixture(); db.row.connection_config.enabled = false;
    await expect(db.service.poll(tenantId, integrationId)).rejects.toMatchObject({ status: 409 });
    expect(db.pool.connect).not.toHaveBeenCalled();
  });
  it('uses an independent cursor with overlap and releases its replica lock', async () => {
    const db = databaseFixture();
    vi.spyOn(db.adapter, 'getHealth').mockResolvedValue({ health: 'GOOD', healthScore: 90, isOnline: true, capturedAt: new Date(), metadata: {} });
    const getEvents = vi.spyOn(db.adapter, 'getEvents').mockResolvedValue([]);
    await db.service.poll(tenantId, integrationId);
    expect(getEvents.mock.calls[0]?.[1]).toEqual(new Date('2026-10-10T08:59:30Z'));
    expect(db.transactionQuery.mock.calls.some(([sql]) => sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(db.transactionQuery.mock.calls.some(([sql]) => sql.includes('event_cursor_at'))).toBe(true);
  });
  it('skips a concurrent poll without calling the panel', async () => {
    const db = databaseFixture(); db.transactionQuery.mockResolvedValue({ rows: [{ acquired: false }] } as any);
    const getHealth = vi.spyOn(db.adapter, 'getHealth');
    expect(await db.service.poll(tenantId, integrationId)).toMatchObject({ skipped: 'already_polling' });
    expect(getHealth).not.toHaveBeenCalled();
    expect(db.release).toHaveBeenCalled();
  });
  it('does not move the event cursor during a connection test', async () => {
    const db = databaseFixture(); vi.spyOn(db.adapter, 'testConnection').mockResolvedValue({ success: true });
    await db.service.test(tenantId, integrationId);
    expect(db.query.mock.calls.every(([sql]) => !sql.includes('event_cursor_at =') && !sql.includes('last_sync_at ='))).toBe(true);
  });
  it('checks tenant ownership before creating an integration', async () => {
    const db = databaseFixture();
    await expect(db.service.create(tenantId, { ...config, name: 'Panel' })).rejects.toMatchObject({ status: 404 });
    expect(db.query.mock.calls[0]?.[0]).toContain('tenant_id::text = $2');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
  });
  it('continues the worker after one panel fails', async () => {
    const db = databaseFixture();
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{ id: 'one', tenant_id: tenantId }, { id: 'two', tenant_id: tenantId }] }) };
    const poll = vi.spyOn(db.service, 'poll').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ integrationId: 'two', eventsProcessed: 0 });
    const logger = { error: vi.fn() };
    await new AxProPollingWorker(pool as any, db.service, logger).runOnce();
    expect(poll).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
  it('leaves database capacity for transactions when the pool is small', async () => {
    const db = databaseFixture();
    const pool = { options: { max: 2 }, query: vi.fn().mockResolvedValue({ rows: Array.from({ length: 5 }, (_, i) => ({ id: String(i), tenant_id: tenantId })) }) };
    let active = 0; let maximum = 0;
    vi.spyOn(db.service, 'poll').mockImplementation(async (_, id) => {
      active++; maximum = Math.max(maximum, active);
      await Promise.resolve(); active--;
      return { integrationId: id, eventsProcessed: 0 };
    });
    await new AxProPollingWorker(pool as any, db.service, { error: vi.fn() }).runOnce();
    expect(maximum).toBe(1);
  });
});
