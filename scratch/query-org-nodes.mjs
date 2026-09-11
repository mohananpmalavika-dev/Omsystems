import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT id, tenant_id, name, node_type, path FROM resource_nodes WHERE node_type IN ('company', 'headquarters', 'zone', 'region', 'branch');
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
