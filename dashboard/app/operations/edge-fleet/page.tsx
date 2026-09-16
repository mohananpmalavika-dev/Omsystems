import React from "react";
import { EdgeFleetManager } from "@/components/edge-fleet-manager";

export const metadata = {
  title: "Edge Agent Management | KryptonVision",
  description: "Enterprise Edge Gateway & Agent Fleet Management, Cryptographic Signed OTA Rollouts, State Reconciliation, and Digital Twin Telemetry",
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
