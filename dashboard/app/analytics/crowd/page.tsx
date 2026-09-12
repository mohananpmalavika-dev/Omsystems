import { CrowdAnalyticsWorkspace } from "@/components/crowd-analytics-workspace";

export const metadata = {
  title: "Crowd Density & Queue Length Detection | KryptoVision",
  description: "Branch hall spatial crowd density estimation and counter queue length SLA threshold monitoring.",
};

export default function CrowdAnalyticsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <CrowdAnalyticsWorkspace />
    </div>
  );
}
