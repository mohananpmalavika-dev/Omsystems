import { FallDetectionWorkspace } from "@/components/fall-detection-workspace";

export const metadata = {
  title: "Worker & Elderly Fall Detection | KryptoVision",
  description: "Pose estimation and bounding box aspect ratio dynamics to detect sudden falls with zero mock data.",
};

export default function FallAnalyticsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <FallDetectionWorkspace />
    </div>
  );
}
