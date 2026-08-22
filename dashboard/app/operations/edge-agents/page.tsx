import { BranchEdgeProductView } from "@/components/branch-edge-product-view";

export const metadata = {
  title: "400-Branch Enterprise Edge Appliance & Fleet Control | Sentinel Grid",
  description: "Enterprise 400-Branch Edge Appliance: Multi-Protocol Device Discovery, WAN Outage Store-and-Forward Buffering, Network Diagnostics, and Local Credential Rotation",
};

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            400-Branch Enterprise Edge Appliance & Fleet Control
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Zero-Outage Branch Architecture: Multi-Protocol Discovery (ONVIF/Dahua/Hik/CP PLUS), 5GB Local Buffer Queue, Broadband & LTE Failover, and Local Credential Rotation
          </p>
        </div>
        <BranchEdgeProductView />
      </div>
    </div>
  );
}
