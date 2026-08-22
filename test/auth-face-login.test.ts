import Fastify from "fastify";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { registerAuthRoutes } from "../src/routes/auth.routes.js";
import { hashPassword } from "../src/security/password.js";
import {
  createEmployeeFaceTemplate,
  faceTemplatePreferences,
} from "../src/security/employee-face-verification.service.js";

async function pngData(markup: string): Promise<string> {
  const png = await sharp(Buffer.from(markup)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

const employeeImage = await pngData(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect width="320" height="400" fill="#d8b08c"/><ellipse cx="160" cy="190" rx="105" ry="140" fill="#8b5a3c"/><circle cx="125" cy="170" r="14" fill="#111"/><circle cx="195" cy="170" r="14" fill="#111"/><path d="M115 250 Q160 285 205 250" stroke="#111" stroke-width="10" fill="none"/></svg>',
);

const otherPersonImage = await pngData(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect width="320" height="400" fill="#203040"/><rect x="30" y="30" width="260" height="340" fill="#d0d0d0"/><path d="M30 30 L290 370 M290 30 L30 370" stroke="#b00000" stroke-width="34"/></svg>',
);

async function buildApp(facePreferences: Record<string, unknown>) {
  const passwordHash = await hashPassword("Correct Horse Battery");
  const createUserSession = vi.fn(async () => ({ id: "session-1" }));
  const store = {
    findUserByUsername: async () => ({
      id: "user-face-1",
      tenantId: "tenant-face-1",
      username: "face-employee",
      email: "face@example.com",
      displayName: "Face Employee",
      role: "operator",
      status: "active",
      passwordHash,
      preferences: facePreferences,
      mustChangePassword: false,
    }),
    checkAccountLockout: async () => false,
    recordFailedLogin: vi.fn(async () => undefined),
    createUserSession,
    recordSuccessfulLogin: vi.fn(async () => undefined),
    writeAudit: vi.fn(async () => undefined),
    getUserDetails: async () => ({
      id: "user-face-1",
      tenantId: "tenant-face-1",
      username: "face-employee",
      email: "face@example.com",
      displayName: "Face Employee",
      role: "operator",
      mustChangePassword: false,
    }),
  };
  const app = Fastify({ logger: false });
  await registerAuthRoutes(app, store as never);
  return { app, createUserSession };
}

describe("employee facial login", () => {
  it("issues a session only when the live scan matches enrollment", async () => {
    const template = await createEmployeeFaceTemplate(employeeImage);
    const { app, createUserSession } = await buildApp(faceTemplatePreferences(template));

    const match = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "face-employee", password: "Correct Horse Battery", faceScan: employeeImage },
    });
    expect(match.statusCode).toBe(200);
    expect(createUserSession).toHaveBeenCalledTimes(1);
    await app.close();

    const mismatchApp = await buildApp(faceTemplatePreferences(template));
    const mismatch = await mismatchApp.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "face-employee", password: "Correct Horse Battery", faceScan: otherPersonImage },
    });
    expect(mismatch.statusCode).toBe(401);
    expect(mismatch.json().error).toBe("facial_verification_failed");
    expect(mismatchApp.createUserSession).not.toHaveBeenCalled();
    await mismatchApp.app.close();
  });
});
