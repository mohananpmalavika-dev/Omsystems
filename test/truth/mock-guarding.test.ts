import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockProvider } from "../../backend/src/notifications/providers/mock.provider.js";
import { ProviderRegistry } from "../../backend/src/notifications/provider-registry.js";
import { MockPlateRecognizer } from "../../analytics-engine/src/vehicle/anpr/paddle-ocr-adapter.js";
import { ProductionMockForbiddenError } from "../../packages/contracts/src/execution/index.js";


describe("Mock Provider Production Guarding", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("MockProvider", () => {
    it("instantiates and sends successfully in development / test mode", async () => {
      process.env.NODE_ENV = "test";
      const provider = new MockProvider("email");
      const result = await provider.send({
        id: "del-1",
        destination: "user@example.com",
        title: "Test Alert",
        body: "Test Body",
      });

      expect(result.status).toBe("accepted");
      expect(result.metadata?.mockDelivery).toBe(true);
    });

    it("throws ProductionMockForbiddenError on instantiation when NODE_ENV is production", () => {
      process.env.NODE_ENV = "production";
      expect(() => new MockProvider("email")).toThrow(ProductionMockForbiddenError);
    });
  });

  describe("ProviderRegistry", () => {
    it("registers providers in development mode", () => {
      process.env.NODE_ENV = "development";
      const registry = new ProviderRegistry();
      const mockProvider = new MockProvider("sms");
      registry.register(mockProvider);
      expect(registry.has("sms")).toBe(true);
    });

    it("throws ProductionMockForbiddenError when registering mock provider in production", () => {
      process.env.NODE_ENV = "test";
      const mockProvider = new MockProvider("sms");

      process.env.NODE_ENV = "production";
      const registry = new ProviderRegistry();
      expect(() => registry.register(mockProvider)).toThrow(ProductionMockForbiddenError);
    });
  });

  describe("MockPlateRecognizer", () => {
    it("throws error in production mode", async () => {
      process.env.NODE_ENV = "production";
      const recognizer = new MockPlateRecognizer();
      const dummyMatrix = {
        data: new Uint8Array(100),
        width: 10,
        height: 10,
        channels: 1,
      };

      await expect(recognizer.recognize(dummyMatrix as any)).rejects.toThrow(
        "MockPlateRecognizer is strictly forbidden in production mode",
      );
    });
  });
});
