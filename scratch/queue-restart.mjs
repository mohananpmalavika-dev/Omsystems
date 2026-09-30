import { execSync } from 'child_process';

const sql = `INSERT INTO edge_commands (tenant_id, branch_node_id, edge_agent_id, command_type, payload, requested_by) VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000104', '09181b97-0674-43ee-9d47-4b8c96f71a6b', 'restart-agent', '{}', '043561dc-a162-48ca-b7e4-290a9c4ad1ff');`;

const cmd = `gcloud compute ssh kryptovision-server --zone asia-south1-b --command "sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${sql}\\""`;

const res = execSync(cmd, { encoding: 'utf-8' });
console.log(res);
