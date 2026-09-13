import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerSecureAreaAuthorizationRoutes } from "../src/routes/secure-area-authorizations.routes.js";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const BRANCH_ID = "00000000-0000-4000-8000-000000000101";
const USER_ID = "00000000-0000-4000-8000-000000000201";

function buildApp(store: any = {}) {
  const app = Fastify();
  app.decorateRequest("currentUser");
  app.addHook("preHandler", async (request) => {
    request.currentUser = {
      id: USER_ID,
      tenantId: TENANT_ID,
      username: "branch_mgr",
      role: "branch_manager",
    };
  });
  registerSecureAreaAuthorizationRoutes(app, store);
  return app;
}

describe("CCTV Face Recognition for Lockers & Cash Counters", () => {
  it("completes full workflow: staff registration, face enrollment, camera mapping, and real-time CCTV verification", async () => {
    const store = {};
    const app = buildApp(store);

    // 1. Register Teller Aditi and Custodian Rajesh
    const regAditi = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations/persons",
      payload: {
        branchId: BRANCH_ID,
        employeeCode: "EMP-101",
        fullName: "Aditi Sharma",
        designation: "Senior Cashier",
      },
    });
    expect(regAditi.statusCode).toBe(201);
    const aditi = regAditi.json().data;
    expect(aditi.fullName).toBe("Aditi Sharma");

    const regRajesh = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations/persons",
      payload: {
        branchId: BRANCH_ID,
        employeeCode: "EMP-102",
        fullName: "Rajesh Kumar",
        designation: "Head Vault Custodian",
      },
    });
    expect(regRajesh.statusCode).toBe(201);
    const rajesh = regRajesh.json().data;

    // 2. Enroll face photos / embeddings
    const enrollAditi = await app.inject({
      method: "POST",
      url: `/v1/secure-area-authorizations/persons/${aditi.id}/enroll-face`,
      payload: {
        photoBase64: "data:image/jpeg;base64,mockFaceDataAditi",
      },
    });
    expect(enrollAditi.statusCode).toBe(200);
    const aditiFacePersonId = enrollAditi.json().data.facePersonId;
    expect(aditiFacePersonId).toBeDefined();

    const enrollRajesh = await app.inject({
      method: "POST",
      url: `/v1/secure-area-authorizations/persons/${rajesh.id}/enroll-face`,
      payload: {
        photoBase64: "data:image/jpeg;base64,mockFaceDataRajesh",
      },
    });
    expect(enrollRajesh.statusCode).toBe(200);
    const rajeshFacePersonId = enrollRajesh.json().data.facePersonId;
    expect(rajeshFacePersonId).toBeDefined();

    // 3. Verify persons list now contains enrolled facePersonId
    const listPersons = await app.inject({
      method: "GET",
      url: `/v1/secure-area-authorizations/persons?branchId=${BRANCH_ID}`,
    });
    expect(listPersons.statusCode).toBe(200);
    const personsList = listPersons.json().data;
    const aditiInList = personsList.find((p: any) => p.id === aditi.id);
    expect(aditiInList.facePersonId).toBe(aditiFacePersonId);

    // 4. Map CCTV Cameras
    // Camera-01 -> Cash Counter 01
    const mapCam1 = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations/camera-mappings",
      payload: {
        branchId: BRANCH_ID,
        cameraId: "CAM-CASH-01",
        areaType: "cash_counter",
        areaName: "Cash Counter 01",
        notes: "Ceiling camera focused on Teller 1 cash tray and operator chair",
      },
    });
    expect(mapCam1.statusCode).toBe(201);
    expect(mapCam1.json().data.cameraId).toBe("CAM-CASH-01");

    // Camera-02 -> Locker Strongroom 1
    const mapCam2 = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations/camera-mappings",
      payload: {
        branchId: BRANCH_ID,
        cameraId: "CAM-LOCKER-01",
        areaType: "locker",
        areaName: "Locker Strongroom 1",
        notes: "Vault entrance and interior lockbox corridor",
      },
    });
    expect(mapCam2.statusCode).toBe(201);

    // 5. Authorize Aditi for Cash Counter 01
    const authAditi = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations",
      payload: {
        branchId: BRANCH_ID,
        areaType: "cash_counter",
        areaName: "Cash Counter 01",
        authorizedPersonId: aditi.id,
      },
    });
    expect(authAditi.statusCode).toBe(201);

    // 6. Test Case A: Unmapped CCTV camera
    const unmappedTest = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations/cctv-identify",
      payload: {
        cameraId: "CAM-UNKNOWN-99",
        facePersonId: aditiFacePersonId,
      },
    });
    expect(unmappedTest.statusCode).toBe(404);
    expect(unmappedTest.json().error).toBe("camera_not_mapped");

    // 7. Test Case B: Unknown person detected at Cash Counter 01 during operating hours (11:30 AM)
    const unknownTest = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations/cctv-identify",
      payload: {
        cameraId: "CAM-CASH-01",
        detectedAt: "2026-09-15T11:30:00+05:30",
        snapshotReference: "snap-unknown-01.jpg",
      },
    });
    expect(unknownTest.statusCode).toBe(200);
    const unknownRes = unknownTest.json().data;
    expect(unknownRes.verdict).toBe("unauthorized_person");
    expect(unknownRes.alertTriggered).toBe(true);
    expect(unknownRes.severity).toBe("P2");
    expect(unknownRes.person).toBeNull();

    // 8. Test Case C: Assigned Teller Aditi detected at Cash Counter 01 during operating hours (11:35 AM)
    const authorizedTest = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations/cctv-identify",
      payload: {
        cameraId: "CAM-CASH-01",
        facePersonId: aditiFacePersonId,
        similarityScore: 0.96,
        detectedAt: "2026-09-15T11:35:00+05:30",
        snapshotReference: "snap-aditi-01.jpg",
      },
    });
    expect(authorizedTest.statusCode).toBe(200);
    const authRes = authorizedTest.json().data;
    expect(authRes.verdict).toBe("authorized");
    expect(authRes.alertTriggered).toBe(false);
    expect(authRes.severity).toBe("INFO");
    expect(authRes.person.fullName).toBe("Aditi Sharma");
    expect(authRes.person.employeeCode).toBe("EMP-101");

    // 9. Test Case D: Rajesh (registered staff, but assigned to vault, NOT Cash Counter 01) detected at Cash Counter 01
    const unauthStaffTest = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations/cctv-identify",
      payload: {
        cameraId: "CAM-CASH-01",
        facePersonId: rajeshFacePersonId,
        similarityScore: 0.94,
        detectedAt: "2026-09-15T11:40:00+05:30",
        snapshotReference: "snap-rajesh-breach.jpg",
      },
    });
    expect(unauthStaffTest.statusCode).toBe(200);
    const unauthStaffRes = unauthStaffTest.json().data;
    expect(unauthStaffRes.verdict).toBe("unauthorized_staff");
    expect(unauthStaffRes.alertTriggered).toBe(true);
    expect(unauthStaffRes.severity).toBe("P2");
    expect(unauthStaffRes.person.fullName).toBe("Rajesh Kumar");

    // 10. Test Case E: Rajesh (unassigned to Locker Strongroom 1 yet) detected at Locker Strongroom 1
    // Locker breaches trigger P1 (Critical) severity
    const unauthLockerTest = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations/cctv-identify",
      payload: {
        cameraId: "CAM-LOCKER-01",
        facePersonId: rajeshFacePersonId,
        detectedAt: "2026-09-15T11:45:00+05:30",
      },
    });
    expect(unauthLockerTest.statusCode).toBe(200);
    const unauthLockerRes = unauthLockerTest.json().data;
    expect(unauthLockerRes.verdict).toBe("unauthorized_staff");
    expect(unauthLockerRes.alertTriggered).toBe(true);
    expect(unauthLockerRes.severity).toBe("P1"); // Critical P1 for Locker

    // 11. Test Case F: After-hours breach at 23:45 (Night time)
    const afterHoursTest = await app.inject({
      method: "POST",
      url: "/v1/secure-area-authorizations/cctv-identify",
      payload: {
        cameraId: "CAM-LOCKER-01",
        facePersonId: aditiFacePersonId,
        detectedAt: "2026-09-15T23:45:00+05:30",
      },
    });
    expect(afterHoursTest.statusCode).toBe(200);
    const afterHoursRes = afterHoursTest.json().data;
    expect(afterHoursRes.verdict).toBe("after_hours_breach");
    expect(afterHoursRes.alertTriggered).toBe(true);
    expect(afterHoursRes.severity).toBe("P1");

    // 12. Test Case G: Query CCTV Events audit log and verify alerts filter
    const eventsFeed = await app.inject({
      method: "GET",
      url: `/v1/secure-area-authorizations/cctv-events?branchId=${BRANCH_ID}&alertsOnly=true`,
    });
    expect(eventsFeed.statusCode).toBe(200);
    const events = eventsFeed.json().data;
    expect(events.length).toBeGreaterThanOrEqual(4);
    // None should be 'authorized'
    expect(events.every((e: any) => e.verdict !== "authorized")).toBe(true);
  });
});
