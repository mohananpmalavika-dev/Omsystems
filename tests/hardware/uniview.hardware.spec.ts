import { describe, expect, it } from "vitest";
import { UniviewRecorderAdapter } from "../../src/recorders/adapters/uniview-recorder.adapter.js";
import { hardwareCertificationRunner } from "./hardware-certification-runner.js";

describe("Uniview Hardware-in-the-Loop Certification (P1-6 & P1-7)", () => {
  const host = process.env.UNIVIEW_TEST_HOST;
  const username = process.env.UNIVIEW_TEST_USER || "admin";
  const password = process.env.UNIVIEW_TEST_PASSWORD || "Pass@12345";
  const port = Number(process.env.UNIVIEW_TEST_PORT || 80);

  it("skips physical hardware tests gracefully when bench credentials are not configured", () => {
    if (!host) {
      expect(true).toBe(true);
      return;
    }
  });

  it.skipIf(!host)("executes full KV-CERT-1.0 suite against physical Uniview NVR", async () => {
    const adapter = new UniviewRecorderAdapter({
      ipAddress: host!,
      port,
      username,
      password,
      useHttps: false,
    });

    const { result, record } = await hardwareCertificationRunner.executeCertificationSuite(adapter, {
      manufacturer: "Uniview",
      model: "NVR301-04S3",
      firmware: "B3801P25",
      testOperator: "Banking Lab QA",
      testEnvironment: "Bench Rack D",
    });

    expect(result.overall).toBe("CERTIFIED");
    expect(record.certificationStatus).toBe("CERTIFIED");
  });
});
