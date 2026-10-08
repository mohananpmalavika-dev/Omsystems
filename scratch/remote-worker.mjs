import fs from 'node:fs';

const frames = JSON.parse(fs.readFileSync('/tmp/bettiah-frames.json', 'utf8'));

for (const item of frames) {
  console.log('\n========================================');
  console.log(`Sending Channel ${item.channel} (${item.frameName}) ${item.width}x${item.height} to /internal/frames...`);
  
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
  
  const status = res.status;
  const json = await res.json().catch(e => ({ error: e.message }));
  console.log(`Status: ${status}`, JSON.stringify(json));
}
