import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { getCurrentUser } from "../../../../../../lib/backend";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface VideoWallConfig {
  id?: string;
  name: string;
  displays: any[];
  syncEnabled: boolean;
  rotationInterval?: number;
  rotationEnabled: boolean;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// GET - Retrieve all video wall configs
export async function GET(req: NextRequest) {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await pool.query(
      `SELECT 
        vw.id,
        vw.name,
        vw.displays,
        vw.sync_enabled as "syncEnabled",
        vw.rotation_interval as "rotationInterval",
        vw.rotation_enabled as "rotationEnabled",
        vw.user_id as "userId",
        vw.created_at as "createdAt",
        vw.updated_at as "updatedAt"
      FROM video_wall_configs vw
      WHERE vw.user_id = $1
      ORDER BY vw.updated_at DESC`,
      [user.id]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching video wall configs:", error);
    return NextResponse.json(
      { error: "Failed to fetch video wall configs" },
      { status: 500 }
    );
  }
}

// POST - Create a new video wall config
export async function POST(req: NextRequest) {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: VideoWallConfig = await req.json();

    if (!body.name || !body.displays) {
      return NextResponse.json(
        { error: "Missing required fields: name, displays" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO video_wall_configs (
        name,
        displays,
        sync_enabled,
        rotation_interval,
        rotation_enabled,
        user_id
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6
      ) RETURNING 
        id,
        name,
        displays,
        sync_enabled as "syncEnabled",
        rotation_interval as "rotationInterval",
        rotation_enabled as "rotationEnabled",
        user_id as "userId",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        body.name,
        JSON.stringify(body.displays),
        body.syncEnabled,
        body.rotationInterval || null,
        body.rotationEnabled,
        user.id,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating video wall config:", error);
    return NextResponse.json(
      { error: "Failed to create video wall config" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a video wall config
export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const configId = searchParams.get("id");

    if (!configId) {
      return NextResponse.json(
        { error: "Missing config id" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `DELETE FROM video_wall_configs
       WHERE id = $1
       AND user_id = $2
       RETURNING id`,
      [configId, user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Config not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, id: configId });
  } catch (error) {
    console.error("Error deleting video wall config:", error);
    return NextResponse.json(
      { error: "Failed to delete video wall config" },
      { status: 500 }
    );
  }
}

async function authenticatedUser(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const sessionToken = request.cookies.get("sentinel_access")?.value ??
    request.headers.get("x-sentinel-session") ?? bearerToken;
  if (!sessionToken) return null;
  return getCurrentUser(sessionToken);
}
