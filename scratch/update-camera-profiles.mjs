import { execSync } from 'child_process';

const sql = `UPDATE cameras SET profiles = jsonb_build_array(jsonb_build_object('name', 'main', 'role', 'main', 'codec', 'H264', 'width', 1280, 'height', 720), jsonb_build_object('name', 'sub', 'role', 'sub', 'codec', 'H264', 'width', 352, 'height', 288)) WHERE edge_agent_id = '09181b97-0674-43ee-9d47-4b8c96f71a6b';`;

const cmd = `gcloud compute ssh kryptovision-server --zone asia-south1-b --command "sudo docker exec sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid -c \\"${sql}\\""`;

const res = execSync(cmd, { encoding: 'utf-8' });
console.log(res);
