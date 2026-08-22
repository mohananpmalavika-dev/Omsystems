import { describe, expect, it } from "vitest";
import { parseBulkCameraCsv } from "./camera-registration.js";

describe("parseBulkCameraCsv", () => {
  it("parses branch, camera, network, and secret fields from a CSV payload", () => {
    const csv = [
      "branchCode,cameraName,ip,port,manufacturer,model,serial,streamProfile,secretReference",
      "BLR-001,Main Entrance,192.168.1.20,554,Hikvision,DS-2CD,ABC123,main,edge://gateway/entry",
    ].join("\n");

    const rows = parseBulkCameraCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      branchCode: "BLR-001",
      cameraName: "Main Entrance",
      ip: "192.168.1.20",
      port: 554,
      manufacturer: "Hikvision",
      model: "DS-2CD",
      serial: "ABC123",
      streamProfile: "main",
      secretReference: "edge://gateway/entry",
    });
  });

  it("rejects rows missing required fields", () => {
    const csv = [
      "branchCode,cameraName,ip,port,manufacturer,model,serial,streamProfile,secretReference",
      "BLR-001,,192.168.1.20,554,Hikvision,DS-2CD,ABC123,main,edge://gateway/entry",
    ].join("\n");

    expect(() => parseBulkCameraCsv(csv)).toThrow("Bulk registration row 1 is missing cameraName");
  });
});
