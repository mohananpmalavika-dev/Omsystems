import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT DISTINCT role FROM role_permissions;
SELECT * FROM role_permissions WHERE role = 'company_admin' LIMIT 5;
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
