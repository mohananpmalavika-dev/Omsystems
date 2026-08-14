import { NextRequest, NextResponse } from 'next/server';

// Use server-side env variables for API routes
const API_BASE_URL = process.env.CONTROL_PLANE_URL || 
                      process.env.CONTROL_PLANE_INTERNAL_URL || 
                      process.env.NEXT_PUBLIC_API_URL || 
                      'http://localhost:8080';

/**
 * GET /api/audit/maintenance
 * Get maintenance work orders
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const cameraId = searchParams.get('cameraId');
    const branchNodeId = searchParams.get('branchNodeId');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const workType = searchParams.get('workType');
    const assignedTechnicianId = searchParams.get('assignedTechnicianId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const summary = searchParams.get('summary') === 'true';

    const params = new URLSearchParams();
    if (cameraId) params.append('cameraId', cameraId);
    if (branchNodeId) params.append('branchNodeId', branchNodeId);
    if (status) params.append('status', status);
    if (priority) params.append('priority', priority);
    if (workType) params.append('workType', workType);
    if (assignedTechnicianId) params.append('assignedTechnicianId', assignedTechnicianId);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    if (summary) params.append('summary', 'true');

    const url = `${API_BASE_URL}/v1/maintenance/workorders?${params.toString()}`;

    const sessionToken = request.cookies.get('sentinel_access')?.value;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${sessionToken || ''}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Maintenance API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch maintenance work orders' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audit/maintenance
 * Create maintenance work order
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const url = `${API_BASE_URL}/v1/maintenance/workorders`;

    const sessionToken = request.cookies.get('sentinel_access')?.value;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      credentials: 'include',
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Create maintenance work order API error:', error);
    return NextResponse.json(
      { error: 'Failed to create maintenance work order' },
      { status: 500 }
    );
  }
}
