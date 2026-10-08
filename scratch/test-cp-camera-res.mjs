import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const testScript = `
import { loadConfig } from '/app/dist/src/config.js';
import { createPool } from '/app/dist/src/database/pool.js';
import { PostgresStore } from '/app/dist/src/database/postgres-store.js';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const store = new PostgresStore(pool);

try {
  const hdCameras = new Set((config.HELMET_HD_CAPTURE_CAMERAS || '').split(',').map(s => s.trim()).filter(Boolean));
  console.log('HELMET_HD_CAPTURE_CAMERAS from config:', JSON.stringify(config.HELMET_HD_CAPTURE_CAMERAS));
  console.log('hdCameras set has *:', hdCameras.has('*'));
  
  const activeAgentIds = [
    '9f108498-4dd5-4a21-b810-eec9e538953c', // Bettiah / Hajipur
    '2b4fe162-6c1a-413e-9596-1eac2e1bcf88'  // Kollam
  ];

  for (const agentId of activeAgentIds) {
    const cameras = await store.listCamerasByEdgeAgent(agentId);
    console.log('\\nAgent:', agentId, 'Cameras count:', cameras.length);
    for (const cam of cameras) {
      const rules = (await store.listAnalyticsRules(cam.id)).filter(r => r.enabled);
      const hasHelmetRule = rules.some(r => r.detectionType === 'helmet-worn');
      const res = (hdCameras.has('*') || hdCameras.has(cam.id)) && hasHelmetRule
        ? { width: 1280, height: 720 } : { width: 640, height: 360 };
      console.log('  Cam: ' + cam.name + ' (' + cam.id + ') Ch:' + (cam.recorderChannel || cam.channel) + ' -> HelmetRule: ' + hasHelmetRule + ' -> Res: ' + JSON.stringify(res));
    }
  }
} finally {
  await pool.end();
}
`;

const innerB64 = Buffer.from(testScript).toString('base64');
const cmd = 'echo ' + innerB64 + ' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node --input-type=module';
const command = 'echo ' + gzipSync(Buffer.from(cmd)).toString('base64') + ' | base64 -d | gzip -d | bash';

const r = spawnSync('gcloud.cmd', [
  'compute', 'ssh', 'kryptovision-server',
  '--zone=asia-south1-b',
  '--project=project-7866fc3f-5dd5-4495-804',
  '--quiet',
  '--command=' + JSON.stringify(command)
], { shell: true, encoding: 'utf8', timeout: 60000 });

console.log(r.stdout || r.stderr);
