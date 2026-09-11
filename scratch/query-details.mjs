import { runSSM } from './run-ssm.mjs';

const sql = `
SELECT id, tenant_id, name, base_role FROM custom_roles;
SELECT * FROM resource_nodes WHERE id = 'bdaaa612-3fff-4e17-8a9d-e71f11d9bbce';
SELECT u.id, u.username, u.role, uoa.scope_node_id, rn.name as org_name
FROM users u
LEFT JOIN user_organizational_assignments uoa ON uoa.user_id = u.id
LEFT JOIN resource_nodes rn ON rn.id = uoa.scope_node_id;
`;

const cmd = `docker exec -i sentinel-aws-postgres psql -U sentinel_admin -d sentinel_grid << 'EOF'\n${sql}\nEOF`;
await runSSM(cmd);
