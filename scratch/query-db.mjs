import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT id, tenant_id, name, node_type, code FROM resource_nodes;
SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'user_role';
SELECT id, username, email, role, status, tenant_id FROM users;
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
