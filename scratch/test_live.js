const crypto = require("crypto");
const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString: "postgresql://sentinel_admin:SentinelGridDbMaster2026@127.0.0.1:5432/sentinel_grid?sslmode=disable"
  });
  await client.connect();

  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const expiresAt = new Date(Date.now() + 120_000);
  const cameraId = "dfb15de3-f067-4c7e-9456-1aed89b17866";
  const userId = "043561dc-a162-48ca-b7e4-290a9c4ad1ff";

  await client.query(
    `INSERT INTO live_sessions (id, camera_id, user_id, token_hash, expires_at, purpose, profile)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)`,
    [id, cameraId, userId, tokenHash, expiresAt, "view", "main"]
  );
  await client.end();

  console.log("Created live session with token:", token);

  const url = "http://127.0.0.1:8080/v1/edge-media/09181b97-0674-43ee-9d47-4b8c96f71a6b/v1/live/start";
  console.log("Calling", url);
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
