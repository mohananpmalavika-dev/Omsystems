#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runMigrations, showStatus } from "./run-migrations.mjs";

const { Client } = pg;
const scriptPath = fileURLToPath(import.meta.url);
const expectedMigrationCount = readdirSync(
  join(dirname(scriptPath), "..", "database", "migrations"),
).filter((filename) => filename.endsWith(".sql")).length;
const containerName = `sentinel-migration-test-${process.pid}`;
const databaseUrl = "postgresql://testuser:testpass@127.0.0.1:5433/sentinel_test";

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function waitForDatabase() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  }
  throw new Error("PostgreSQL test container did not become ready within 30 seconds");
}

async function verifySchema() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const expectedRelations = [
      "branch_camera_requirements",
      "analytics_acknowledgements",
      "analytics_alerts",
      "analytics_events",
      "analytics_models",
      "analytics_notifications",
      "analytics_rules",
      "analytics_zones",
      "chain_of_custody_events",
      "camera_access_requests",
      "camera_installation_compliance",
      "camera_specific_grants",
      "camera_specifications",
      "evidence_cases",
      "evidence_exports",
      "evidence_items",
      "evidence_manifests",
      "organizational_hierarchy_rules",
      "live_bookmarks",
      "live_incidents",
      "recording_health_events",
      "recording_jobs",
      "recording_legal_holds",
      "recording_replication_jobs",
      "recording_segments",
      "recording_storage_nodes",
      "role_permissions",
      "user_organizational_assignments",
      "user_sessions",
    ];
    const relations = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema='public' AND table_name = ANY($1::text[])`,
      [expectedRelations],
    );
    const presentRelations = new Set(relations.rows.map((row) => row.table_name));
    const missingRelations = expectedRelations.filter((name) => !presentRelations.has(name));
    if (missingRelations.length > 0) {
      throw new Error(`Missing tables: ${missingRelations.join(", ")}`);
    }

    const expectedViews = [
      "branch_camera_coverage_gaps",
      "camera_access_summary",
      "camera_compliance_summary",
      "organizational_hierarchy_view",
      "user_camera_access_overview",
      "user_details_view",
    ];
    const views = await client.query(
      `SELECT table_name
       FROM information_schema.views
       WHERE table_schema='public' AND table_name = ANY($1::text[])`,
      [expectedViews],
    );
    const presentViews = new Set(views.rows.map((row) => row.table_name));
    const missingViews = expectedViews.filter((name) => !presentViews.has(name));
    if (missingViews.length > 0) {
      throw new Error(`Missing views: ${missingViews.join(", ")}`);
    }

    const migrations = await client.query(
      "SELECT count(*)::integer AS count FROM schema_migrations",
    );
    if (migrations.rows[0]?.count !== expectedMigrationCount) {
      throw new Error(
        `Expected ${expectedMigrationCount} applied migrations, found ${migrations.rows[0]?.count}`,
      );
    }

    const pilot = await client.query(`
      SELECT role::text, status::text
      FROM users
      WHERE identity_subject='user-global-admin'
    `);
    if (pilot.rows[0]?.role !== "super_admin" || pilot.rows[0]?.status !== "active") {
      throw new Error("Pilot administrator was not upgraded to an active super admin");
    }

    const pilotOrgGrant = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM access_grants
        WHERE user_id='00000000-0000-4000-8000-000000000201'
          AND action='org:manage'
          AND effect='allow'
      ) AS present
    `);
    if (!pilotOrgGrant.rows[0]?.present) {
      throw new Error("Pilot administrator did not receive organization management");
    }

    const pilotAnalyticsGrants = await client.query(`
      SELECT count(DISTINCT action)::integer AS count
      FROM access_grants
      WHERE user_id='00000000-0000-4000-8000-000000000201'
        AND action IN (
          'analytics:view', 'analytics:configure', 'alerts:acknowledge',
          'alerts:escalate', 'analytics:export'
        )
        AND effect='allow'
    `);
    if (pilotAnalyticsGrants.rows[0]?.count !== 5) {
      throw new Error("Pilot administrator did not receive analytics permissions");
    }

    await client.query(`
      INSERT INTO resource_nodes (
        id,tenant_id,parent_id,node_type,name,path
      ) VALUES (
        '00000000-0000-4000-8000-000000000401',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000104',
        'camera',
        'Locker Camera',
        'company.operations.local_region.local_camera_pilot.locker_camera'
      );
      INSERT INTO cameras (
        id,resource_node_id,branch_node_id,vendor,model,channel,protocol,
        connection_secret_ref,location_type,sensitivity_level
      ) VALUES (
        '00000000-0000-4000-8000-000000000301',
        '00000000-0000-4000-8000-000000000401',
        '00000000-0000-4000-8000-000000000104',
        'hikvision','Test Camera',1,'onvif-t','test/secret',
        'locker-room','internal'
      );
      INSERT INTO users (
        id,tenant_id,identity_subject,display_name,active,username,role,status
      ) VALUES (
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000001',
        'region-manager-test','Region Manager',true,'region-manager-test',
        'region_manager','active'
      );
      INSERT INTO user_organizational_assignments (
        user_id,tenant_id,scope_node_id,is_primary,assigned_by_user_id
      ) VALUES (
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000103',
        true,
        '00000000-0000-4000-8000-000000000201'
      );
      UPDATE users SET role=role
      WHERE id='00000000-0000-4000-8000-000000000202';
    `);

    const regionalAllow = await client.query(`
      SELECT allowed
      FROM check_camera_access(
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000301',
        'live:view'
      )
    `);
    if (!regionalAllow.rows[0]?.allowed) {
      throw new Error("Region manager did not inherit camera access from region scope");
    }

    await client.query(`
      INSERT INTO camera_specific_grants (
        tenant_id,user_id,camera_id,effect,reason,granted_by_user_id
      ) VALUES (
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000301',
        'deny','Locker camera restricted',
        '00000000-0000-4000-8000-000000000201'
      )
    `);
    const cameraDeny = await client.query(`
      SELECT allowed,reason
      FROM check_camera_access(
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000301',
        'live:view'
      )
    `);
    if (cameraDeny.rows[0]?.allowed || !String(cameraDeny.rows[0]?.reason).includes("denied")) {
      throw new Error("Camera-specific deny did not override the regional allow");
    }

    const cameraAccessFunction = await client.query(
      "SELECT to_regprocedure('check_camera_access(uuid,uuid,text)') IS NOT NULL AS present",
    );
    if (!cameraAccessFunction.rows[0]?.present) {
      throw new Error("check_camera_access function was not created");
    }
  } finally {
    await client.end();
  }
}

