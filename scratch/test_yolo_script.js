
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';

async function main() {
  const session = await ort.InferenceSession.create('/tmp/helmet_yolo.onnx');
  
  // Crop only the video portion: from 1024x640 screenshot, video is around x:0, y:30, w:1024, h:500
  const img = sharp('/tmp/user_test.png');
  const meta = await img.metadata();
  console.log('Image dimensions:', meta.width, meta.height);

  const resized = await img.resize(640, 640, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  
  const chw = new Float32Array(3 * 640 * 640);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < 640 * 640; i++) {
      chw[c * 640 * 640 + i] = resized[i * 3 + c] / 255.0;
    }
  }

  const tensor = new ort.Tensor('float32', chw, [1, 3, 640, 640]);
  const results = await session.run({ [session.inputNames[0]]: tensor });
  const output = results[session.outputNames[0]];
  console.log('Output dims:', output.dims); // [1, 6, 8400]
  
  const data = output.data;
  let maxS0 = -1, maxS1 = -1;
  const hits = [];
  for (let i = 0; i < 8400; i++) {
    const cx = data[0 * 8400 + i];
    const cy = data[1 * 8400 + i];
    const w = data[2 * 8400 + i];
    const h = data[3 * 8400 + i];
    const s0 = data[4 * 8400 + i];
    const s1 = data[5 * 8400 + i];
    if (s0 > maxS0) maxS0 = s0;
    if (s1 > maxS1) maxS1 = s1;
    if (s0 > 0.05 || s1 > 0.05) {
      hits.push({ i, cx, cy, w, h, s0, s1 });
    }
  }
  console.log('MAX s0:', maxS0, 'MAX s1:', maxS1);
  hits.sort((a, b) => Math.max(b.s0, b.s1) - Math.max(a.s0, a.s1));
  console.log('Top 10 raw hits > 0.05:', JSON.stringify(hits.slice(0, 10), null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
