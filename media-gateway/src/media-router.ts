import type { MediaRouter } from "./contracts.js";

export class MediaMtxRouter implements MediaRouter {
  constructor(private readonly apiUrl: string) {}

  async ensurePath(path: string, sourceUri: string) {
    const encodedPath = encodeURIComponent(path);
    const payload = {
      source: sourceUri,
      rtspTransport: "tcp",
      sourceOnDemand: true,
      sourceOnDemandStartTimeout: "10s",
      sourceOnDemandCloseAfter: "10s",
    };
    const add = await fetch(
      new URL(`/v3/config/paths/add/${encodedPath}`, this.apiUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (add.ok) return;
    if (add.status !== 400 && add.status !== 409) {
      throw new Error(`Media router rejected path creation (${add.status})`);
    }
    const patch = await fetch(
      new URL(`/v3/config/paths/patch/${encodedPath}`, this.apiUrl),
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!patch.ok) {
      throw new Error(`Media router rejected path update (${patch.status})`);
    }
  }

  async removePath(path: string) {
    const response = await fetch(
      new URL(`/v3/config/paths/delete/${encodeURIComponent(path)}`, this.apiUrl),
      { method: "DELETE" },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Media router rejected path deletion (${response.status})`);
    }
  }
}
