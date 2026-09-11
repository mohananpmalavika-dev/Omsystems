import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT id, username, email, role, status FROM users WHERE lower(username) = 'test' OR identity_subject = 'test';
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
