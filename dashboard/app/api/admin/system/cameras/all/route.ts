import { NextResponse } from 'next/server';

export async function DELETE() {
  return NextResponse.json(
    {
      error: 'operation_not_supported',
      message: 'Bulk camera deletion is disabled. Remove cameras individually through the control plane.',
    },
    { status: 405, headers: { Allow: 'GET' } },
  );
}
