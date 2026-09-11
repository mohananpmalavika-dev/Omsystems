import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT pid, now() - query_start AS duration, state, query, wait_event_type, wait_event
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;
`;

const cmd = `docker exec sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql.replace(/\n/g, ' ')}"`;

await runSSM(cmd);
