import React from "react";
import { HAClusterView } from "@/components/ha-cluster-view";

export const metadata = {
  title: "HA Architecture & Chaos Engineering | Sentinel Grid",
  description: "Nx Witness & Milestone XProtect Corporate Class Multi-Node HA Topology & Chaos Engineering Console",
};

export default function HATopologyPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <HAClusterView />
      </div>
    </div>
  );
}
