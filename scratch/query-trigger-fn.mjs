import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'auto_grant_role_permissions' OR proname LIKE '%role_permissions%';
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
