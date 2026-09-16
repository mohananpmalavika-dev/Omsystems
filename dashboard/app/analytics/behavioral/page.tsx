import { BehavioralAnalyticsWorkspace } from "@/components/behavioral-analytics-workspace";

export const metadata = {
  title: "Behavioral Analytics & Anomaly Detection | KryptoVision",
  description: "Real-time behavioral pattern analysis, anomaly detection, and predictive security analytics for advanced threat monitoring.",
};

export default function BehavioralAnalyticsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <BehavioralAnalyticsWorkspace />
    </div>
  );
}
