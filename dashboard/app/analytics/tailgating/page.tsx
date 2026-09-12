import { TailgatingDetectionWorkspace } from "@/components/tailgating-detection-workspace";

export const metadata = {
  title: "Access Control Tailgating & Airlock Detection | KryptoVision",
  description: "Sequence correlation between badge swipe events and camera person counts in secure airlock portals.",
};

export default function TailgatingAnalyticsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <TailgatingDetectionWorkspace />
    </div>
  );
}
