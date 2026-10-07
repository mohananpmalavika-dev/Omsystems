import { execSync } from 'child_process';

const script = `
sudo docker exec sentinel-gcp-control-plane node -e '
(async () => {
  const { createClient } = require("redis");
  const redis = createClient({ url: "redis://:SentinelGridRedisMaster2026@redis:6379" });
  await redis.connect();
  const keys = await redis.keys("analytics:latest-frame:*");
  console.log("Total frame keys in redis:", keys.length);
  const kollamKey = "analytics:latest-frame:99455d3a-3411-43ad-b756-84a4ae17c026";
  const raw = await redis.get(kollamKey);
  if (!raw) {
    console.log("NO_FRAME_IN_REDIS for Kollam camera (99455d3a-3411-43ad-b756-84a4ae17c026)");
    const matched = keys.filter(k => k.includes("99455d3a"));
    console.log("Matched keys:", matched);
  } else {
    const data = JSON.parse(raw);
    console.log("Kollam frame found!");
    console.log("capturedAt:", data.capturedAt);
    console.log("base64 len:", data.imageBase64?.length);
    console.log("age in seconds:", (Date.now() - new Date(data.capturedAt).getTime()) / 1000);
  }
})();
'
`;

const b64 = Buffer.from(script).toString('base64');
const cmd = `gcloud compute ssh kryptovision-server --zone=asia-south1-b --project=project-7866fc3f-5dd5-4495-804 --quiet --command="echo '${b64}' | base64 -d | bash"`;

console.log(execSync(cmd, { encoding: 'utf8' }));
