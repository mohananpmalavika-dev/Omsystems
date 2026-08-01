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

    // Check if gateway exists
    const gatewayCheck = await client.query('SELECT id FROM edge_gateways WHERE id = $1', [id]);
    if (gatewayCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Gateway not found' }, { status: 404 });
    }

    // Delete related records first (ignore errors if tables don't exist)
    const deleteOperations = [
      { table: 'cameras', column: 'edge_agent_id' },
      { table: 'edge_agent_telemetry', column: 'edge_agent_id' },
      { table: 'camera_discovery_records', column: 'edge_agent_id' },
      { table: 'camera_scan_jobs', column: 'edge_agent_id' },
      { table: 'live_sessions', column: 'edge_agent_id' },
    ];

    for (const op of deleteOperations) {
      try {
        await client.query(`DELETE FROM ${op.table} WHERE ${op.column} = $1`, [id]);
      } catch (err) {
        console.warn(`Could not delete from ${op.table}:`, err);
        // Continue even if this table doesn't exist or has issues
      }
    }

    // Delete the gateway itself (try both table names)
    try {
      await client.query('DELETE FROM edge_gateways WHERE id = $1', [id]);
    } catch (err) {
      // Try alternate table name
      await client.query('DELETE FROM edge_agents WHERE id = $1', [id]);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete gateway error:', error);
    return NextResponse.json({ 
      error: error.message,
      detail: error.detail || 'Unknown error',
      hint: error.hint
    }, { status: 500 });
  } finally {
    await client.end();
  }
}
