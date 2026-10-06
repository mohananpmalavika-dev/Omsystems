import fs from 'fs';

let content = fs.readFileSync('src/database/postgres-store.ts', 'utf8');
const isCrlf = content.includes('\r\n');
const nl = isCrlf ? '\r\n' : '\n';

const oldLines = [
  '       JOIN edge_agents agent ON agent.id = secret.edge_agent_id',
  '       JOIN cameras camera ON camera.edge_agent_id = agent.id',
  '         AND camera.connection_secret_ref = $2',
  '       WHERE secret.reference = $1 AND agent.credential_revoked_at IS NULL',
  '         AND ($3::uuid IS NULL OR agent.id = $3::uuid)'
].join(nl);

const newLines = [
  '       JOIN edge_agents agent ON agent.id = secret.edge_agent_id',
  '       LEFT JOIN cameras camera ON camera.connection_secret_ref = $2',
  '       WHERE secret.reference = $1 AND agent.credential_revoked_at IS NULL',
  '         AND (',
  '           $3::uuid IS NULL',
  '           OR agent.id = $3::uuid',
  '           OR (camera.id IS NOT NULL AND (',
  '             camera.edge_agent_id = $3::uuid',
  '             OR EXISTS (',
  '               SELECT 1 FROM edge_agent_branch_assignments eaba',
  '               WHERE eaba.edge_agent_id = $3::uuid AND eaba.branch_node_id = camera.branch_node_id',
  '             )',
  '             OR EXISTS (',
  '               SELECT 1 FROM edge_agents ea',
  '               WHERE ea.id = $3::uuid AND ea.branch_node_id = camera.branch_node_id',
  '             )',
  '           ))',
  '         )'
].join(nl);

if (!content.includes(oldLines)) {
  console.error('Target lines not found in postgres-store.ts');
  process.exit(1);
}

content = content.replace(oldLines, newLines);
fs.writeFileSync('src/database/postgres-store.ts', content, 'utf8');
console.log('Successfully updated postgres-store.ts');
