import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Disposable local PostgreSQL only. No DATABASE_URL, production credentials,
// host ports, or persistent volumes are used.
const container = `sentinel-axpro-migration-test-${process.pid}`;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Docker test command failed');
  return result.stdout;
}
function sql(query) { return docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], query); }
let created = false;
try {
  docker(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=axpro-test-only', 'postgres:17-alpine']);
  created = true;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { docker(['exec', container, 'pg_isready', '-U', 'postgres']); break; }
    catch { if (attempt === 29) throw new Error('Test PostgreSQL did not become ready'); await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  sql('CREATE TABLE branches (id UUID PRIMARY KEY, tenant_id UUID NOT NULL);');
  const filenames = ['091_axpro_schema_prerequisites.sql', '092_hikvision_axpro_event_idempotency.sql', '146_security_devices_schema.sql', '20261010_axpro_production_runtime.sql'];
  for (const filename of filenames) sql(readFileSync(fileURLToPath(new URL(`../database/migrations/${filename}`, import.meta.url)), 'utf8'));
  // Reapplying the new migrations must also be harmless.
  for (const filename of [filenames[0], filenames[3]]) sql(readFileSync(fileURLToPath(new URL(`../database/migrations/${filename}`, import.meta.url)), 'utf8'));
  const result = sql(`
    INSERT INTO branches VALUES ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
    INSERT INTO security_devices (id, tenant_id, branch_id, type, name, enrollment_status)
      VALUES ('44444444-4444-4444-8444-444444444444', 'tenant-one', '22222222-2222-4222-8222-222222222222', 'AX_PRO_HUB', 'AX PRO test', 'APPROVED');
    INSERT INTO security_device_integrations (id, tenant_id, name, adapter_name, adapter_version, protocol, credential_ref_id, connection_config)
      VALUES ('11111111-1111-4111-8111-111111111111', 'tenant-one', 'Panel', 'HIKVISION_AX_PRO', '1.0', 'AX_PRO', 'secret://branch#credentials', '{"enabled":true}');
    INSERT INTO security_device_events (tenant_id, device_id, event_type, severity, title, metadata)
      SELECT 'tenant-one', '44444444-4444-4444-8444-444444444444', 'PANIC_BUTTON_PRESSED', 'P1', 'Panic',
      '{"source":"hikvision-ax-pro","axProIntegrationId":"11111111-1111-4111-8111-111111111111","idempotencyKey":"HIKVISION_AX_PRO:hub:1"}'::jsonb
      FROM generate_series(1, 2) ON CONFLICT DO NOTHING;
    DO $$ BEGIN
      IF (SELECT count(*) FROM security_device_events) <> 1 THEN RAISE EXCEPTION 'Duplicate events were inserted'; END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'security_device_integrations' AND column_name = 'event_cursor_at') THEN RAISE EXCEPTION 'Missing polling cursor'; END IF;
    END $$;
    SELECT pg_try_advisory_lock(hashtextextended('axpro:tenant-one:11111111-1111-4111-8111-111111111111',0));
    SELECT pg_advisory_unlock(hashtextextended('axpro:tenant-one:11111111-1111-4111-8111-111111111111',0));
  `);
  console.log('AX PRO migrations passed: fresh ordering, replay, P1 severity, durable deduplication, cursor columns, advisory locks.');
} finally {
  if (created) docker(['rm', '--force', container]);
}
