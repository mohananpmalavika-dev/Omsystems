#!/usr/bin/env node
/**
 * Zero-Touch Fleet Rollout for Sentinel Grid Edge Agents
 * 
 * Automatically ensures:
 * 1. Current edge-agent version has a compiled & cryptographically signed delta bundle.
 * 2. An active 100% rollout release is published in the `edge_update_releases` database table.
 * 3. All branch edge agents with older versions have an `apply-update` command queued.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");

function compareVersions(left, right) {
  const parse = (value) => /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value));
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return String(left).localeCompare(String(right));
  for (let index = 1; index <= 3; index += 1) {
    const diff = Number(a[index]) - Number(b[index]);
    if (diff) return diff;
  }
  return 0;
}

async function main() {
  console.log("========================================================");
  console.log("🚀 Sentinel Grid Zero-Touch Fleet Rollout Initiated");
  console.log("========================================================");

  // 1. Read edge agent package.json
  const edgePackagePath = join(repoRoot, "edge-agent", "package.json");
  const edgePackage = JSON.parse(await readFile(edgePackagePath, "utf8"));
  const targetVersion = edgePackage.version;
  console.log(`[FleetRollout] Target Edge Agent Version: v${targetVersion}`);

  // 2. Ensure signing key is available
  let signingKey = process.env.EDGE_UPDATE_SIGNING_PRIVATE_KEY?.trim();
  if (!signingKey) {
    const keyFile = join(repoRoot, "config", "keys", "evidence-signing.pem");
    if (existsSync(keyFile)) {
      signingKey = await readFile(keyFile, "utf8");
    }
  }

  // 3. Ensure bundle & manifest exist
  const updateDir = join(repoRoot, "edge-agent", "release", "updates", targetVersion);
  const bundleFile = join(updateDir, "edge-agent.bundle");
  const manifestFile = join(updateDir, "manifest.json");

  if (!existsSync(bundleFile) || !existsSync(manifestFile)) {
    console.log(`[FleetRollout] Building and signing delta bundle for v${targetVersion}...`);
    const buildScript = join(repoRoot, "edge-agent", "scripts", "build-delta-bundle.mjs");
    execSync(`node "${buildScript}"`, {
      cwd: repoRoot,
      env: {
        ...process.env,
        EDGE_UPDATE_SIGNING_PRIVATE_KEY: signingKey || "",
        CONTROL_PLANE_PUBLIC_URL: process.env.CONTROL_PLANE_PUBLIC_URL || "https://34-14-220-41.sslip.io",
      },
      stdio: "inherit",
    });
  }

  if (!existsSync(manifestFile)) {
    throw new Error(`Failed to locate manifest at ${manifestFile}`);
  }

  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  console.log(`[FleetRollout] Bundle SHA-256: ${manifest.sha256}`);
  console.log(`[FleetRollout] Signed: ${Boolean(manifest.signature)}`);

  // 4. Connect to database
  const connectionString = process.env.DATABASE_URL ||
    "postgresql://sentinel_admin:SentinelGridDbMaster2026@127.0.0.1:5432/sentinel_grid?sslmode=disable";
  
  const pool = new Pool({ connectionString });
  try {
    // 5. Get an admin user ID for attribution
    const userRes = await pool.query("SELECT id FROM users ORDER BY created_at ASC LIMIT 1");
    const adminUserId = userRes.rows[0]?.id;
    if (!adminUserId) {
      throw new Error("No users found in database to attribute release creation");
    }

    // 6. Upsert into edge_update_releases
    const publicUrl = process.env.CONTROL_PLANE_PUBLIC_URL?.replace(/\/+$/, "") || "https://34-14-220-41.sslip.io";
    const artifactUrl = manifest.artifactUrl || `${publicUrl}/v1/edge-updates/artifacts/${encodeURIComponent(targetVersion)}/edge-agent.bundle`;

    await pool.query(`
      INSERT INTO edge_update_releases 
        (version, artifact_url, sha256, signature, notes, rollout_percentage, enabled, created_by)
      VALUES 
        ($1, $2, $3, $4, $5, 100, true, $6)
      ON CONFLICT (version) DO UPDATE SET
        artifact_url = EXCLUDED.artifact_url,
        sha256 = EXCLUDED.sha256,
        signature = EXCLUDED.signature,
        notes = EXCLUDED.notes,
        rollout_percentage = 100,
        enabled = true
    `, [
      targetVersion,
      artifactUrl,
      manifest.sha256,
      manifest.signature || "",
      manifest.notes || `Sentinel Grid Edge Agent Delta Update v${targetVersion}`,
      adminUserId,
    ]);

    console.log(`[FleetRollout] ✅ Release v${targetVersion} registered in edge_update_releases (100% rollout, enabled).`);

    // 7. Query all edge agents
    const agentsRes = await pool.query(`
      SELECT a.id, a.name, a.version, a.branch_node_id, b.tenant_id
      FROM edge_agents a
      JOIN resource_nodes b ON b.id = a.branch_node_id
      WHERE a.status::text != 'revoked'
    `);

    let queuedCount = 0;
    let currentCount = 0;
    let alreadyPendingCount = 0;

    for (const agent of agentsRes.rows) {
      if (compareVersions(agent.version, targetVersion) >= 0) {
        currentCount++;
        continue;
      }

      // Check if command already queued or running
      const pendingRes = await pool.query(`
        SELECT id FROM edge_commands
        WHERE edge_agent_id = $1 AND command_type = 'apply-update' AND status IN ('queued', 'running')
      `, [agent.id]);

      if (pendingRes.rows.length > 0) {
        alreadyPendingCount++;
        continue;
      }

      // Queue apply-update command
      await pool.query(`
        INSERT INTO edge_commands 
          (tenant_id, branch_node_id, edge_agent_id, command_type, status, payload, requested_by)
        VALUES 
          ($1, $2, $3, 'apply-update', 'queued', $4::jsonb, $5)
      `, [
        agent.tenant_id,
        agent.branch_node_id,
        agent.id,
        JSON.stringify({ releaseVersion: targetVersion }),
        adminUserId,
      ]);

      queuedCount++;
      console.log(`[FleetRollout] -> Queued v${targetVersion} update for agent '${agent.name}' (current: v${agent.version})`);
    }

    console.log("--------------------------------------------------------");
    console.log(`[FleetRollout] Summary:`);
    console.log(`  Total Gateways:     ${agentsRes.rows.length}`);
    console.log(`  Updates Queued:     ${queuedCount}`);
    console.log(`  Already Current:    ${currentCount}`);
    console.log(`  Already Pending:    ${alreadyPendingCount}`);
    console.log("========================================================");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[FleetRollout] ❌ Error:", err.message);
  process.exit(1);
});
