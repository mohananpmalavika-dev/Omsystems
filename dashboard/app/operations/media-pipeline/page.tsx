import React from "react";
import { HAClusterView } from "@/components/ha-cluster-view";

export const metadata = {
  title: "Media Pipeline & HA | Sentinel Grid",
  description: "Registered media nodes, authoritative camera leases, and observed failover events",
};

export default function MediaPipelinePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <HAClusterView />
    </div>
  );
}
