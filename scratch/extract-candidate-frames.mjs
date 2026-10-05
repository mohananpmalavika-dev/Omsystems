import { execSync } from 'child_process';
import fs from 'fs';
import sharp from 'sharp';

const camIds = [
  { id: 'c831fda2-f7f5-43d0-bce3-4d4a4e8b4ec2', name: 'bettaih-ch2' },
  { id: '25175a3f-562e-4138-a827-91518096937e', name: 'hajipur-ch2' },
  { id: '88137ebc-8df1-4995-824a-99bfce6c2225', name: 'hajipur-ch6' },
  { id: '6e5e3e6e-48b3-49ce-ac57-0b33bf3135b7', name: 'rajkot-ch6' },
  { id: '1e17538e-28b2-4963-abb3-3288058d4071', name: 'bettaih-ch6' },
  { id: 'ee9e189d-5bda-4ac7-a6d6-284880d98e91', name: 'rajkot-ch2' },
];

for (const cam of camIds) {
  try {
    const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="sudo docker exec sentinel-gcp-redis redis-cli -a SentinelGridRedisMaster2026 get 'analytics:latest-frame:${cam.id}'"`;
    const raw = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const jsonStart = raw.indexOf('{');
    if (jsonStart !== -1) {
      const data = JSON.parse(raw.slice(jsonStart));
      console.log(`Camera ${cam.name} (${cam.id}): capturedAt = ${data.capturedAt}, bytes = ${data.imageBase64?.length}`);
      const rawPixels = Buffer.from(data.imageBase64, 'base64');
      await sharp(rawPixels, { raw: { width: 640, height: 360, channels: 3 } })
        .jpeg()
        .toFile(`scratch/${cam.name}.jpg`);
      console.log(`Saved scratch/${cam.name}.jpg`);
    } else {
      console.log(`Camera ${cam.name}: no frame in redis`);
    }
  } catch (e) {
    console.error(`Camera ${cam.name} error:`, e.message);
  }
}
