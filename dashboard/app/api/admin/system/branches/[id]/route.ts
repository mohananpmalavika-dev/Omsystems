import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();

    const { id } = await context.params;

    // Get all gateways in this branch
    const gateways = await client.query(
      'SELECT id FROM edge_agents WHERE branch_id = $1',
      [id]
    );

    // Delete each gateway's dependencies
    for (const gateway of gateways.rows) {
      await client.query('DELETE FROM cameras WHERE edge_agent_id = $1', [gateway.id]);
      await client.query('DELETE FROM edge_agent_telemetry WHERE edge_agent_id = $1', [gateway.id]);
      await client.query('DELETE FROM camera_discovery_records WHERE edge_agent_id = $1', [gateway.id]);
      await client.query('DELETE FROM camera_scan_jobs WHERE edge_agent_id = $1', [gateway.id]);
      await client.query('DELETE FROM live_sessions WHERE edge_agent_id = $1', [gateway.id]);
      await client.query('DELETE FROM edge_agents WHERE id = $1', [gateway.id]);
    }

    // Delete the branch
    await client.query('DELETE FROM branches WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete branch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
