import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("privacy routes", () => {
  let app: FastifyInstance;
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    app = await buildApp({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates and lists privacy purposes", async () => {
    const headers = { "x-user-id": "user-global-admin" };
    const create = await app.inject({
      method: "POST",
      url: "/v1/privacy/purposes",
      headers,
      payload: {
        name: "Loss prevention",
        lawfulBasis: "legitimate_interest",
        description: "Monitor checkout areas for theft prevention.",
        riskLevel: "medium",
        dataCategories: ["video", "audio"],
        active: true,
      },
    });

    expect(create.statusCode).toBe(201);
    const purpose = create.json();
    expect(purpose).toMatchObject({
      name: "Loss prevention",
      lawfulBasis: "legitimate_interest",
      active: true,
    });

    const list = await app.inject({
      method: "GET",
      url: "/v1/privacy/purposes",
      headers,
    });

    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0].id).toBe(purpose.id);
  });

  it("assigns a camera privacy purpose and updates controls", async () => {
    const headers = { "x-user-id": "user-global-admin" };
    const create = await app.inject({
      method: "POST",
      url: "/v1/privacy/purposes",
      headers,
      payload: {
        name: "Access control",
        lawfulBasis: "public_safety",
        riskLevel: "high",
        dataCategories: ["video"],
      },
    });
    const purpose = create.json();

    const assign = await app.inject({
      method: "POST",
      url: "/v1/privacy/cameras/cam-001/purposes",
      headers,
      payload: {
        purposeId: purpose.id,
        notes: "Main entrance coverage",
      },
    });

    expect(assign.statusCode).toBe(201);
    expect(assign.json()).toMatchObject({
      cameraId: "cam-001",
      purposeId: purpose.id,
    });

    const controls = await app.inject({
      method: "PUT",
      url: "/v1/privacy/cameras/cam-001/control",
      headers,
      payload: {
        audioRecordingApproved: true,
        encryptionEnabled: true,
        dataProtectionOfficer: "dp0",
      },
    });

    expect(controls.statusCode).toBe(200);
    expect(controls.json()).toMatchObject({
      cameraId: "cam-001",
      audioRecordingApproved: true,
      encryptionEnabled: true,
      dataProtectionOfficer: "dp0",
    });
  });

  it("reports and updates privacy breach status", async () => {
    const headers = { "x-user-id": "user-global-admin" };
    const report = await app.inject({
      method: "POST",
      url: "/v1/privacy/breaches",
      headers,
      payload: {
        breachType: "unauthorized_access",
        severity: "high",
        discoveredAt: new Date().toISOString(),
        description: "Unauthorized physical access to server room.",
      },
    });

    expect(report.statusCode).toBe(201);
    expect(report.json()).toMatchObject({
      breachType: "unauthorized_access",
      severity: "high",
      status: "reported",
    });

    const breachId = report.json().id;
    const update = await app.inject({
      method: "PATCH",
      url: `/v1/privacy/breaches/${breachId}/status`,
      headers,
      payload: { status: "investigating" },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({
      id: breachId,
      status: "investigating",
    });
  });
});
