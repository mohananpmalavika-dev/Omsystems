import { RecorderFleetWidget } from "@/components/operational-health/recorder-fleet-widget";
import { PageHero } from "@/components/page-hero";
import { Server } from "lucide-react";

export default function Page() {
  return <main className="recorder-monitor-page">
    <PageHero
      eyebrow="Recorder infrastructure"
      title="DVR/NVR monitoring"
      description="Track recorder reachability, connected channels, recording evidence, and branch impact in one fleet view."
      icon={Server}
    />
    <RecorderFleetWidget detailed />
  </main>;
}
