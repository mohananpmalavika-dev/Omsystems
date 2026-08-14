import { describe, expect, it } from "vitest";
import { parseQrPayload } from "../lib/qr-payload.js";

describe("parseQrPayload", () => {
  it("recognizes a TrueCloud share code without retaining its token", () => {
    const result = parseQrPayload(
      "https://openapi.dvr163.com/share/device?method=new_use_qrcode&token=opaque-token&expiredTime=2000000000&userId=12345",
      1_700_000_000_000,
    );

    expect(result).toEqual({
      kind: "truecloud-share",
      expiresAt: new Date(2_000_000_000_000),
      expired: false,
    });
    expect(JSON.stringify(result)).not.toContain("opaque-token");
  });

  it("marks an expired TrueCloud share code", () => {
    expect(
      parseQrPayload(
        "https://openapi.dvr163.com/share/device?method=new_use_qrcode&expiredTime=1600000000",
        1_700_000_000_000,
      ),
    ).toMatchObject({ kind: "truecloud-share", expired: true });
  });

  it("extracts complete camera credentials from structured QR data", () => {
    expect(parseQrPayload('{"id":"camera-1","user":"admin","pwd":"s3cret","ip":"192.168.1.20"}')).toEqual({
      kind: "credentials",
      deviceId: "camera-1",
      username: "admin",
      password: "s3cret",
      ipAddress: "192.168.1.20",
    });
  });

  it("does not trust a similarly shaped URL from another host", () => {
    expect(
      parseQrPayload("https://openapi.dvr163.example/share/device?method=new_use_qrcode&expiredTime=2000000000"),
    ).toEqual({ kind: "unsupported" });
  });
});
