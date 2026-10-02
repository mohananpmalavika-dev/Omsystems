import { createHmac } from "node:crypto";
import type { ConsumedSession } from "./contracts.js";

// This separate grant delegates an already consumed control-plane session.
export function signTalkBridgeGrant(session: ConsumedSession, sharedKey: string): string {
  if (!sharedKey || session.purpose !== "talk" || !session.cameraNodeId) throw new Error("invalid_talk_bridge_session");
  const payload = Buffer.from(JSON.stringify({ session, expiresAt: Date.now() + 30_000 })).toString("base64url");
  const signature = createHmac("sha256", sharedKey).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
