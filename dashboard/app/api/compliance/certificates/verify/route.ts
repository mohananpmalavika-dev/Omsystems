import { NextResponse } from 'next/server';

const response = () => NextResponse.json(
  { error: 'Certificate verification is not available on this endpoint.' },
  { status: 410 },
);

// Kept as a deliberate compatibility response for legacy links. Certificate
// verification must be provided by a dedicated, auditable public service.
export async function GET() { return response(); }
export async function POST() { return response(); }
