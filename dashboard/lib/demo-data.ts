import type { Branch, Camera } from "./types";

export const demoBranches: Branch[] = [
  { id: "branch-blr-001", name: "Bengaluru Central", type: "branch", cameraCount: 8, onlineCount: 7 },
  { id: "branch-chn-014", name: "Chennai Anna Nagar", type: "branch", cameraCount: 7, onlineCount: 7 },
  { id: "branch-hyd-008", name: "Hyderabad Jubilee Hills", type: "branch", cameraCount: 8, onlineCount: 6 },
  { id: "branch-cok-022", name: "Kochi Marine Drive", type: "branch", cameraCount: 6, onlineCount: 6 },
];

const cameraNames = [
  "Main Entrance",
  "Customer Lobby",
  "Service Counter",
  "Cash Room",
  "Rear Exit",
  "Parking Bay",
  "Server Corridor",
  "Loading Area",
];

export function demoCameras(branchId: string): Camera[] {
  const branch = demoBranches.find((item) => item.id === branchId) ?? demoBranches[0]!;
  return cameraNames.map((name, index) => ({
    id: `${branch.id}-cam-${index + 1}`,
    name,
    branchId: branch.id,
    branchName: branch.name,
    vendor: index % 3 === 0 ? "hikvision" : index % 3 === 1 ? "cp-plus" : "other",
    model: index % 2 === 0 ? "2MP IP Camera" : "4MP IP Camera",
    status: index === 6 ? "degraded" : index === 7 && branch.id.includes("hyd") ? "offline" : "online",
    channel: index + 1,
    capabilities: {
      ptz: index === 0 || index === 5,
      audio: index < 4,
      events: true,
    },
  }));
}
