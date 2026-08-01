import { NextResponse } from 'next/server';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

export async function DELETE() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();

    // Delete all in correct order
    await client.query('DELETE FROM cameras');
    await client.query('DELETE FROM edge_agent_telemetry');
    await client.query('DELETE FROM camera_discovery_records');
    await client.query('DELETE FROM camera_scan_jobs');
    await client.query('DELETE FROM live_sessions');
    const result = await client.query('DELETE FROM edge_agents');

    return NextResponse.json({ 
      success: true, 
      deleted: result.rowCount 
    });
  } catch (error: any) {
    console.error('Delete all gateways error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
