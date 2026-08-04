import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const controlPlaneUrl = process.env.CONTROL_PLANE_INTERNAL_URL || 'http://localhost:8080';
    
    const response = await fetch(`${controlPlaneUrl}/v1/admin/cameras/list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Control plane returned ${response.status}`);
      return NextResponse.json(
        { error: 'Failed to fetch cameras' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Return the cameras array directly (frontend expects array, not {cameras: [...]}
    return NextResponse.json(data.cameras || []);
  } catch (error) {
    console.error('Error fetching cameras:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
