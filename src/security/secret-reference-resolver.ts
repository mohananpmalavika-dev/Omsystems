/**
 * Resolves opaque secret references through the configured enterprise secret
 * store.  Callers deliberately receive only the secret value; they must never
 * treat a reference itself as a credential.
 */
export interface SecretReferenceResolver {
  resolve(reference: string): Promise<string>;
}

export class ConfiguredSecretReferenceResolver implements SecretReferenceResolver {
  async resolve(reference: string): Promise<string> {
    const parsed = parseSecretReference(reference);
    if (!parsed) throw new Error("Secret reference must use secret://<path>#<key> format");

    const provider = process.env.IDENTITY_SECRET_VAULT_PROVIDER ?? process.env.SECRET_VAULT_PROVIDER;
    const endpoint = process.env.IDENTITY_SECRET_VAULT_ENDPOINT ?? process.env.SECRET_VAULT_ENDPOINT ?? process.env.VAULT_ADDR;
    if (!provider) throw new Error("IDENTITY_SECRET_VAULT_PROVIDER is not configured");
    if (!endpoint) throw new Error("IDENTITY_SECRET_VAULT_ENDPOINT is not configured");

    const token = process.env.IDENTITY_SECRET_VAULT_TOKEN ?? process.env.SECRET_VAULT_TOKEN ?? process.env.VAULT_TOKEN;
    const headers: Record<string, string> = { Accept: "application/json" };
    let url: URL;
    if (provider === "HASHICORP_VAULT") {
      url = new URL(`/v1/${parsed.path.replace(/^\/+/, "")}`, endpoint);
      if (token) headers["X-Vault-Token"] = token;
      const namespace = process.env.IDENTITY_SECRET_VAULT_NAMESPACE ?? process.env.VAULT_NAMESPACE;
      if (namespace) headers["X-Vault-Namespace"] = namespace;
    } else if (provider === "HTTP_JSON") {
      url = new URL(endpoint);
      url.searchParams.set("path", parsed.path);
      url.searchParams.set("key", parsed.key);
      if (token) headers.Authorization = `Bearer ${token}`;
    } else {
      throw new Error(`Unsupported identity secret provider: ${provider}`);
    }

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000), redirect: "error" });
    if (response.status === 404) throw new Error("Referenced secret was not found");
    if (!response.ok) throw new Error(`Secret provider returned HTTP ${response.status}`);
    const body = await response.json() as Record<string, any>;
    const value = provider === "HASHICORP_VAULT"
      ? body.data?.data?.[parsed.key] ?? body.data?.[parsed.key] ?? body.data?.value
      : body.value ?? body.secret ?? body.data?.value ?? body.data?.[parsed.key];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error("Referenced secret is missing or is not a string");
    }
    return value;
  }
}

function parseSecretReference(reference: string): { path: string; key: string } | undefined {
  if (!reference.startsWith("secret://")) return undefined;
  const raw = reference.slice("secret://".length);
  const hash = raw.lastIndexOf("#");
  if (hash <= 0 || hash === raw.length - 1) return undefined;
  return { path: raw.slice(0, hash), key: raw.slice(hash + 1) };
}
