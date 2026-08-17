import React from "react";
import { AuthoritativeMediaPipelineView } from "@/components/authoritative-media-pipeline-view";

export const metadata = {
  title: "Media Pipeline & HA | Sentinel Grid",
  description: "Live media infrastructure control plane, active camera sessions, cluster nodes, and automated failover",
};

export default function MediaPipelinePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AuthoritativeMediaPipelineView />
    </div>
  );
}
