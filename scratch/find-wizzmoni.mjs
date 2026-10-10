import { execSync } from 'child_process';

const sql = `
-- 1. Check organizations / tenants matching wizzmoni
SELECT id, name, slug FROM organizations WHERE name ILIKE '%wizz%' OR slug ILIKE '%wizz%';

-- 2. Check tenants table
SELECT id, name, slug FROM tenants WHERE name ILIKE '%wizz%' OR slug ILIKE '%wizz%';

-- 3. Check all organizations
SELECT id, name, slug FROM organizations;

-- 4. Check all tenants
SELECT id, name, slug FROM tenants;

-- 5. Check resource_nodes
SELECT id, name, node_type, tenant_id FROM resource_nodes WHERE name ILIKE '%wizz%';
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
