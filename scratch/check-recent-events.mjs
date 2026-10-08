import { execSync } from 'child_process';

const sql = `
SELECT id, camera_id, detection_type, confidence, occurred_at, status FROM analytics_events WHERE camera_id IN ('c19f9147-bb01-4e9f-8f42-dd4b361a398e', '62245da0-302a-46b1-a068-98c8dc70892a', 'b9a60efd-cc76-4d4f-9c99-afcff5563602', '2d5563a9-2c14-4ccd-b160-8897edf2eb13', 'cf21c87a-0f42-4203-bc9c-740ef72987a1', '45a1d045-e627-4037-a239-672d3b35d87b', '8a50c8f9-b16e-4061-9665-cf6d56df3414', 'ed44346e-9473-4795-8ef3-ba4d6bfb91d9', '2d8053f1-af9f-40df-94d3-3e432e13bd85', '344c3c01-00b6-4856-83d1-fdf60c28c757') ORDER BY occurred_at DESC LIMIT 15;
`;

const b64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
