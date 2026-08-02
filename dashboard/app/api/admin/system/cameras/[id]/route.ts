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

    // Delete dependent records first
    await client.query('DELETE FROM live_sessions WHERE camera_id = $1', [id]);
    await client.query('DELETE FROM camera_discovery_records WHERE camera_id = $1', [id]);
    await client.query('DELETE FROM cameras WHERE id = $1', [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete camera error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
