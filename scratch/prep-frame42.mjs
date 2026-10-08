import fs from 'node:fs';
import sharp from 'sharp';

async function main() {
  const filePath = 'scratch/bettiah-entry-20261008/ch5/frame-042.jpg';
  const meta = await sharp(filePath).metadata();
  const b64 = fs.readFileSync(filePath).toString('base64');

  const payload = {
    channel: 5,
    cameraId: 'd02f79e9-0615-4df6-a604-d3e4b8bde9b2',
    width: meta.width,
    height: meta.height,
    b64,
  };

  fs.writeFileSync('scratch/ch5-frame42-payload.json', JSON.stringify(payload));
  console.log('Saved frame42 payload');
}

main().catch(console.error);
