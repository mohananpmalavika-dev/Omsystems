import { NextRequest, NextResponse } from "next/server";
import { StreamProfileSelector } from "../../../../../src/media/services/stream-profile-selector.js";
import type { StreamQuality } from "../../../../../src/media/domain/media-session.types.js";

export async function GET() {
  const currentPreference = StreamProfileSelector.getGlobalAdminPreference();
  return NextResponse.json({
    preference: currentPreference,
    description:
      currentPreference === "MAINSTREAM"
        ? "Global Main Stream Enforced (High Definition 1080p/4K across all cameras)"
        : currentPreference === "SUBSTREAM"
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

    StreamProfileSelector.setGlobalAdminPreference(preference);

    return NextResponse.json({
      success: true,
      preference,
      message: `Global stream quality preference successfully updated to ${preference}.`,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update stream preference" },
      { status: 500 }
    );
  }
}
