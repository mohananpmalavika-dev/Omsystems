import { describe, expect, it } from "vitest";
import { parseDeviceXml } from "../src/discovery/ssdp-discovery.js";
import { parseDnsPacket } from "../src/discovery/mdns-discovery.js";

describe("Production SSDP & mDNS Discovery Parsers", () => {
  it("decodes mDNS DNS packets with A, PTR, and TXT records accurately", () => {
    // Construct a synthetic DNS response packet
    // Header: ID=0, Flags=0x8400 (Response, Authoritative), QD=0, AN=2, NS=0, AR=1
    const header = Buffer.from([
      0x00, 0x00, 0x84, 0x00,
      0x00, 0x00, 0x00, 0x02,
      0x00, 0x00, 0x00, 0x01,
    ]);

    // Answer 1: PTR record for _rtsp._tcp.local -> MyCamera._rtsp._tcp.local
    // Name: \x05_rtsp\x04_tcp\x05local\x00
    const ptrQName = Buffer.from([
      0x05, 0x5f, 0x72, 0x74, 0x73, 0x70, // _rtsp
      0x04, 0x5f, 0x74, 0x63, 0x70,       // _tcp
      0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, // local
      0x00,
    ]);
    const ptrTarget = Buffer.from([
      0x08, 0x4d, 0x79, 0x43, 0x61, 0x6d, 0x65, 0x72, 0x61, // MyCamera
      0xc0, 0x0c, // Pointer to _rtsp._tcp.local
    ]);
    const ptrRecord = Buffer.concat([
      ptrQName,
      Buffer.from([0x00, 0x0c, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78]), // Type PTR (12), Class IN (1), TTL 120
      Buffer.from([0x00, ptrTarget.length]), // rdLength
      ptrTarget,
    ]);

    // Answer 2: TXT record with manufacturer=Axis and model=P3245
    const txtName = Buffer.from([0xc0, 0x0c + ptrQName.length + 10]); // pointer to MyCamera._rtsp._tcp.local
    const txtData = Buffer.from([
      0x11, ...Buffer.from("manufacturer=Axis"),
      0x0b, ...Buffer.from("model=P3245"),
    ]);
    const txtRecord = Buffer.concat([
      txtName,
      Buffer.from([0x00, 0x10, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78]), // Type TXT (16), Class IN (1), TTL 120
      Buffer.from([0x00, txtData.length]),
      txtData,
    ]);

    // Additional 1: A record for MyCamera.local -> 192.168.1.50
    const aName = Buffer.from([
      0x08, 0x4d, 0x79, 0x43, 0x61, 0x6d, 0x65, 0x72, 0x61,
      0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c,
      0x00,
    ]);
    const aRecord = Buffer.concat([
      aName,
      Buffer.from([0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x78]), // Type A (1), Class IN (1), TTL 120
      Buffer.from([0x00, 0x04]), // rdLength = 4
      Buffer.from([192, 168, 1, 50]),
    ]);

    const packet = Buffer.concat([header, ptrRecord, txtRecord, aRecord]);
    const parsed = parseDnsPacket(packet);

    expect(parsed.answers.length).toBe(2);
    expect(parsed.answers[0]?.type).toBe(12); // PTR
    expect(parsed.answers[0]?.data.ptrName).toContain("MyCamera");

    expect(parsed.answers[1]?.type).toBe(16); // TXT
    expect(parsed.answers[1]?.data.txt.manufacturer).toBe("Axis");
    expect(parsed.answers[1]?.data.txt.model).toBe("P3245");

    expect(parsed.additionals.length).toBe(1);
    expect(parsed.additionals[0]?.type).toBe(1); // A
    expect(parsed.additionals[0]?.data.ip).toBe("192.168.1.50");
  });

  it("handles empty or invalid DNS packets gracefully without throwing", () => {
    const empty = parseDnsPacket(Buffer.alloc(0));
    expect(empty.answers).toEqual([]);
    expect(empty.additionals).toEqual([]);

    const short = parseDnsPacket(Buffer.from([0x00, 0x01]));
    expect(short.answers).toEqual([]);
  });
});
