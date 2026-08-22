import { describe, expect, it } from "vitest";
import { isBrowserDirectMediaUrl } from "../lib/media-routing";

describe("media routing", () => {
  it("routes LAN, loopback, and common VPN addresses through the browser", () => {
    expect(isBrowserDirectMediaUrl("http://127.0.0.1:8090")).toBe(true);
    expect(isBrowserDirectMediaUrl("http://192.168.29.101:8090")).toBe(true);
    expect(isBrowserDirectMediaUrl("https://100.80.10.5:8090")).toBe(true);
    expect(isBrowserDirectMediaUrl("https://camera-gateway.local:8090")).toBe(true);
  });

  it("keeps public media gateways on the server-side route", () => {
    expect(isBrowserDirectMediaUrl("https://branch-media.example.com")).toBe(false);
    expect(isBrowserDirectMediaUrl("ftp://127.0.0.1:8090")).toBe(false);
    expect(isBrowserDirectMediaUrl("not-a-url")).toBe(false);
  });
});
