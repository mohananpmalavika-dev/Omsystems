import React from "react";
import { AssetReplacementManager } from "@/components/asset-replacement-manager";

export const metadata = {
  title: "Asset Lifecycle & Spare Replacement | Sentinel Grid",
  description: "Enterprise Asset Lifecycle, Zero-Downtime Spare Replacement & Digital Twin Hardware Lineage",
};

export default function AssetsPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <AssetReplacementManager />
      </div>
    </div>
  );
}
