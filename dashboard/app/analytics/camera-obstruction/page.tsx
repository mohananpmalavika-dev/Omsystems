import { CameraObstructionWorkspace } from "@/components/camera-obstruction-workspace";

export const metadata = {
  title: "Camera Obstruction & Dark Frame Detection | KryptoVision",
  description: "Heuristic detection of lens covering, darkness/blackout, and loss of visual variance with spatial grid analysis.",
};

export default function CameraObstructionAnalyticsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <CameraObstructionWorkspace />
    </div>
  );
}
