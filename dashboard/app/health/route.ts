import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const url = new URL("/api/health", request.url);
  return NextResponse.redirect(url, 308);
}
