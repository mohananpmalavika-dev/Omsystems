import { AbandonedObjectWorkspace } from "@/components/abandoned-object-workspace";

export const metadata = {
  title: "Abandoned & Unattended Object Detection | KryptoVision",
  description: "Static foreground blob tracking for bags, boxes, or parcels left in sensitive banking and transit areas.",
};

export default function AbandonedObjectsAnalyticsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <AbandonedObjectWorkspace />
    </div>
  );
}
