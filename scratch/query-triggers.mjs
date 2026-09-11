import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT event_object_table, trigger_name, action_timing, event_manipulation 
FROM information_schema.triggers 
WHERE event_object_table IN ('users', 'user_organizational_assignments', 'access_grants');
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
