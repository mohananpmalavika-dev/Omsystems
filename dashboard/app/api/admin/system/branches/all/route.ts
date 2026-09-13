import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { GET as getBranches } from '../route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return getBranches(request);
}

export async function DELETE() {
  return NextResponse.json(
    {
      error: 'operation_not_supported',
      message: 'Bulk branch deletion is disabled. Use the audited branch lifecycle workflow.',
    },
    { status: 405, headers: { Allow: 'GET' } },
  );
}

