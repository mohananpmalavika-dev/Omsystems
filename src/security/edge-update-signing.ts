import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export interface EdgeUpdateManifest {
  version: string;
  artifactUrl: string;
  sha256: string;
  notes: string;
}

export function canonicalEdgeUpdateManifest(manifest: EdgeUpdateManifest) {
  return Buffer.from(JSON.stringify({
    artifactUrl: manifest.artifactUrl,
    notes: manifest.notes,
    sha256: manifest.sha256.toLowerCase(),
    version: manifest.version,
  }), "utf8");
}

export function signEdgeUpdateManifest(manifest: EdgeUpdateManifest, privateKeyPem: string) {
  const privateKey = createPrivateKey(normalizePem(privateKeyPem));
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("edge_update_key_must_be_ed25519");
  return sign(null, canonicalEdgeUpdateManifest(manifest), privateKey).toString("base64url");
}

export function edgeUpdatePublicKey(privateKeyPem: string) {
  const privateKey = createPrivateKey(normalizePem(privateKeyPem));
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("edge_update_key_must_be_ed25519");
  return createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString();
}

export function verifyEdgeUpdateManifest(manifest: EdgeUpdateManifest, signature: string, publicKeyPem: string) {
  try {
    const publicKey = createPublicKey(normalizePem(publicKeyPem));
    return publicKey.asymmetricKeyType === "ed25519" && verify(
      null,
      canonicalEdgeUpdateManifest(manifest),
      publicKey,
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
}

function normalizePem(value: string) {
  return value.replaceAll("\\n", "\n").trim();
}
