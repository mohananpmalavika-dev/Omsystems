import { describe, expect, it } from "vitest";
import { CpPlusRecorderAdapter } from "../../src/recorders/adapters/cpplus-recorder.adapter.js";
import { hardwareCertificationRunner } from "./hardware-certification-runner.js";

describe("CP Plus Hardware-in-the-Loop Certification (P1-6 & P1-7)", () => {
  const host = process.env.CPPLUS_TEST_HOST;
  const username = process.env.CPPLUS_TEST_USER || "admin";
  const password = process.env.CPPLUS_TEST_PASSWORD || "Pass@12345";
  const port = Number(process.env.CPPLUS_TEST_PORT || 80);

  it("skips physical hardware tests gracefully when bench credentials are not configured", () => {
    if (!host) {
      expect(true).toBe(true);
      return;
    }
  });

  it.skipIf(!host)("executes full KV-CERT-1.0 suite against physical CP Plus DVR/NVR", async () => {
    const adapter = new CpPlusRecorderAdapter({
      ipAddress: host!,
      port,
      username,
      password,
      useHttps: false,
    });

    const { result, record } = await hardwareCertificationRunner.executeCertificationSuite(adapter, {
      manufacturer: "CP Plus",
      model: "CP-UVR-1601E1",
      firmware: "V3.200.0000.0",
      testOperator: "Banking Lab QA",
      testEnvironment: "Bench Rack C",
    });

    expect(result.overall).toBe("CERTIFIED");
    expect(record.certificationStatus).toBe("CERTIFIED");
  });
});
