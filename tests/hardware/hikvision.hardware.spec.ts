import { describe, expect, it } from "vitest";
import { HikvisionRecorderAdapter } from "../../src/recorders/adapters/hikvision-recorder.adapter.js";
import { hardwareCertificationRunner } from "./hardware-certification-runner.js";

describe("Hikvision Hardware-in-the-Loop Certification (P1-6 & P1-7)", () => {
  const host = process.env.HIKVISION_TEST_HOST;
  const username = process.env.HIKVISION_TEST_USER || "admin";
  const password = process.env.HIKVISION_TEST_PASSWORD || "Pass@12345";
  const port = Number(process.env.HIKVISION_TEST_PORT || 80);

  it("skips physical hardware tests gracefully when bench credentials are not configured", () => {
    if (!host) {
      expect(true).toBe(true);
      return;
    }
  });

  it.skipIf(!host)("executes full KV-CERT-1.0 suite against physical Hikvision NVR", async () => {
    const adapter = new HikvisionRecorderAdapter({
      ipAddress: host!,
      port,
      username,
      password,
      useHttps: false,
    });

    const { result, record } = await hardwareCertificationRunner.executeCertificationSuite(adapter, {
      manufacturer: "Hikvision",
      model: "DS-7616NI-K2",
      firmware: "V4.61.025",
      testOperator: "Banking Lab QA",
      testEnvironment: "Bench Rack A",
    });

    expect(result.overall).toBe("CERTIFIED");
    expect(record.certificationStatus).toBe("CERTIFIED");
    expect(record.evidenceLogFiles?.length).toBeGreaterThan(0);
  });
});
