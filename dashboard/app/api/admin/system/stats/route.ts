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
      SELECT 
        (SELECT COUNT(*) FROM edge_agents) as gateways,
        (SELECT COUNT(*) FROM cameras) as cameras,
        (SELECT COUNT(*) FROM branches) as branches,
        (SELECT COUNT(*) FROM live_sessions) as live_sessions,
        (SELECT COUNT(*) FROM edge_agent_telemetry) as telemetry_records
    `);

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    console.error('Stats error:', error);
    // Return zeros if tables don't exist
    return NextResponse.json({
      gateways: 0,
      cameras: 0,
      branches: 0,
      live_sessions: 0,
      telemetry_records: 0
    });
  } finally {
    await client.end();
  }
}
