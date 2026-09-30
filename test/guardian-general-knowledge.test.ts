import { afterEach, describe, expect, it, vi } from "vitest";
import { GuardianAIAssistant, featureGuideResponse } from "../src/services/guardian-ai-assistant.service.js";
import { cctvKnowledgeAnswer } from "../src/services/guardian-cctv-knowledge.js";

afterEach(() => vi.unstubAllGlobals());

describe("KryptonAI general knowledge", () => {
  it("answers CCTV and VMS concepts without a model during fallback", () => {
    expect(cctvKnowledgeAnswer("What is VMS software?")).toContain("Video Management System");
    expect(cctvKnowledgeAnswer("What is ONVIF?")).toContain("Profile S");
    expect(cctvKnowledgeAnswer("Why is my camera offline?")).toContain("power");
    expect(cctvKnowledgeAnswer("How many cameras are offline?")).toBeNull();
  });

  it("does not misroute unrelated general knowledge as a product feature", () => {
    expect(featureGuideResponse("What is the capital of France?")).toBeNull();
    expect(featureGuideResponse("Who invented CCTV?")).toBeNull();
    expect(featureGuideResponse("What is VMS software?")).toBeNull();
    expect(featureGuideResponse("How does CCTV work?")).toBeNull();
    expect(featureGuideResponse("What is VMS software?", false, {
      label: "Camera Health", href: "/operations/cameras", category: "DEVICE HEALTH & MAINTENANCE", keywords: [],
    })).toBeNull();
  });

  it("sends general knowledge questions to the configured model for guests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Paris is the capital of France." } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const assistant = new GuardianAIAssistant({} as never, {
      openAIApiKey: "test-key",
      openAIBaseUrl: "https://example.invalid/v1",
      model: "test-model",
    });
    const result = await assistant.processMessage("general-session", "What is the capital of France?", {
      userId: "guest", tenantId: "public", isGuest: true,
    });
    expect(result.message).toBe("Paris is the capital of France.");
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body.messages[0].content).toContain("GENERAL KNOWLEDGE");
    expect(body.messages[0].content).toContain("CCTV / VMS TRAINING KNOWLEDGE");
  });
});
