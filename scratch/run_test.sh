sudo docker cp /tmp/test_live.js sentinel-gcp-control-plane:/tmp/test_live.js
sudo docker exec sentinel-gcp-control-plane node -e '
const crypto = require("crypto");
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const expiresAt = new Date(Date.now() + 120_000);
  const cameraId = "dfb15de3-f067-4c7e-9456-1aed89b17866";
  const userId = "043561dc-a162-48ca-b7e4-290a9c4ad1ff";

  await pool.query(
    "INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose, profile) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)",
    [id, cameraId, userId, tokenHash, expiresAt, "view", "main"]
  );
  await pool.end();

  console.log("Created live session token:", token);

  const url = "http://127.0.0.1:8080/v1/edge-media/09181b97-0674-43ee-9d47-4b8c96f71a6b/v1/live/start";
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ controlPlaneToken: token, profile: "main" })
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body:", text);
}

main().catch(console.error);
'
