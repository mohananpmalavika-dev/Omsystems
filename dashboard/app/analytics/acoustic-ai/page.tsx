import { AcousticAiWorkspace } from "@/components/acoustic-ai-workspace";

export const metadata = {
  title: "Acoustic AI (Audio Anomaly Detection) | KryptonVision",
  description:
    "Detection of out-of-frame security incidents via Acoustic AI: Glass breaking, distress screaming, gunshots, and rolling shutter tampering with camera blind-spot correlation.",
};

export default function AcousticAiPage() {
  return <AcousticAiWorkspace />;
}
