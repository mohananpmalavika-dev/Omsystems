import React from "react";
import { HaFailoverView } from "@/components/ha-failover-view";

export const metadata = {
  title: "High Availability & Automated Camera Failover | KryptonVision",
  description: "Distributed Redis Leases, Fencing Token Epochs, Split-Brain Prevention, and Capacity Scheduling across Failure Domains",
};

export default function HaFailoverPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            High Availability & Automated Camera Failover
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Zero-SPOF Distributed Architecture: Redis HA Leases with Monotonic Fencing Epochs, Split-Brain Protection, and Capacity Scheduling
          </p>
        </div>
        <HaFailoverView />
      </div>
    </div>
  );
}
