import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT role, action, resource_type, description FROM role_permissions WHERE role = 'company_admin';
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
