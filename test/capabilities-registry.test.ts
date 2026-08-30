import { describe, expect, it } from "vitest";
import { capabilityRegistry } from "../src/routes/capabilities.routes.js";

describe("platform capability registry", () => {
  it("advertises only implemented analytics exports and free local NLP", () => {
    expect(capabilityRegistry.get("analytics.export.csv")).toMatchObject({
      state: "AVAILABLE",
    });
    expect(capabilityRegistry.get("analytics.export.pdf")).toMatchObject({
      state: "UNAVAILABLE",
    });
    expect(capabilityRegistry.get("analytics.export.excel")).toMatchObject({
      state: "UNAVAILABLE",
    });
    expect(capabilityRegistry.get("assistant.nlp")).toMatchObject({
      state: "PARTIAL",
    });
    expect(capabilityRegistry.get("assistant.nlp")?.reason).toContain("Ollama");
    expect(capabilityRegistry.get("assistant.nlp")?.reason).not.toMatch(/OpenAI|GPT-4|paid API/i);
  });

  it("does not claim that branch-dependent live video is globally available", () => {
    expect(capabilityRegistry.get("branch.media-gateway")).toMatchObject({
      state: "PARTIAL",
    });
    expect(capabilityRegistry.get("digital-twin.video")).toMatchObject({
      state: "PARTIAL",
      dependencies: ["branch.media-gateway"],
    });
  });
});
