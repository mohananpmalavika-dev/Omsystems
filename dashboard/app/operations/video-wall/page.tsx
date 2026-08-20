import React from "react";
import { AppLayout } from "@/components/app-layout";
import { AdaptiveVideoWall } from "@/components/adaptive-video-wall";

export const metadata = {
  title: "Adaptive Video Wall & Live View | Sentinel Grid",
  description: "Ultra-Efficient Adaptive Video Wall with Hardware Decoder Governance and Instant Focus Maximization",
};

export default function VideoWallPage() {
  return (
    <AppLayout>
      <div className="min-h-screen bg-slate-950 p-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              Adaptive Video Wall & Live Ingest
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Dynamic Adaptive Stream Profiles with Hardware Decoder Governance and Instant Solo Maximization
            </p>
          </div>
          <AdaptiveVideoWall />
        </div>
      </div>
    </AppLayout>
  );
}

