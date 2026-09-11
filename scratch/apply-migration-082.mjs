import { readFileSync } from 'fs';
import { runSSM } from './run-ssm.mjs';

const sql = readFileSync('database/migrations/082_fix_company_admin_scoping.sql', 'utf-8');
const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;

console.log('Applying migration 082 to PostgreSQL container...');
await runSSM(cmd);
console.log('Done.');
