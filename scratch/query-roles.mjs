import { runSSM } from './run-ssm.mjs';

const sql = `SELECT id, tenant_id, name, base_role, jsonb_array_length(menu_access) as menu_count FROM custom_roles;`;
const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid -c "${sql}"`;
await runSSM(cmd);
