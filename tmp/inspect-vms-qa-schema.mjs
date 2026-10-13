import { readFile } from 'node:fs/promises';
import pg from 'pg';
const env = await readFile(new URL('../.env.vms-qa', import.meta.url), 'utf8');
const password = /^VMS_QA_POSTGRES_PASSWORD=([a-f0-9]{64})$/m.exec(env)?.[1];
if (!password) throw new Error('QA credential unavailable.');
const db = new pg.Client({ host: '127.0.0.1', port: 55432, user: 'vms_qa', password, database: 'sentinel_test' });
await db.connect();
try {
  const tables = ['anpr_logistics_sessions', 'anpr_detection_points', 'anpr_logistics_violations', 'nbfc_watchlist_entries',
    'nbfc_watchlist_detections', 'device_health_snapshots', 'device_critical_issues', 'device_correlated_events', 'user_organizational_assignments'];
  const rows = await db.query(`SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name, ordinal_position`, [tables]);
  for (const table of tables) console.log(table, rows.rows.filter(row => row.table_name === table).map(row => `${row.column_name}:${row.data_type}`).join(', '));
} finally { await db.end(); }
