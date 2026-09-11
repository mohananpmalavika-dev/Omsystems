import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT id, name, description, base_role, menu_access FROM custom_roles WHERE name = 'Admin';
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
