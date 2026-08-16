import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const capabilities = await request.json().catch(() => ({}));
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return NextResponse.json({
      success: true,
      clientId,
      registeredAt: new Date().toISOString(),
      acceptedCapabilities: capabilities,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: "registration_failed" }, { status: 400 });
  }
}
