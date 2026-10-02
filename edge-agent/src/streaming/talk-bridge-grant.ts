import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ConsumedLiveSession } from "../registration/gateway-client.js";

const sessionSchema = z.object({
  id: z.string().min(1), cameraId: z.string().min(1), cameraNodeId: z.string().min(1),
  userId: z.string().min(1), tenantId: z.string().min(1), connectionSecretRef: z.string().min(1),
  purpose: z.literal("talk"),
  profiles: z.array(z.object({ name: z.string(), codec: z.string(), width: z.number(), height: z.number() })),
  vendor: z.enum(["hikvision", "cp-plus", "dahua", "other"]).optional(),
  model: z.string().optional(), channel: z.number().int().positive().optional(),
  recorderChannel: z.number().int().positive().optional(),
});
const grantSchema = z.object({ session: sessionSchema, expiresAt: z.number().finite() });

export function verifyTalkBridgeGrant(grant: string, sharedKey: string): { session: ConsumedLiveSession; expiresAt: number } {
  if (!sharedKey || grant.length > 16_384) throw new Error("invalid_talk_bridge_grant");
  const [payload, signature, extra] = grant.split(".");
  if (!payload || !signature || extra !== undefined) throw new Error("invalid_talk_bridge_grant");
  const expected = createHmac("sha256", sharedKey).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error("invalid_talk_bridge_grant");
  const result = grantSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  if (result.expiresAt <= Date.now() || result.expiresAt > Date.now() + 30_000) throw new Error("expired_talk_bridge_grant");
  const { vendor, model, channel, recorderChannel, ...required } = result.session;
  return { expiresAt: result.expiresAt, session: { ...required,
    ...(vendor !== undefined ? { vendor } : {}), ...(model !== undefined ? { model } : {}),
    ...(channel !== undefined ? { channel } : {}), ...(recorderChannel !== undefined ? { recorderChannel } : {}),
  } };
}
