import { describe, expect, it } from "vitest";
import {
  GuardianAIAssistant,
  featureGuideResponse,
  isExplicitNavigationRequest,
} from "../src/services/guardian-ai-assistant.service.js";

describe("KryptonAI feature trainer", () => {
  it("explains a feature with its real route and practical steps", () => {
    const answer = featureGuideResponse("line crossing evide set cheyyunnath?");
    expect(answer?.message).toContain("/analytics/rules");
    expect(answer?.message).toContain("two points");
    expect(answer?.actions).toBeUndefined();
  });

  it("answers a location question without treating it as an open command", () => {
    expect(isExplicitNavigationRequest("Where can I open face recognition?")).toBe(false);
    expect(featureGuideResponse("Where can I open face recognition?")?.message).toContain("/analytics/face-recognition");
    expect(isExplicitNavigationRequest("Open face recognition")).toBe(true);
  });

  it("keeps feature guidance available to guests without exposing organization data", () => {
    const answer = featureGuideResponse("How does ANPR work?", true);
    expect(answer?.message).toContain("/analytics/anpr");
    expect(answer?.message).toContain("Sign in");
  });

  it("uses the previous feature for a follow-up doubt", () => {
    const first = featureGuideResponse("How does synced playback work?");
    const answer = featureGuideResponse("How do I use it?", false, {
      label: "Multi-Camera Synced Playback",
      href: "/playback/synced",
      category: "INVESTIGATE & PLAYBACK",
      keywords: [],
    });
    expect(first?.message).toContain("/playback/synced");
    expect(answer?.message).toContain("/playback/synced");
  });

  it("keeps a follow-up about this module on the previous feature", () => {
    const answer = featureGuideResponse("What is this module for?", false, {
      label: "ANPR & Vehicle Telemetry",
      href: "/analytics/anpr",
      category: "INTELLIGENCE & AI",
      keywords: [],
    });
    expect(answer?.message).toContain("/analytics/anpr");
  });

  it("shows a module overview for broad catalog questions", () => {
    expect(featureGuideResponse("What modules are available?")?.message).toContain("/modules");
  });

  it("leaves live operational counts to the operational assistant", () => {
    expect(featureGuideResponse("How many alerts are open today?")).toBeNull();
  });

  it("answers in chat without navigation, then navigates for an explicit open command", async () => {
    const assistant = new GuardianAIAssistant({} as never, { openAIApiKey: "test-key" });
    const context = { userId: "user", tenantId: "tenant" };
    const guide = await assistant.processMessage("trainer-session", "face recognition evideya?", context);
    expect(guide.message).toContain("/analytics/face-recognition");
    expect(guide.actions).toBeUndefined();

    const followUp = await assistant.processMessage("trainer-session", "What is this module for?", context);
    expect(followUp.message).toContain("/analytics/face-recognition");

    const open = await assistant.processMessage("trainer-session", "Open face recognition", context);
    expect(open.actions?.[0]?.result?.href).toBe("/analytics/face-recognition");
  });
});
