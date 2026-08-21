import React from "react";
import { AdaptiveVideoWall } from "@/components/adaptive-video-wall";

export const metadata = {
  title: "Live Video Wall | Sentinel Grid",
  description: "Authenticated live camera monitoring with adaptive stream scheduling and hardware decoder governance.",
};

export default function VideoWallPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Live Video Wall
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Live camera inventory from the control plane. Streams are authorized per camera and started only when available.
          </p>
        </div>
        <AdaptiveVideoWall />
      </div>
    </div>
  );
}
