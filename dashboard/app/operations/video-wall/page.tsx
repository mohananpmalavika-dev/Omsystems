import React from "react";
import { AdaptiveVideoWall } from "@/components/adaptive-video-wall";

export const metadata = {
  title: "144-Grid Adaptive Video Wall & Live View | Sentinel Grid",
  description: "Ultra-Efficient 144-Camera Video Wall with Adaptive Stream Profiles, Hardware Decoder Governance, and Instant Focus Maximization",
};

export default function VideoWallPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            144-Grid Adaptive Video Wall & Live Ingest
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Dynamic Adaptive Stream Profiles: 1080p Mainstream on Solo/Focus, 360p Substream on 16-Grid, and 180p Keyframes on 144-Wall (98% Bandwidth Reduction)
          </p>
        </div>
        <AdaptiveVideoWall />
      </div>
    </div>
  );
}
