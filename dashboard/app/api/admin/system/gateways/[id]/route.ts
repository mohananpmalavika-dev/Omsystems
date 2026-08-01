import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://omcamera_y1ej_user:0roU7pJ6wA6o9TWB9m2hVeFIKeUZE2JR@dpg-d9m3b1rm8hqs739pr5ag-a.oregon-postgres.render.com/omcamera_y1ej';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();

    const { id } = await params;

    // Delete in order due to foreign keys
    await client.query('DELETE FROM cameras WHERE edge_agent_id = $1', [id]);
    await client.query('DELETE FROM edge_agent_telemetry WHERE edge_agent_id = $1', [id]);
    await client.query('DELETE FROM camera_discovery_records WHERE edge_agent_id = $1', [id]);
    await client.query('DELETE FROM camera_scan_jobs WHERE edge_agent_id = $1', [id]);
    await client.query('DELETE FROM live_sessions WHERE edge_agent_id = $1', [id]);
    await client.query('DELETE FROM edge_agents WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete gateway error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
