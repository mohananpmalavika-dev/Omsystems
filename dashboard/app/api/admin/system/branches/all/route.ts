import { NextResponse } from 'next/server';

export async function DELETE() {
  return NextResponse.json(
    {
      error: 'operation_not_supported',
      message: 'Bulk branch deletion is disabled. Use the audited branch lifecycle workflow.',
    },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
