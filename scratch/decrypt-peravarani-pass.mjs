import { createDecipheriv } from "node:crypto";

const STREAM_VAULT_KEY = Buffer.from("eqNsNVnJvPqhSqTktB2W2Jmjd22ycKaOj0cWL6Y+92U=", "base64");

function decrypt(reference, encryptedBase64) {
  const buf = Buffer.from(encryptedBase64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", STREAM_VAULT_KEY, iv);
  decipher.setAAD(Buffer.from(reference));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

console.log("Decrypted password:", decrypt("camera-credential:ba459073-a647-4536-8d0b-2b2c954b7deb", "M+9Ev/IzKcEgzBN4vc3mWr6MtkTCcACbe6rt0DZV5Mb0xIzV"));
