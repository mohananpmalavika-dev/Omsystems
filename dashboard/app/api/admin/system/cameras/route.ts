import { NextResponse } from 'next/server';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? '';

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
      SELECT c.id, c.model, c.ip_address, c.status, c.edge_agent_id,
             e.name as gateway_name
      FROM cameras c
      LEFT JOIN edge_agents e ON c.edge_agent_id = e.id
      ORDER BY c.created_at DESC
    `);

    return NextResponse.json(result.rows);
  } catch (error: any) {
    console.error('Get cameras error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
