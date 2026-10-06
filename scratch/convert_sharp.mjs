import fs from 'fs';
import sharp from 'sharp';

const data = JSON.parse(fs.readFileSync('/tmp/frame.json', 'utf8'));
const raw = Buffer.from(data.imageBase64, 'base64');
await sharp(raw, { raw: { width: 640, height: 360, channels: 3 } })
  .jpeg()
  .toFile('/tmp/frame.jpg');
console.log('Saved /tmp/frame.jpg');
