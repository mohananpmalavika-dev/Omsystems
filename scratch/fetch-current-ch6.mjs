import { execSync } from 'child_process';
import fs from 'fs';
import sharp from 'sharp';

async function main() {
  const camId = '1e17538e-28b2-4963-abb3-3288058d4071'; // CP PLUS DVR - Channel 6
  const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="sudo docker exec sentinel-gcp-redis redis-cli -a SentinelGridRedisMaster2026 get 'analytics:latest-frame:${camId}'"`;
  const raw = execSync(cmd, { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 });
  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    const data = JSON.parse(raw.slice(jsonStart));
    console.log('Frame timestamp:', data.capturedAt, 'width:', data.width, 'height:', data.height);
    const rawPixels = Buffer.from(data.imageBase64, 'base64');
    fs.writeFileSync('scratch/live-current-ch6.raw', rawPixels);
    await sharp(rawPixels, { raw: { width: data.width || 640, height: data.height || 360, channels: 3 } })
      .jpeg()
      .toFile('scratch/live-current-ch6.jpg');
    console.log('Saved scratch/live-current-ch6.jpg (size:', fs.statSync('scratch/live-current-ch6.jpg').size, ')');
  } else {
    console.log('No frame found in redis');
  }
}

main().catch(console.error);
