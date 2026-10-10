import sharp from 'sharp';
import fs from 'fs';

async function main() {
  const img = sharp('scratch/event-b335-snapshot.jpg');
  const meta = await img.metadata();
  
  // Crop the head box
  const headBox = {
    x: 0.501,
    y: 0.468,
    width: 0.158,
    height: 0.243
  };

  const left = Math.round(headBox.x * meta.width);
  const top = Math.round(headBox.y * meta.height);
  const width = Math.round(headBox.width * meta.width);
  const height = Math.round(headBox.height * meta.height);

  await sharp('scratch/event-b335-snapshot.jpg')
    .extract({ left, top, width, height })
    .toFile('scratch/cashier-head-crop.jpg');

  console.log(`Saved scratch/cashier-head-crop.jpg: ${width}x${height}px`);

  // Analyze pixel colors in the head crop
  const raw = await sharp('scratch/cashier-head-crop.jpg').raw().toBuffer();
  let rSum = 0, gSum = 0, bSum = 0;
  let darkPixels = 0;
  const total = width * height;

  for (let i = 0; i < total; i++) {
    const r = raw[i * 3];
    const g = raw[i * 3 + 1];
    const b = raw[i * 3 + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    // Dark hair threshold
    if (r < 60 && g < 60 && b < 60) darkPixels++;
  }

  console.log('Average RGB:', rSum / total, gSum / total, bSum / total);
  console.log('Dark pixels percentage:', (darkPixels / total * 100).toFixed(1) + '%');
}

main().catch(console.error);
