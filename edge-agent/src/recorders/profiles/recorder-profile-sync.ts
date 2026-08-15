import type { RecorderDeviceProfile } from "../types/recorder-profile.types.js";

export class RecorderProfileSync {
  constructor(
    private readonly controlPlaneUrl: string,
    private readonly sharedKey?: string,
  ) {}

  async syncProfile(profile: RecorderDeviceProfile): Promise<{ success: boolean; error?: string }> {
    const url = `${this.controlPlaneUrl.replace(/\/$/, "")}/v1/recorders/${encodeURIComponent(profile.recorderId)}/profile`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.sharedKey) {
      headers["x-edge-bridge-key"] = this.sharedKey;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(profile),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `Control plane rejected profile sync: status ${res.status}`,
        };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: String(err?.message ?? err),
      };
    }
  }
}
