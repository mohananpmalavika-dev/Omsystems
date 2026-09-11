import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT count(*) FROM operational_telemetry;
`;

const cmd = `docker exec sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql.replace(/\n/g, ' ')}"`;

await runSSM(cmd);
