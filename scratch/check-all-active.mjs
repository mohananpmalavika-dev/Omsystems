import { execSync } from 'child_process';

const ids = [
  '382b55e5-d330-4071-8d07-4f094db0cbd6',
  '6e5e3e6e-48b3-49ce-ac57-0b33bf3135b7',
  '2e12f799-5135-4127-ab71-5fa2980ccb0f',
  'ee9e189d-5bda-4ac7-a6d6-284880d98e91',
  '1e17538e-28b2-4963-abb3-3288058d4071',
  '4d74d7ad-6922-4af0-9f36-420b84879425',
  'aa6e8afc-07a6-4b05-b962-c4133f79e306',
  '64351fb7-faa3-48c8-80e0-81f2dd9d3f06',
  'ce5584f9-cccd-4605-a0bb-ac9a28cecb33',
  'c831fda2-f7f5-43d0-bce3-4d4a4e8b4ec2',
  '25175a3f-562e-4138-a827-91518096937e',
  '5c72d81a-e2a8-4918-bb3c-b68b9c037a0f',
  '5937c091-eff5-4809-9bba-0aeb8b739d47',
  '8a2fa6b2-78d5-45ce-8f18-f3495ec3ca94',
  '80ce1672-d553-4e85-b2e4-3758bd744eb4',
  '0fc5c021-4246-4659-87a0-0ba4c6f36240',
  '172e5dd2-6c2e-4946-b0a3-8f40b85d7319',
  '7fc25e6a-7982-4afe-ae5c-2ef0ff2fbbd1',
  '88137ebc-8df1-4995-824a-99bfce6c2225',
  '84ae9288-43d5-4721-9587-8b2d41d44c54',
  '1fcc5ac0-da36-4941-b5dc-92f748a182b6',
  '046a42fe-8799-447f-a250-66660cfdfeac',
  '5ffde9b3-924c-4622-aa74-b3c406567d7c'
];

const sql = `
SELECT c.id, c.channel, rn.name as camera_name, b.name as branch_name, c.ip_address
FROM cameras c
LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
LEFT JOIN resource_nodes b ON c.branch_node_id = b.id
WHERE c.id IN (${ids.map(id => `'${id}'`).join(',')})
ORDER BY c.channel, c.id;
`;

const base64 = Buffer.from(sql).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo '${base64}' | base64 -d | sudo docker exec -i sentinel-gcp-postgres psql -U sentinel_admin -d sentinel_grid"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
