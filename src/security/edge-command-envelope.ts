import {
  constants,
  createCipheriv,
  createPublicKey,
  publicEncrypt,
  randomBytes,
} from "node:crypto";

export interface SealedEdgeCommandEnvelope {
  algorithm: "RSA-OAEP-256+A256GCM";
  wrappedKey: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

/** Encrypts sensitive command data for one gateway. The control plane queues
 * ciphertext only; only that gateway's encrypted private key can open it. */
export function sealEdgeCommandPayload(
  payload: Record<string, unknown>,
  commandPublicKeyPem: string,
): SealedEdgeCommandEnvelope {
  const publicKey = createPublicKey(commandPublicKeyPem);
  if (publicKey.asymmetricKeyType !== "rsa") throw new Error("invalid_gateway_command_key");
  const contentKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", contentKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const wrappedKey = publicEncrypt({
    key: publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, contentKey);
  return {
    algorithm: "RSA-OAEP-256+A256GCM",
    wrappedKey: wrappedKey.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}
