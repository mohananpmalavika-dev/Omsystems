#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;

if (!sourceUrl || !targetUrl) {
  throw new Error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required");
}

const baseTables = [
  "organizational_hierarchy_rules",
  "tenants",
  "users",
  "resource_nodes",
  "role_permissions",
  "access_grants",
  "user_organizational_assignments",
  "cameras",
  "recording_jobs",
];

function databaseClient(connectionString) {
  const hostname = new URL(connectionString).hostname;
  return new Client({
    connectionString,
    ssl: hostname.endsWith(".render.com")
      ? { rejectUnauthorized: false }
      : false,
  });
}

function identifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

const jsonColumnCache = new Map();

async function jsonColumns(client, table) {
  if (jsonColumnCache.has(table)) return jsonColumnCache.get(table);
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND data_type IN ('json', 'jsonb')`,
    [table],
  );
  const columns = new Set(result.rows.map((row) => row.column_name));
  jsonColumnCache.set(table, columns);
  return columns;
}

async function readRows(client, table) {
  const order = table === "resource_nodes"
    ? " ORDER BY nlevel(path), created_at"
    : "";
  return (await client.query(`SELECT * FROM ${identifier(table)}${order}`)).rows;
}

async function insertRows(client, table, rows) {
  if (rows.length === 0) return 0;

  const columns = Object.keys(rows[0]);
  const json = await jsonColumns(client, table);
  const columnList = columns.map(identifier).join(", ");
  const overriding = table === "audit_events"
    ? " OVERRIDING SYSTEM VALUE"
    : "";
  let inserted = 0;

  for (const row of rows) {
    const values = columns.map((column) => {
      const value = row[column];
      return json.has(column) && value !== null && typeof value !== "string"
        ? JSON.stringify(value)
        : value;
    });
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const result = await client.query(
      `INSERT INTO ${identifier(table)} (${columnList})${overriding}
       VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      values,
    );
    inserted += result.rowCount ?? 0;
  }

  return inserted;
}

async function copyTable(source, target, table, transform = (row) => row) {
  const rows = (await readRows(source, table)).map(transform);
  const inserted = await insertRows(target, table, rows);
  console.log(`${table}: read ${rows.length}, inserted ${inserted}`);
  return rows;
}

const source = databaseClient(sourceUrl);
const target = databaseClient(targetUrl);

await source.connect();
await target.connect();

try {
  await target.query("BEGIN");
  await target.query("SET LOCAL search_path TO public");

  for (const table of baseTables) {
    await copyTable(source, target, table);
  }

  // Incidents and bookmarks can reference each other. Insert incidents without
  // their circular links, insert bookmarks and legal holds, then restore links.
  const incidents = await readRows(source, "live_incidents");
  const insertedIncidents = await insertRows(
    target,
    "live_incidents",
    incidents.map((row) => ({
      ...row,
      primary_bookmark_id: null,
      legal_hold_id: null,
    })),
  );
  console.log(
    `live_incidents: read ${incidents.length}, inserted ${insertedIncidents}`,
  );
  await copyTable(source, target, "live_bookmarks");
  await copyTable(source, target, "recording_legal_holds");

  for (const incident of incidents) {
    await target.query(
      `UPDATE live_incidents
       SET primary_bookmark_id = $2, legal_hold_id = $3
       WHERE id = $1`,
      [incident.id, incident.primary_bookmark_id, incident.legal_hold_id],
    );
  }

  await copyTable(source, target, "audit_events");
  await target.query(`
    SELECT setval(
      pg_get_serial_sequence('audit_events', 'id'),
      GREATEST((SELECT COALESCE(max(id), 1) FROM audit_events), 1),
      true
    )
  `);
  await target.query("COMMIT");
} catch (error) {
  await target.query("ROLLBACK");
  throw error;
} finally {
  await Promise.allSettled([source.end(), target.end()]);
}
