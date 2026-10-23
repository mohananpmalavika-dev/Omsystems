import { EdgeMeshBandwidthWorkspace } from "@/components/edge-mesh-bandwidth-workspace";

export const metadata = {
  title: "Smart Edge Offline Mesh & Zero-Bandwidth Mode | Sentinel Grid",
  description:
    "Zero-Bandwidth Mode (1 FPS Quiescent to 4K AI Burst) cutting WAN data costs by 70%+, and Anti-Jamming Local Cache with Store-and-Forward sync for Indian branches.",
};

export default function EdgeMeshPage() {
  return <EdgeMeshBandwidthWorkspace />;
}
