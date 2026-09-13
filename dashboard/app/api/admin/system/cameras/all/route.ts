import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { GET as getCameras } from '../route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return getCameras(request);
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: 'operation_not_supported',
      message: 'Bulk camera deletion is disabled. Remove cameras individually through the control plane.',
    },
    { status: 405, headers: { Allow: 'GET' } },
  );
}

