import { describe, expect, it } from "vitest";
import { BfsiSecurityPolicyEngine, type BfsiObservation } from "../bfsi-security-policy-engine.js";

const event = (overrides: Partial<BfsiObservation> = {}): BfsiObservation => ({
  tenantId: "tenant", branchId: "branch", cameraId: "camera", zone: "atm", signal: "face_concealment", confidence: 0.94, observedAt: new Date(), verifiedSource: true, ...overrides,
});
describe("BfsiSecurityPolicyEngine", () => {
  it("fails closed for an unverified model signal", () => expect(new BfsiSecurityPolicyEngine().evaluate(event({ verifiedSource: false }))).toEqual([]));
  it("creates ATM multi-person and concealment actions", () => {
    const engine = new BfsiSecurityPolicyEngine();
    expect(engine.evaluate(event()).map((item) => item.code)).toEqual(["ATM_FACE_CONCEALMENT", "ATM_DETERRENCE"]);
    expect(engine.evaluate(event({ signal: "person_count", count: 2 }))[0]).toMatchObject({ code: "ATM_MULTI_PERSON", severity: "P1" });
  });
});
