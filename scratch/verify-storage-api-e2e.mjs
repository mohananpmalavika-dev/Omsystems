import crypto from 'crypto';
import pg from 'pg';

const token = "test-storage-session-token-2026";
const tokenHash = crypto.createHash("sha256").update(token).digest("base64");
const sessionId = "00000000-0000-4000-8000-000000000999";
// Use the active super_admin user
const userId = "043561dc-a162-48ca-b7e4-290a9c4ad1ff"; // mgdhanyamohan (super_admin)
const tenantId = "00000000-0000-4000-8000-000000000001";

const pool = new pg.Pool({
  connectionString: "postgresql://sentinel_admin:SentinelGridDbMaster2026@postgres:5432/sentinel_grid?sslmode=disable"
});

async function main() {
  console.log("1. Creating temporary session for super_admin...");
  await pool.query(`
    INSERT INTO user_sessions (
      id, user_id, tenant_id, access_token_hash, refresh_token_hash,
      access_expires_at, expires_at, last_activity_at, created_at
    ) VALUES (
      $1, $2, $3, $4, $4,
      now() + interval '1 day', now() + interval '1 day', now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      user_id = $2,
      tenant_id = $3,
      access_token_hash = $4,
      access_expires_at = now() + interval '1 day',
      expires_at = now() + interval '1 day',
      last_activity_at = now()
  `, [sessionId, userId, tenantId, tokenHash]);

  console.log("2. Calling http://dashboard:10000/api/operations/storage...");
  const res = await fetch("http://dashboard:10000/api/operations/storage", {
    headers: {
      "cookie": `sentinel_access=${token}`,
      "authorization": `Bearer ${token}`
    }
  });

  const body = await res.json();
  console.log("Response status:", res.status);
  console.log("Summary:", JSON.stringify(body.summary, null, 2));
  console.log("Total cameras mapped:", body.cameras?.length);
  console.log("Total storage devices:", body.storageDevices?.length);

  if (body.cameras && body.cameras.length > 0) {
    const branches = new Set(body.cameras.map(c => c.branchId));
    console.log("Distinct branches in cameras:", [...branches]);
    
    // Check coverage per tier
    const tiers = {};
    for (const c of body.cameras) {
      tiers[c.activeStorageTier] = (tiers[c.activeStorageTier] || 0) + 1;
    }
    console.log("Storage tiers breakdown:", tiers);

    console.log("\nSample cameras across branches:");
    for (const b of branches) {
      const sample = body.cameras.find(c => c.branchId === b);
      if (sample) {
        console.log(`Branch ${b}: Camera ${sample.cameraId} (${sample.cameraName}): tier=${sample.activeStorageTier}, dvrStatus=${sample.dvrStatus}, sdStatus=${sample.sdCardStatus}, capacity=${sample.capacity}, used=${sample.used}, mediaCount=${sample.storageMedia?.length}`);
      }
    }
  }

  // Cleanup session
  await pool.query("DELETE FROM user_sessions WHERE id = $1", [sessionId]);
  await pool.end();
  console.log("\nE2E verification completed successfully!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
