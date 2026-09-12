import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  signEdgeUpdateManifest,
  verifyEdgeUpdateManifest,
} from "../src/security/edge-update-signing.js";

describe("edge update manifest signing", () => {
  const manifest = {
    version: "1.2.3",
    artifactUrl: "https://updates.example/edge-agent.bundle",
    sha256: "a".repeat(64),
    notes: "Verified release",
  };

  it("accepts only canonical Ed25519 signatures for an unchanged manifest", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const signature = signEdgeUpdateManifest(manifest, privatePem);

    expect(verifyEdgeUpdateManifest(manifest, signature, publicPem)).toBe(true);
    expect(verifyEdgeUpdateManifest(manifest, `${signature}=`, publicPem)).toBe(false);
    expect(verifyEdgeUpdateManifest({ ...manifest, sha256: "b".repeat(64) }, signature, publicPem)).toBe(false);
  });

  it("refuses invalid artifact locations before signing", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => signEdgeUpdateManifest({ ...manifest, artifactUrl: "http://updates.example/bundle" }, privatePem))
      .toThrow("edge_update_artifact_url_invalid");
  });
});
