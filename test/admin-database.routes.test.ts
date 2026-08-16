import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryStore } from "../src/store.js";

describe("Admin Database & Table Manager API", () => {
  it("lists all database tables and their row counts", async () => {
    const store = new MemoryStore();
    const app = await buildApp({ store });

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/database/tables",
      headers: { "x-user-id": "user-global-admin" },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(json.data.tables.length).toBeGreaterThan(5);

    const cameraTable = json.data.tables.find((t: any) => t.id === "cameras");
    expect(cameraTable).toBeDefined();
    expect(cameraTable.columns.length).toBeGreaterThan(5);
  });

  it("retrieves rows from a table with pagination and search", async () => {
    const store = new MemoryStore();
    const app = await buildApp({ store });

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/database/tables/cameras?limit=10&page=1",
      headers: { "x-user-id": "user-global-admin" },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.success).toBe(true);
    expect(json.data.table.id).toBe("cameras");
    expect(Array.isArray(json.data.rows)).toBe(true);
  });

  it("supports creating, editing, and deleting table rows", async () => {
    const store = new MemoryStore();
    const app = await buildApp({ store });

    // 1. Create a new camera
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/database/tables/cameras/rows",
      headers: {
        "x-user-id": "user-global-admin",
        "content-type": "application/json",
      },
      payload: {
        name: "Test Branch Camera 99",
        branchId: "branch-blr-001",
        vendor: "HIKVISION",
        model: "DS-2CD2143G0-I",
        ipAddress: "192.168.1.99",
        status: "online",
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.success).toBe(true);
    const newId = created.data.id;
    expect(newId).toBeDefined();

    // 2. Edit / Update the camera
    const updateRes = await app.inject({
      method: "PUT",
      url: `/v1/admin/database/tables/cameras/rows/${newId}`,
      headers: {
        "x-user-id": "user-global-admin",
        "content-type": "application/json",
      },
      payload: {
        name: "Renamed Test Camera 99",
        status: "degraded",
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updated = updateRes.json();
    expect(updated.success).toBe(true);
    expect(updated.data.name).toBe("Renamed Test Camera 99");
    expect(updated.data.status).toBe("degraded");

    // 3. Delete the camera
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/admin/database/tables/cameras/rows/${newId}`,
      headers: { "x-user-id": "user-global-admin" },
    });

    expect(deleteRes.statusCode).toBe(200);
    const deleted = deleteRes.json();
    expect(deleted.success).toBe(true);
    expect(deleted.data.id).toBe(newId);

    // Verify row is gone
    const verifyRes = await app.inject({
      method: "GET",
      url: `/v1/admin/database/tables/cameras?search=${newId}`,
      headers: { "x-user-id": "user-global-admin" },
    });
    expect(verifyRes.json().data.rows.length).toBe(0);
  });
});
