import { NextResponse } from 'next/server';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

export async function DELETE() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();

    // Delete dependent records first
    await client.query('DELETE FROM live_sessions WHERE camera_id IS NOT NULL');
    await client.query('DELETE FROM camera_discovery_records WHERE camera_id IS NOT NULL');
    const result = await client.query('DELETE FROM cameras');

    return NextResponse.json({ 
      success: true, 
      deleted: result.rowCount 
    });
  } catch (error: any) {
    console.error('Delete all cameras error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
