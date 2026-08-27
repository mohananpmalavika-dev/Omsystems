import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { getCurrentUser } from "../../../../../../lib/backend";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface GridLayout {
  id?: string;
  name: string;
  gridSize: string;
  cameraPositions: Array<{
    position: number;
    cameraId: string;
    stream: "main" | "sub";
  }>;
  userId?: string;
  isShared?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// GET - Retrieve all grid layouts for the current user
export async function GET(req: NextRequest) {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const includeShared = searchParams.get("includeShared") === "true";

    let query = `
      SELECT 
        gl.id,
        gl.name,
        gl.grid_size as "gridSize",
        gl.camera_positions as "cameraPositions",
        gl.user_id as "userId",
        gl.is_shared as "isShared",
        gl.created_at as "createdAt",
        gl.updated_at as "updatedAt",
        u.email as "userEmail"
      FROM grid_layouts gl
      LEFT JOIN users u ON u.id = gl.user_id
      WHERE gl.user_id = $1
    `;

    const params = [user.id];

    if (includeShared) {
      query += ` OR (gl.is_shared = true AND u.tenant_id = $2)`;
      params.push(user.tenantId);
    }

    query += ` ORDER BY gl.updated_at DESC`;

    const result = await pool.query(query, params);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching grid layouts:", error);
    return NextResponse.json(
      { error: "Failed to fetch grid layouts" },
      { status: 500 }
    );
  }
}

// POST - Create a new grid layout
export async function POST(req: NextRequest) {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: GridLayout = await req.json();

    if (!body.name || !body.gridSize || !body.cameraPositions) {
      return NextResponse.json(
        { error: "Missing required fields: name, gridSize, cameraPositions" },
        { status: 400 }
      );
    }

    // Validate grid size
    const validGridSizes = ["1x1", "2x2", "3x3", "4x4", "5x5", "6x6", "7x7", "8x8", "9x9", "10x10", "11x11", "12x12"];
    if (!validGridSizes.includes(body.gridSize)) {
      return NextResponse.json(
        { error: "Invalid grid size. Must be one of: " + validGridSizes.join(", ") },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO grid_layouts (
        name,
        grid_size,
        camera_positions,
        user_id,
        is_shared
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5
      ) RETURNING 
        id,
        name,
        grid_size as "gridSize",
        camera_positions as "cameraPositions",
        user_id as "userId",
        is_shared as "isShared",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        body.name,
        body.gridSize,
        JSON.stringify(body.cameraPositions),
        user.id,
        body.isShared || false,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating grid layout:", error);
    return NextResponse.json(
      { error: "Failed to create grid layout" },
      { status: 500 }
    );
  }
}

// PUT - Update an existing grid layout
export async function PUT(req: NextRequest) {
  try {
    const user = await authenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: GridLayout = await req.json();

    if (!body.id) {
      return NextResponse.json(
        { error: "Missing layout id" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `UPDATE grid_layouts
       SET
        name = COALESCE($1, name),
        grid_size = COALESCE($2, grid_size),
        camera_positions = COALESCE($3, camera_positions),
        is_shared = COALESCE($4, is_shared),
        updated_at = NOW()
       WHERE id = $5
       AND user_id = $6
       RETURNING 
        id,
        name,
        grid_size as "gridSize",
        camera_positions as "cameraPositions",
        user_id as "userId",
        is_shared as "isShared",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        body.name,
        body.gridSize,
        body.cameraPositions ? JSON.stringify(body.cameraPositions) : null,
        body.isShared,
        body.id,
        user.id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Layout not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating grid layout:", error);
    return NextResponse.json(
      { error: "Failed to update grid layout" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a grid layout
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
    const layoutId = searchParams.get("id");

    if (!layoutId) {
      return NextResponse.json(
        { error: "Missing layout id" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `DELETE FROM grid_layouts
       WHERE id = $1
       AND user_id = $2
       RETURNING id`,
      [layoutId, user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Layout not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, id: layoutId });
  } catch (error) {
    console.error("Error deleting grid layout:", error);
    return NextResponse.json(
      { error: "Failed to delete grid layout" },
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
