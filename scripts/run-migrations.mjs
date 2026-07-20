#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const scriptPath = fileURLToPath(import.meta.url);
const migrationsDirectory = join(dirname(scriptPath), "..", "database", "migrations");
const migrationLockId = 7_184_225_991;

function migrationFiles() {
  return readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function migrationContents(filename) {
  return readFileSync(join(migrationsDirectory, filename), "utf8");
}

function checksum(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function databaseLabel(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "configured PostgreSQL database";
  }
}

function createClient(databaseUrl) {
  let hostname = "";
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    // PostgreSQL will report a more useful connection-string error.
  }
  const sslSetting = process.env.DATABASE_SSL;
  const useSsl = sslSetting === "require" ||
    (sslSetting !== "disable" && hostname.endsWith(".render.com"));
  return new Client({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      executed_at timestamptz NOT NULL DEFAULT now(),
      checksum text NOT NULL,
      execution_time_ms integer NOT NULL DEFAULT 0
    )
  `);
}

async function baselineExistingCoreSchema(client, files) {
  const recorded = await client.query("SELECT count(*)::integer AS count FROM schema_migrations");
  if (recorded.rows[0]?.count !== 0) return;

  const state = await client.query(`
    SELECT
      to_regclass('public.tenants') IS NOT NULL AS has_initial,
      to_regclass('public.edge_agents') IS NOT NULL
        AND to_regclass('public.live_sessions') IS NOT NULL AS has_streaming,
      to_regclass('public.camera_specifications') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname='maintain_branch_camera_count'
        ) AS has_cctv,
      to_regprocedure('public.populate_branch_camera_requirements(uuid)') IS NOT NULL
        AS has_cctv_seed,
      EXISTS (
        SELECT 1
        FROM pg_enum enum_value
        JOIN pg_type enum_type ON enum_type.oid=enum_value.enumtypid
        WHERE enum_type.typname='resource_node_type'
          AND enum_value.enumlabel='headquarters'
      ) AS has_org_types,
      to_regclass('public.organizational_hierarchy_rules') IS NOT NULL
        AND to_regclass('public.organizational_hierarchy_view') IS NOT NULL
        AS has_hierarchy,
      to_regclass('public.user_sessions') IS NOT NULL
        AND to_regclass('public.role_permissions') IS NOT NULL
        AND to_regprocedure('public.record_successful_login(uuid,inet)') IS NOT NULL
        AS has_employee_auth,
      to_regclass('public.camera_specific_grants') IS NOT NULL
        AND to_regclass('public.camera_access_summary') IS NOT NULL
        AND to_regprocedure('public.check_camera_access(uuid,uuid,text)') IS NOT NULL
        AS has_camera_permissions,
      to_regclass('public.recording_jobs') IS NOT NULL
        AND to_regclass('public.recording_segments') IS NOT NULL
        AND to_regclass('public.recording_legal_holds') IS NOT NULL
        AND to_regclass('public.recording_storage_nodes') IS NOT NULL
        AS has_recording
  `);
  const existing = state.rows[0];
  if (!existing?.has_initial) return;
  const pilot = await client.query(
    "SELECT EXISTS (SELECT 1 FROM tenants WHERE slug = 'omsystems-pilot') AS present",
  );
  existing.has_pilot = Boolean(pilot.rows[0]?.present);

  const baseline = [];
  if (files.includes("001_initial.sql")) baseline.push("001_initial.sql");
  if (existing.has_streaming && files.includes("002_edge_and_media_contract.sql")) {
    baseline.push("002_edge_and_media_contract.sql");
  }
  if (existing.has_pilot && files.includes("003_pilot_seed.sql")) {
    baseline.push("003_pilot_seed.sql");
  }
  if (existing.has_cctv && files.includes("004_cctv_infrastructure.sql")) {
    baseline.push("004_cctv_infrastructure.sql");
  }
  if (existing.has_cctv_seed && files.includes("005_cctv_infrastructure_seed.sql")) {
    baseline.push("005_cctv_infrastructure_seed.sql");
  }
  if (existing.has_org_types && files.includes("006_organizational_node_types.sql")) {
    baseline.push("006_organizational_node_types.sql");
  }
  if (existing.has_hierarchy && files.includes("007_organizational_hierarchy.sql")) {
    baseline.push("007_organizational_hierarchy.sql");
  }
  if (existing.has_employee_auth && files.includes("008_employee_management_and_auth.sql")) {
    baseline.push("008_employee_management_and_auth.sql");
  }
  if (existing.has_camera_permissions && files.includes("009_granular_camera_permissions.sql")) {
    baseline.push("009_granular_camera_permissions.sql");
  }
  if (existing.has_recording && files.includes("010_recording_storage.sql")) {
    baseline.push("010_recording_storage.sql");
  }

  for (const filename of baseline) {
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum, execution_time_ms)
       VALUES ($1, $2, 0)
       ON CONFLICT (filename) DO NOTHING`,
      [filename, checksum(migrationContents(filename))],
    );
  }
  if (baseline.length > 0) {
    console.log(`Baselined existing schema: ${baseline.join(", ")}`);
  }
}