async function verifyBaselineRecovery() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("TRUNCATE schema_migrations");
  } finally {
    await client.end();
  }
  await runMigrations();

  const verification = new Client({ connectionString: databaseUrl });
  await verification.connect();
  try {
    const result = await verification.query(
      "SELECT count(*)::integer AS count FROM schema_migrations",
    );
    if (result.rows[0]?.count !== expectedMigrationCount) {
      throw new Error("Existing-schema baseline did not recover all migrations");
    }
  } finally {
    await verification.end();
  }
}

async function main() {
  await run("docker", ["--version"], { capture: true });
  console.log(`Starting PostgreSQL test container ${containerName}...`);
  const containerId = await run("docker", [
    "run", "--rm", "-d",
    "--name", containerName,
    "-e", "POSTGRES_PASSWORD=testpass",
    "-e", "POSTGRES_USER=testuser",
    "-e", "POSTGRES_DB=sentinel_test",
    "-p", "127.0.0.1:5433:5432",
    "postgres:16-alpine",
  ], { capture: true });

  try {
    await waitForDatabase();
    process.env.DATABASE_URL = databaseUrl;
    await runMigrations();
    await verifySchema();
    await verifyBaselineRecovery();
    await runMigrations();
    await showStatus();
    console.log("Migration schema and repeat-run verification passed.");
  } finally {
    await run("docker", ["stop", containerId], { capture: true }).catch(() => undefined);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
