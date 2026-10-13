import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env.vms-qa');
let password;
try {
  const stored = await readFile(envPath, 'utf8');
  password = /^VMS_QA_POSTGRES_PASSWORD=([a-f0-9]{64})$/m.exec(stored)?.[1];
  if (!password) throw new Error('Invalid isolated QA credential file.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  password = randomBytes(32).toString('hex');
  await writeFile(envPath, `VMS_QA_POSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
}
const qaEnv = { ...process.env, VMS_QA_POSTGRES_PASSWORD: password, NODE_ENV: 'test',
  DATABASE_URL: `postgresql://vms_qa:${password}@127.0.0.1:55432/sentinel_test`,
  TEST_DATABASE_URL: `postgresql://vms_qa:${password}@127.0.0.1:55432/sentinel_test`,
  DATABASE_SSL: 'false', DB_SSL: 'false', DB_HOST: '127.0.0.1', DB_PORT: '55432',
  DB_NAME: 'sentinel_test', DB_USER: 'vms_qa', DB_PASSWORD: password,
  REDIS_URL: 'redis://127.0.0.1:56379', TEST_REDIS_URL: 'redis://127.0.0.1:56379', REDIS_HOST: '127.0.0.1', REDIS_PORT: '56379',
  NBFC_BACKGROUND_JOBS_ENABLED: 'false', SKIP_MIGRATION_CHECKSUM_VALIDATION: 'false',
  ENABLE_BANKING_ANALYTICS: 'false', ENABLE_FACE_RECOGNITION: 'false', ANALYTICS_REQUIRE_MODELS: 'false' };
// All database mutations below are constrained to this disposable local QA endpoint.
const target = new URL(qaEnv.DATABASE_URL);
if (target.hostname !== '127.0.0.1' || target.port !== '55432' || target.pathname !== '/sentinel_test' || target.username !== 'vms_qa') {
  throw new Error('Refusing a non-QA database target.');
}
async function command(file, args) {
  await new Promise((done, reject) => {
    const child = spawn(file, args, { cwd: root, env: qaEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => process.stdout.write(chunk));
    child.stderr.on('data', chunk => process.stdout.write(chunk));
    child.on('error', reject);
    child.on('close', code => code === 0 ? done() : reject(new Error(`${file} failed with exit code ${code}`)));
  });
}
const mode = process.argv[2] ?? 'start';
if (!['start', 'migrate', 'verify-migrations', 'smoke', 'test'].includes(mode)) throw new Error('Use start, migrate, verify-migrations, smoke, or test.');
if (mode === 'start') {
  await command('docker', ['compose', '--env-file', envPath, '-f', 'compose.vms-qa.yml', 'up', '--detach', '--wait', '--wait-timeout', '120']);
} else if (mode === 'migrate') {
  console.log('Applying migrations to isolated local QA database on port 55432.');
  await command(process.execPath, ['scripts/run-migrations.mjs']);
} else if (mode === 'verify-migrations') {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: qaEnv.DATABASE_URL });
  const database = `sentinel_migration_check_${randomBytes(6).toString('hex')}`;
  await client.connect();
  try { await client.query(`CREATE DATABASE "${database}"`); } finally { await client.end(); }
  qaEnv.DATABASE_URL = `postgresql://vms_qa:${password}@127.0.0.1:55432/${database}`;
  qaEnv.DB_NAME = database;
  console.log('Verifying the complete migration sequence in a newly created isolated QA database.');
  await command(process.execPath, ['scripts/run-migrations.mjs']);
  console.log('Rechecking migration checksums and idempotent runner completion.');
  await command(process.execPath, ['scripts/run-migrations.mjs']);
} else if (mode === 'smoke') {
  const files = ['test/ha/distributed-fencing.test.ts', 'test/app.test.ts', 'test/authorization.test.ts',
    'test/device-inventory.routes.test.ts', 'test/maintenance.routes.test.ts', 'test/live-view-flow.test.ts',
    'test/operational-health.test.ts', 'test/analog-dvr-channels.test.ts', 'test/enterprise-infrastructure.test.ts',
    'edge-agent/test/dvr-adapter.test.ts', 'edge-agent/test/analog-signal-quality.test.ts',
    'dashboard/test/control-proxy.test.ts', 'dashboard/test/proxy.test.ts', 'dashboard/test/recording-proxy.test.ts',
    'analytics-engine/test/app.test.ts', 'media-gateway/test/app.test.ts'];
  await command(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files, 'test/disk-health.test.ts', 'analytics-engine/test/statistics-lifecycle.test.ts', '--maxWorkers=1', '--hookTimeout=60000', '--testTimeout=60000',
    '--reporter=default', '--reporter=json', '--outputFile.json=reports/vms-smoke-2026-10-13.json']);
} else {
  const files = ['test/anpr-logistics.routes.test.ts', 'test/device-health-correlation.routes.test.ts', 'test/nbfc-watchlist.routes.test.ts',
    'test/communications/device-enrollment.test.ts', 'test/communications/call-first-answer-wins.test.ts',
    'test/communications/messaging-offline.test.ts', 'test/communications/security-isolation.test.ts'];
  const selected = process.argv.slice(3);
  if (selected.some(file => !files.includes(file))) throw new Error('Only declared isolated integration tests may run.');
  await command(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...(selected.length ? selected : files), '--maxWorkers=1', '--hookTimeout=60000',
    '--reporter=json', `--outputFile=${selected.length === 1 ? `reports/vms-qa-${selected[0].split('/').at(-1).replace('.test.ts', '')}-2026-10-13.json` : 'reports/vms-qa-integration-tests-2026-10-13.json'}`]);
}
