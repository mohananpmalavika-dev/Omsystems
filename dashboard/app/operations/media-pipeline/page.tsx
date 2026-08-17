import React from "react";
import { AuthoritativeMediaPipelineView } from "@/components/authoritative-media-pipeline-view";

export const metadata = {
  title: "Authoritative Media Pipeline & 10/10 Diagnostics | Sentinel Grid",
  description: "Single-Ingest Architecture, Distributed Fencing Leases, Immutable Recording Index, and Forensic Exports",
};

export default function MediaPipelinePage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <AuthoritativeMediaPipelineView />
      </div>
    </div>
  );
}
