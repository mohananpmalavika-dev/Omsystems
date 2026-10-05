import { execSync } from 'child_process';
import fs from 'fs';

const patchScript = `
const fs = require('fs');

// 1. Patch device-identity-repository.js
const p1 = '/app/dist/src/database/device-identity-repository.js';
if (fs.existsSync(p1)) {
  let content = fs.readFileSync(p1, 'utf8');
  const target1 = \`       JOIN edge_agents agent
         ON agent.id = $2::uuid
        AND agent.branch_node_id = branch.id
        AND agent.tenant_id = branch.tenant_id
       WHERE branch.id = $1::uuid AND branch.node_type = 'branch'\`;

  const replacement1 = \`       JOIN edge_agents agent
         ON agent.id = $2::uuid
        AND agent.tenant_id = branch.tenant_id
        AND agent.credential_revoked_at IS NULL
        AND (agent.branch_node_id = branch.id OR EXISTS (
          SELECT 1 FROM edge_agent_branch_assignments assignment
          WHERE assignment.edge_agent_id = agent.id
            AND assignment.branch_node_id = branch.id
            AND assignment.tenant_id = branch.tenant_id
        ))
       WHERE branch.id = $1::uuid AND branch.node_type = 'branch'\`;

  if (content.includes(target1)) {
    content = content.replace(target1, replacement1);
    fs.writeFileSync(p1, content, 'utf8');
    console.log('SUCCESS_PATCHED_DEVICE_IDENTITY_REPOSITORY');
  } else if (content.includes('edge_agent_branch_assignments')) {
    console.log('ALREADY_PATCHED_DEVICE_IDENTITY_REPOSITORY');
  } else {
    console.log('TARGET_NOT_FOUND_DEVICE_IDENTITY_REPOSITORY');
  }
}

// 2. Patch camera-repository.js
const p2 = '/app/dist/src/database/camera-repository.js';
if (fs.existsSync(p2)) {
  let content = fs.readFileSync(p2, 'utf8');
  const target2 = 'JOIN cameras c ON c.branch_node_id = agent.branch_node_id';
  const replacement2 = \`JOIN cameras c ON (c.branch_node_id = agent.branch_node_id OR EXISTS (
             SELECT 1 FROM edge_agent_branch_assignments assignment
             WHERE assignment.edge_agent_id = agent.id
               AND assignment.branch_node_id = c.branch_node_id
           ))\`;

  if (content.includes(target2)) {
    content = content.replace(target2, replacement2);
    fs.writeFileSync(p2, content, 'utf8');
    console.log('SUCCESS_PATCHED_CAMERA_REPOSITORY');
  } else if (content.includes('assignment.branch_node_id = c.branch_node_id')) {
    console.log('ALREADY_PATCHED_CAMERA_REPOSITORY');
  } else {
    console.log('TARGET_NOT_FOUND_CAMERA_REPOSITORY');
  }
}
`;

const patchB64 = Buffer.from(patchScript).toString('base64');

// Also upload local source files to host /opt/sentinel-grid
const localFiles = [
  'src/database/device-identity-repository.ts',
  'src/database/camera-repository.ts',
  'dashboard/components/device-manager.tsx',
];

for (const file of localFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  console.log(`Syncing ${file} to /opt/sentinel-grid/...`);
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${b64}' | base64 -d | sudo tee /opt/sentinel-grid/${file} > /dev/null"`;
  execSync(cmd, { stdio: 'inherit' });
}

console.log('Applying patch inside sentinel-gcp-control-plane...');
const applyCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${patchB64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node"`;
console.log(execSync(applyCmd, { encoding: 'utf8' }));

console.log('Restarting sentinel-gcp-control-plane...');
const restartCmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="sudo docker restart sentinel-gcp-control-plane"`;
console.log(execSync(restartCmd, { encoding: 'utf8' }));

console.log('Control plane patched and restarted successfully!');
