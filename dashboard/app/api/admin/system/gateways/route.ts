import { NextResponse } from 'next/server';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

export async function GET() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();

    const result = await client.query(`
      SELECT id, name, status, last_seen_at, created_at
      FROM edge_agents
      ORDER BY created_at DESC
    `);

    return NextResponse.json(result.rows);
  } catch (error: any) {
    console.error('Get gateways error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
