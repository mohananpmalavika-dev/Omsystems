import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export interface EdgeUpdateManifest {
  version: string;
  artifactUrl: string;
  sha256: string;
  notes: string;
}

export function canonicalEdgeUpdateManifest(manifest: EdgeUpdateManifest) {
  assertEdgeUpdateManifest(manifest);
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
    const signatureBytes = decodeEd25519Signature(signature);
    const publicKey = createPublicKey(normalizePem(publicKeyPem));
    return publicKey.asymmetricKeyType === "ed25519" && verify(
      null,
      canonicalEdgeUpdateManifest(manifest),
      publicKey,
      signatureBytes,
    );
  } catch {
    return false;
  }
}

/** Reject malformed manifests before they can be signed or verified. */
export function assertEdgeUpdateManifest(manifest: EdgeUpdateManifest): asserts manifest is EdgeUpdateManifest {
  if (!manifest || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version) ||
      typeof manifest.artifactUrl !== "string" || manifest.artifactUrl.length > 2048 ||
      !/^[a-f0-9]{64}$/i.test(manifest.sha256) ||
      typeof manifest.notes !== "string" || manifest.notes.length > 5_000) {
    throw new Error("edge_update_manifest_invalid");
  }
  const url = new URL(manifest.artifactUrl);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("edge_update_artifact_url_invalid");
  }
}

function decodeEd25519Signature(signature: string) {
  // Node's base64url decoder is deliberately forgiving. OTA signatures must
  // be a canonical, unpadded Ed25519 signature (64 bytes), not merely a value
  // that happens to decode.
  if (!/^[A-Za-z0-9_-]{86}$/.test(signature)) throw new Error("edge_update_signature_encoding_invalid");
  const decoded = Buffer.from(signature, "base64url");
  if (decoded.length !== 64 || decoded.toString("base64url") !== signature) {
    throw new Error("edge_update_signature_encoding_invalid");
  }
  return decoded;
}

function normalizePem(value: string) {
  return value.replaceAll("\\n", "\n").trim();
}
