import { execSync } from 'child_process';
import fs from 'fs';
import sharp from 'sharp';

const cameras = [
  { channel: 6, id: 'e51113dd-d8c7-4d8b-8df9-267edeae7c94' },
  { channel: 8, id: 'd2e27fc9-8bd2-4184-8397-7581ac3ffeda' },
  { channel: 9, id: 'e66e3498-1c13-4f59-91d7-5a3386d269d2' },
  { channel: 11, id: 'b9600908-db55-4fb8-8b4f-deb0b2c9d254' },
];

for (const cam of cameras) {
  try {
    const nodeScript = `
      import { createRequire } from 'node:module';
      const { createClient } = createRequire('/app/package.json')('redis');
      import { loadConfig } from '/app/dist/src/config.js';
      const r = createClient({ url: loadConfig().REDIS_URL });
      await r.connect();
      const f = await r.get('analytics:latest-frame:${cam.id}');
      await r.quit();
      if (f) console.log(f);
    `;
    const b64 = Buffer.from(nodeScript).toString('base64');
    const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | sudo docker exec -i sentinel-gcp-control-plane node -"`;
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (out.trim()) {
      const data = JSON.parse(out.trim());
      const buf = Buffer.from(data.imageBase64, 'base64');
      const jpg = await sharp(buf, { raw: { width: data.width, height: data.height, channels: 3 } }).jpeg().toBuffer();
      fs.writeFileSync(`tmp/pilot-ch${cam.channel}-latest.jpg`, jpg);
      console.log(`Saved ch${cam.channel} (${data.width}x${data.height}, capturedAt: ${data.capturedAt})`);
    } else {
      console.log(`No frame in Redis for ch${cam.channel}`);
    }
  } catch (e) {
    console.error(`Error for ch${cam.channel}:`, e.message);
  }
}
