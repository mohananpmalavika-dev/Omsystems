import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT id, username, identity_subject, email, role, status, must_change_password, custom_role_id 
FROM users;
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
