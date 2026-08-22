import type { ControlPlaneStore } from "../control-plane-store.js";

export type CreateMediaSessionInput = {
  cameraId: string;
  userId: string;
  purpose?: "MONITORING" | "INVESTIGATION" | "PLAYBACK" | "TALK";
};

export async function createMediaSession(store: ControlPlaneStore, input: CreateMediaSessionInput) {
  // Map higher-level purposes to the store.createLiveSession purpose values
  const purposeMap: Record<string, "view" | "talk"> = {
    MONITORING: "view",
    INVESTIGATION: "view",
    PLAYBACK: "view",
    TALK: "talk",
  } as any;

  const mapped = purposeMap[input.purpose ?? "MONITORING"] ?? "view";

  // Use existing store method to create a short-lived live session
  const session = await store.createLiveSession(input.cameraId, input.userId, mapped);
  return session;
}
