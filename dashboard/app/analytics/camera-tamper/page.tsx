import { CameraTamperWorkspace } from "@/components/camera-tamper-workspace";

export const metadata = {
  title: "Camera Tamper & Defocus Detection | KryptoVision",
  description: "Edge-based statistical frame analysis detecting camera movement, blinding, lens covering, and defocus.",
};

export default function CameraTamperAnalyticsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <CameraTamperWorkspace />
    </div>
  );
}
