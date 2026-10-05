import { execSync } from 'child_process';

const code = `
const http = require('http');
http.get('http://127.0.0.1:8080/v1/cameras?limit=100', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Keys:', Object.keys(json));
      console.log('Sample:', JSON.stringify(json).slice(0, 500));
    } catch (e) {
      console.error('Parse error:', e.message, data.slice(0, 200));
    }
  });
});
`;

const b64 = Buffer.from(code).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --command="echo ${b64} | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node"`;
console.log(execSync(cmd, { encoding: 'utf8' }));
