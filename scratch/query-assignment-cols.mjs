import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_organizational_assignments' 
ORDER BY ordinal_position;
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
