import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { GET as getGateways } from '../route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return getGateways(request);
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: 'operation_not_supported',
      message: 'Bulk gateway deletion is disabled. Remove gateways individually through the control plane.',
    },
    { status: 405, headers: { Allow: 'GET' } },
  );
}

