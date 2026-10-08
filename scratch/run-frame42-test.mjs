import fs from 'node:fs';

const item = JSON.parse(fs.readFileSync('/tmp/frame42.json', 'utf8'));

const res = await fetch('http://localhost:8092/internal/frames', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-analytics-source-key': '10bcf3c15292e4a76522e6c2b73644cd0f480e57fc67ab293ec60ac5c6a82844'
  },
  body: JSON.stringify({
    tenantId: '00000000-0000-4000-8000-000000000001',
    cameraId: item.cameraId,
    capturedAt: new Date().toISOString(),
    width: item.width,
    height: item.height,
    imageBase64: item.b64,
    imageEncoding: 'jpeg',
    rules: [
      {
        id: 'rule-test-helmet',
        cameraId: item.cameraId,
        detectionType: 'helmet-worn',
        enabled: true,
        minConfidence: 0.70
      }
    ]
  })
});

console.log('Status:', res.status);
console.log('Result:', JSON.stringify(await res.json()));
