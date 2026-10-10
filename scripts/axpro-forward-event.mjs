import { createHmac } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Receiver-side bridge hook: the upstream ARC receiver owns its durable queue
// and invokes this after decoding a vendor event. A nonzero exit requires retry.
export async function forwardAxProEvent(filename, environment = process.env, fetchImpl = fetch) {
  if (!filename) throw new Error('Usage: node scripts/axpro-forward-event.mjs <normalized-event.json>');
  let base;
  try { base = new URL(environment.AXPRO_FORWARD_BASE_URL || ''); }
  catch { throw new Error('AXPRO_FORWARD_BASE_URL must be an HTTPS URL'); }
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('AXPRO_FORWARD_BASE_URL must be an HTTPS URL');
  const tenantId = environment.AXPRO_FORWARD_TENANT_ID;
  const integrationId = environment.AXPRO_FORWARD_INTEGRATION_ID;
  const secret = environment.AXPRO_FORWARD_SECRET;
  if (!tenantId || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(integrationId || '') || !secret || secret.length < 32) throw new Error('Configure AXPRO_FORWARD_TENANT_ID, AXPRO_FORWARD_INTEGRATION_ID, and AXPRO_FORWARD_SECRET (at least 32 characters)');
  if (statSync(filename).size > 1_048_576) throw new Error('Event file exceeds 1 MiB');
  const body = readFileSync(filename, 'utf8');
  if (Buffer.byteLength(body) > 1_048_576) throw new Error('Event file exceeds 1 MiB');
  const payload = JSON.parse(body);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.eventId !== 'string' || !payload.eventId.trim() || typeof payload.eventType !== 'string' || !payload.eventType.trim() || typeof payload.dateTime !== 'string' || Number.isNaN(Date.parse(payload.dateTime))) throw new Error('Normalized events require a stable string eventId, eventType, and valid dateTime');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const response = await fetchImpl(new URL(`/api/security-devices/integrations/${integrationId}/events`, base), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), body,
    headers: { 'content-type': 'application/json', 'x-sentinel-tenant-id': tenantId,
      'x-sentinel-axpro-timestamp': timestamp, 'x-sentinel-axpro-signature': `sha256=${signature}` },
  });
  await response.body?.cancel();
  if (response.status !== 202) throw new Error(`Forwarding rejected with HTTP ${response.status}; retain the queued event for retry`);
  return { accepted: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await forwardAxProEvent(process.argv[2]);
    console.log('AX PRO event accepted. The upstream receiver may complete delivery.');
  } catch {
    // Preserve the durable source file and do not expose secrets, raw payloads,
    // file paths or upstream exception details in receiver logs.
    console.error('AX PRO event forwarding failed; check configuration and retain the queued event for retry.');
    process.exitCode = 1;
  }
}
