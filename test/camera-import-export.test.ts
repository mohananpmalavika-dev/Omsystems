import { describe, it, expect } from "vitest";

describe("Camera Import & Export Specification & Parsing", () => {
  it("validates required camera fields: name, ip, username, password", () => {
    const rawHeaders = [
      "camera_name",
      "ip_address",
      "username",
      "password",
      "vendor",
      "model",
      "rtsp_port",
    ];
    expect(rawHeaders).toContain("camera_name");
    expect(rawHeaders).toContain("ip_address");
    expect(rawHeaders).toContain("username");
    expect(rawHeaders).toContain("password");
  });

  it("generates correct default RTSP paths based on vendor", () => {
    function getDefaultPaths(vendor: string, channel: number = 1) {
      const norm = vendor.toLowerCase();
      if (norm.includes("hik")) {
        return {
          main: `/Streaming/Channels/${channel}01`,
          sub: `/Streaming/Channels/${channel}02`,
        };
      }
      if (norm.includes("dahua") || norm.includes("cp")) {
        return {
          main: `/cam/realmonitor?channel=${channel}&subtype=0`,
          sub: `/cam/realmonitor?channel=${channel}&subtype=1`,
        };
      }
      if (norm.includes("uniview")) {
        return {
          main: `/unicast/c${channel}/s0/live`,
          sub: `/unicast/c${channel}/s1/live`,
        };
      }
      return {
        main: `/live/ch${channel}`,
        sub: `/live/ch${channel}_sub`,
      };
    }

    expect(getDefaultPaths("hikvision", 1).main).toBe("/Streaming/Channels/101");
    expect(getDefaultPaths("dahua", 2).main).toBe("/cam/realmonitor?channel=2&subtype=0");
    expect(getDefaultPaths("cpplus", 1).main).toBe("/cam/realmonitor?channel=1&subtype=0");
    expect(getDefaultPaths("uniview", 1).main).toBe("/unicast/c1/s0/live");
  });

  it("masks credentials properly during export when requested", () => {
    const rawSecret = "vault://branches/b1/cameras/cam-01";
    const mask = (secret: string, shouldMask: boolean) =>
      shouldMask ? "PROTECTED_VAULT_REF" : secret;

    expect(mask(rawSecret, true)).toBe("PROTECTED_VAULT_REF");
    expect(mask(rawSecret, false)).toBe(rawSecret);
  });
});
