const fs = require('fs');

const raw = fs.readFileSync('/tmp/kollam_frame_raw.txt', 'utf8');
const lines = raw.trim().split('\n').filter(l => l.startsWith('{'));
const frameData = JSON.parse(lines[0]);
const imgBuffer = Buffer.from(frameData.imageBase64, 'base64');
let sum = 0;
let nonZero = 0;
for (let i = 0; i < imgBuffer.length; i++) {
  sum += imgBuffer[i];
  if (imgBuffer[i] !== 0) nonZero++;
}
console.log('Total bytes:', imgBuffer.length);
console.log('Non-zero bytes count:', nonZero);
console.log('Sum of bytes:', sum);
console.log('Average pixel value:', sum / imgBuffer.length);
