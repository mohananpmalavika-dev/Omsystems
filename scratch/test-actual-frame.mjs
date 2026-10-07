import { runRemote } from './remote-exec.mjs';

const script = `
sudo docker exec sentinel-gcp-control-plane node -e '
(async () => {
  const { createClient } = require("redis");
  const redis = createClient({ url: "redis://:SentinelGridRedisMaster2026@redis:6379" });
  await redis.connect();
  const raw = await redis.get("analytics:latest-frame:fa0a7e3d-6f72-4261-a688-d64dd05efc37");
  if (!raw) {
    console.log("NO_FRAME_IN_REDIS");
    process.exit(0);
  }
  const data = JSON.parse(raw);
  console.log("CAPTURED_AT:", data.capturedAt);
  console.log("BASE64_LEN:", data.imageBase64?.length);

  const res = await fetch("http://analytics-engine:8092/internal/frames", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-analytics-source-key": "10bcf3c15292e4a76522e6c2b73644cd0f480e57fc67ab293ec60ac5c6a82844"
    },
    body: JSON.stringify({
      tenantId: "00000000-0000-0000-0000-000000000001",
      cameraId: "fa0a7e3d-6f72-4261-a688-d64dd05efc37",
      capturedAt: new Date().toISOString(),
      width: 640,
      height: 360,
      imageBase64: data.imageBase64,
      rules: [{
        id: "47d878b5-a3f6-48be-9e6c-9e1db5a1f4b5",
        name: "AI - Helmet worn inside bank",
        detectionType: "helmet-worn",
        enabled: true,
        minConfidence: 0.70,
        cooldownSeconds: 20
      }]
    })
  });
  console.log("STATUS:", res.status);
  const json = await res.json();
  console.log("RESPONSE:", JSON.stringify(json, null, 2));
})();
'
`;

console.log(runRemote(script));
