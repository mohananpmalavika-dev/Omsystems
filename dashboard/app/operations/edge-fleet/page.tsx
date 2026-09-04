import React from "react";
import { EdgeFleetManager } from "@/components/edge-fleet-manager";

export const metadata = {
  title: "Edge Fleet Lifecycle & Digital Twin | KryptonVision",
  description: "Enterprise 400-Branch Edge Gateway Lifecycle, Signed Staged Rollouts, and Blast Radius Analysis",
};

export default function EdgeFleetPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <EdgeFleetManager />
      </div>
    </div>
  );
}
