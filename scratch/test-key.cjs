const crypto = require("crypto");

function normalizePem(value) {
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed.replaceAll("\\n", "\n").trim();
}

const raw = `"-----BEGIN PRIVATE KEY-----\\nMC4CAQAwBQYDK2VwBCIEIP74jLjXCr8DBSSP9ZzMwqyr3YEJs4G+Z8yIX2wfJ+x3\\n-----END PRIVATE KEY-----\\n"`;

try {
  const priv = crypto.createPrivateKey(normalizePem(raw));
  console.log("SUCCESS, type:", priv.asymmetricKeyType);
  const pub = crypto.createPublicKey(priv).export({ type: "spki", format: "pem" }).toString();
  console.log("PUBLIC KEY:\n" + pub);
} catch (err) {
  console.error("FAILED:", err);
}
