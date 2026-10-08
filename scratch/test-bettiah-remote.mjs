import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

async function main() {
  const ch2Frames = ['frame-004.jpg', 'frame-005.jpg', 'frame-006.jpg'];
  const ch5Frames = ['frame-004.jpg', 'frame-005.jpg', 'frame-006.jpg'];

  const testData = [];

  for (const name of ch2Frames) {
    const filePath = `scratch/bettiah-entry-20261008/ch2/${name}`;
    const meta = await sharp(filePath).metadata();
    const b64 = fs.readFileSync(filePath).toString('base64');
    testData.push({
      channel: 2,
      frameName: name,
      cameraId: '4a2f17b5-08e9-401a-84f6-6489c41970f9',
      width: meta.width,
      height: meta.height,
      b64,
    });
  }

  for (const name of ch5Frames) {
    const filePath = `scratch/bettiah-entry-20261008/ch5/${name}`;
    const meta = await sharp(filePath).metadata();
    const b64 = fs.readFileSync(filePath).toString('base64');
    testData.push({
      channel: 5,
      frameName: name,
      cameraId: 'd02f79e9-0615-4df6-a604-d3e4b8bde9b2',
      width: meta.width,
      height: meta.height,
      b64,
    });
  }

  // Write remote script
  const remoteWorker = `
import fs from 'node:fs';
import { loadHelmetClassificationInference, loadObjectInference, loadPoseInference } from '/app/dist/analytics-engine/src/inference/vision-specialty-inference.js';
import { LocalizedHelmetHeadVerifier } from '/app/dist/analytics-engine/src/inference/helmet-head-verification.js';
import { HelmetDetector } from '/app/dist/analytics-engine/src/detectors/helmet-detector.js';
import sharp from 'sharp';

const frames = JSON.parse(fs.readFileSync('/tmp/bettiah-frames.json', 'utf8'));

// Load models
console.log('Loading models...');
const yolo = await loadObjectInference("yolov8n", 0.25);
const classifier = await loadHelmetClassificationInference("helmet");
const localizer = await loadObjectInference("helmet-head-localizer", 0.25);
const headEvidence = await loadHelmetClassificationInference("helmet-head-evidence");
let face = null, pose = null;
try { face = await loadObjectInference("face-detector", 0.6); } catch {}
try { pose = await loadPoseInference("pose-estimator", 0.4); } catch {}

const verifier = new LocalizedHelmetHeadVerifier(
  localizer,
  classifier,
  face,
  pose,
  headEvidence,
  new Set(["*"]),
);

for (const item of frames) {
  console.log('\\n========================================');
  console.log(\`Evaluating Channel \${item.channel} (\${item.frameName}) \${item.width}x\${item.height}\`);
  const buf = Buffer.from(item.b64, 'base64');
  const rgb = await sharp(buf).removeAlpha().toColourspace('srgb').raw().toBuffer();
  
  const frameObj = {
    tenantId: '00000000-0000-4000-8000-000000000001',
    cameraId: item.cameraId,
    timestamp: new Date('2026-10-08T04:37:30Z'),
    imageData: rgb,
    width: item.width,
    height: item.height,
  };

  const detected = await yolo.run(frameObj);
  console.log('YOLO Detections:', JSON.stringify(detected.map(d => ({ label: d.label, conf: d.confidence, box: d.boundingBox }))));

  const persons = detected.filter(d => d.label === 'person');
  for (let i = 0; i < persons.length; i++) {
    const p = persons[i];
    console.log(\`\\nPerson \${i + 1}: conf=\${p.confidence?.toFixed(3)}, boxHeightPx=\${(p.boundingBox.height * item.height).toFixed(1)}\`);
    
    // Test head verifier
    const vResult = await verifier.verify(frameObj, p.boundingBox, 0.75);
    console.log('Head Verifier Result:', JSON.stringify(vResult));

    // Test helmet classifier directly on upper body
    const upperBox = {
      x: Math.max(0, p.boundingBox.x + p.boundingBox.width * 0.1),
      y: Math.max(0, p.boundingBox.y - p.boundingBox.height * 0.05),
      width: Math.min(1, p.boundingBox.width * 0.8),
      height: Math.min(1, p.boundingBox.height * 0.35)
    };
    try {
      const cResult = await classifier.run(frameObj, upperBox);
      console.log('Upper body classifier:', JSON.stringify(cResult));
    } catch(e) {
      console.log('Upper classifier err:', e.message);
    }
  }

  // Also send to /internal/frames
  const res = await fetch('http://localhost:8092/internal/frames', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-analytics-source-key': '10bcf3c15292e4a76522e6c2b73644cd0f480e57fc67ab293ec60ac5c6a82844'
    },
    body: JSON.stringify({
      tenantId: '00000000-0000-4000-8000-000000000001',
      cameraId: item.cameraId,
      capturedAt: '2026-10-08T04:37:30.000Z',
      width: item.width,
      height: item.height,
      imageBase64: item.b64,
      imageEncoding: 'jpeg',
      rules: [
        {
          id: 'rule-test',
          cameraId: item.cameraId,
          detectionType: 'helmet-worn',
          enabled: true,
          minConfidence: 0.70
        }
      ]
    })
  });
  console.log('/internal/frames response:', await res.json());
}
`;

  fs.writeFileSync('scratch/remote-worker.mjs', remoteWorker);
  fs.writeFileSync('scratch/bettiah-test-frames.json', JSON.stringify(testData));
  console.log('Prepared test payload, size:', (fs.statSync('scratch/bettiah-test-frames.json').size / 1024 / 1024).toFixed(2), 'MB');
}

main().catch(console.error);
