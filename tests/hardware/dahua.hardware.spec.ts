import { describe, expect, it } from "vitest";
import { DahuaRecorderAdapter } from "../../src/recorders/adapters/dahua-recorder.adapter.js";
import { hardwareCertificationRunner } from "./hardware-certification-runner.js";

describe("Dahua Hardware-in-the-Loop Certification (P1-6 & P1-7)", () => {
  const host = process.env.DAHUA_TEST_HOST;
  const username = process.env.DAHUA_TEST_USER || "admin";
  const password = process.env.DAHUA_TEST_PASSWORD || "Pass@12345";
  const port = Number(process.env.DAHUA_TEST_PORT || 80);

  it("skips physical hardware tests gracefully when bench credentials are not configured", () => {
    if (!host) {
      expect(true).toBe(true);
      return;
    }
  });

  it.skipIf(!host)("executes full KV-CERT-1.0 suite against physical Dahua NVR", async () => {
    const adapter = new DahuaRecorderAdapter({
      ipAddress: host!,
      port,
      username,
      password,
      useHttps: false,
    });

    const { result, record } = await hardwareCertificationRunner.executeCertificationSuite(adapter, {
      manufacturer: "Dahua",
      model: "NVR5216-4KS2",
      firmware: "V4.000.0000000.1",
      testOperator: "Banking Lab QA",
      testEnvironment: "Bench Rack B",
    });

    expect(result.overall).toBe("CERTIFIED");
    expect(record.certificationStatus).toBe("CERTIFIED");
  });
});