async function executedMigrations(client) {
  const result = await client.query(
    "SELECT filename, checksum FROM schema_migrations ORDER BY filename",
  );
  return new Map(result.rows.map((row) => [row.filename, row.checksum]));
}

function validateAppliedChecksums(executed, files) {
  for (const filename of files) {
    const appliedChecksum = executed.get(filename);
    if (!appliedChecksum) continue;
    const currentChecksum = checksum(migrationContents(filename));
    if (appliedChecksum !== currentChecksum) {
      throw new Error(
        `Applied migration ${filename} was modified. Add a new migration instead of editing deployed SQL.`,
      );
    }
  }
}

async function executeMigration(client, filename) {
  const sql = migrationContents(filename);
  const startedAt = Date.now();
  await client.query("BEGIN");
  try {
    await client.query(sql);
    const executionTime = Date.now() - startedAt;
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum, execution_time_ms)
       VALUES ($1, $2, $3)`,
      [filename, checksum(sql), executionTime],
    );
    await client.query("COMMIT");
    console.log(`Applied ${filename} (${executionTime} ms)`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`Migration ${filename} failed: ${error.message}`, { cause: error });
  }
}

async function withMigrationClient(callback) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const client = createClient(databaseUrl);
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
    await ensureMigrationTable(client);
    return await callback(client, databaseUrl);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]);
    } finally {
      await client.end();
    }
  }
}

export async function runMigrations() {
  return withMigrationClient(async (client, databaseUrl) => {
    const files = migrationFiles();
    await baselineExistingCoreSchema(client, files);
    const executed = await executedMigrations(client);
    validateAppliedChecksums(executed, files);
    const pending = files.filter((filename) => !executed.has(filename));

    console.log(`Database: ${databaseLabel(databaseUrl)}`);
    if (pending.length === 0) {
      console.log("Database schema is up to date.");
      return;
    }

    console.log(`Applying ${pending.length} migration(s)...`);
    for (const filename of pending) {
      await executeMigration(client, filename);
    }
    console.log("Database migrations completed.");
  });
}

export async function showStatus() {
  return withMigrationClient(async (client) => {
    const files = migrationFiles();
    await baselineExistingCoreSchema(client, files);
    const executed = await executedMigrations(client);
    validateAppliedChecksums(executed, files);
    for (const filename of files) {
      console.log(`${executed.has(filename) ? "[applied]" : "[pending]"} ${filename}`);
    }
    const unknown = [...executed.keys()].filter((filename) => !files.includes(filename));
    for (const filename of unknown) {
      console.log(`[missing-file] ${filename}`);
    }
  });
}

async function main() {
  const command = process.argv[2] ?? "run";
  if (command === "run") return runMigrations();
  if (command === "status") return showStatus();
  throw new Error(`Unknown command "${command}". Use "run" or "status".`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
