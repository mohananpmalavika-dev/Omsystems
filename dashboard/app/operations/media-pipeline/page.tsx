import React from "react";
import { MediaPipelineSchedulerView } from "@/components/media-pipeline-scheduler-view";

export const metadata = {
  title: "Media Pipeline & Intelligent Stream Scheduler | KryptonVision",
  description: "GPU-Accelerated Video Decode Pipelines, Dynamic Stream Scheduling, and Adaptive WAN Degradation Matrix",
};

export default function MediaPipelinePage() {
  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">
        <MediaPipelineSchedulerView />
      </div>
    </div>
  );
}
