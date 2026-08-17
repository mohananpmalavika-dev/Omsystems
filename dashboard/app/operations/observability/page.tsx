import React from "react";
import { VmsObservabilityView } from "@/components/vms-observability-view";

export const metadata = {
  title: "VMS-Grade Observability & Prometheus Metrics | Sentinel Grid",
  description: "Enterprise Prometheus / OpenTelemetry instrumentation for Cameras, Recording Engine, Media Nodes, Storage, and Digital Twin",
};

export default function ObservabilityPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            VMS-Grade Observability & Prometheus Metrics
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Authoritative Core Metrics: vms_camera_online, vms_camera_stream_fps, vms_camera_bitrate, vms_recording_segments, vms_recording_gaps, and Storage Latency Histograms
          </p>
        </div>
        <VmsObservabilityView />
      </div>
    </div>
  );
}
