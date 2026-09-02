import { NextRequest, NextResponse } from "next/server";

export type StreamQuality = "MAINSTREAM" | "SUBSTREAM" | "AUTO";

let globalPreference: StreamQuality =
  (process.env.ADMIN_STREAM_PREFERENCE as StreamQuality) || "AUTO";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    preference: globalPreference,
    description:
      globalPreference === "MAINSTREAM"
        ? "Global Main Stream Enforced (High Definition 1080p/4K across all cameras)"
        : globalPreference === "SUBSTREAM"
        ? "Global Sub Stream Enforced (Low Bandwidth 640x480 across all cameras)"
        : "Adaptive Dynamic (Auto-switches between Main and Sub Stream based on grid size & network)",
    availableOptions: ["MAINSTREAM", "SUBSTREAM", "AUTO"],
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const preference = String(body.preference || "AUTO").toUpperCase() as StreamQuality;

    if (!["MAINSTREAM", "SUBSTREAM", "AUTO"].includes(preference)) {
      return NextResponse.json(
        { error: "Invalid preference. Must be MAINSTREAM, SUBSTREAM, or AUTO." },
        { status: 400 }
      );
    }

    globalPreference = preference;

    return NextResponse.json({
      success: true,
      preference,
      message: `Global stream quality preference successfully updated to ${preference}.`,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to update stream preference" },
      { status: 500 }
    );
  }
}
