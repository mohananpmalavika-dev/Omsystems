
const Redis = require("ioredis");
(async () => {
  const redis = new Redis("redis://:SentinelGridRedisMaster2026@redis:6379");
  const raw = await redis.get("analytics:latest-frame:99455d3a-3411-43ad-b756-84a4ae17c026");
  if (!raw) {
    console.log("ERROR: No frame found for Kollam");
    process.exit(1);
  }
  const frame = JSON.parse(raw);
  console.log("Frame capturedAt:", frame.capturedAt);
  console.log("ImageBase64 len:", frame.imageBase64?.length);

  const payload = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    cameraId: "99455d3a-3411-43ad-b756-84a4ae17c026",
    capturedAt: new Date().toISOString(),
    width: frame.width || 640,
    height: frame.height || 360,
    imageBase64: frame.imageBase64,
    rules: [{
      id: "289c5a0d-df6d-41fa-a857-83634d773f19",
      name: "AI - Helmet worn inside bank",
      detectionType: "helmet-worn",
      enabled: true,
      minConfidence: 0.65,
      cooldownSeconds: 20
    }]
  };

  const res = await fetch("http://analytics-engine:8092/internal/frames", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-analytics-source-key": "10bcf3c15292e4a76522e6c2b73644cd0f480e57fc67ab293ec60ac5c6a82844"
    },
    body: JSON.stringify(payload)
  });

  console.log("Response status:", res.status);
  const text = await res.text();
  console.log("Response body:", text);
  redis.disconnect();
})();
