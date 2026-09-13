import { AxProCredentialResolver } from './adapter';
import { AxProCredentials } from './types';

let resolver: AxProCredentialResolver | undefined;

/**
 * Resolve AX PRO credentials from the configured enterprise secret provider.
 * The integration stores only the opaque reference; this function is the only
 * place where a password is materialized and it is never returned to callers.
 *
 * References use `secret://<path>#<key>` (or `secret://<path>/<key>`).
 */
export function getConfiguredAxProCredentialResolver(): AxProCredentialResolver {
  if (resolver) return resolver;

  resolver = async (credentialSecretId: string): Promise<AxProCredentials> => {
    const providerName = process.env.AXPRO_SECRET_VAULT_PROVIDER;
    if (!providerName) throw new Error('AXPRO_SECRET_VAULT_PROVIDER is not configured');

    const reference = parseSecretReference(credentialSecretId);
    if (!reference) {
      throw new Error('AX PRO credentialSecretId must use secret://<path>#<key> format');
    }

    const secret = await fetchVaultSecret(providerName, reference.path, reference.key);
    if (!secret) throw new Error('AX PRO credential secret was not found');

    let parsed: unknown;
    try {
      parsed = JSON.parse(secret);
    } catch {
      throw new Error('AX PRO credential secret must contain JSON with username and password fields');
    }
    if (!isCredentials(parsed)) throw new Error('AX PRO credential secret is missing username or password');
    return parsed;
  };

  return resolver;
}

async function fetchVaultSecret(provider: string, path: string, key: string): Promise<string | null> {
  const endpoint = process.env.AXPRO_SECRET_VAULT_ENDPOINT || process.env.VAULT_ADDR;
  if (!endpoint) throw new Error('AXPRO_SECRET_VAULT_ENDPOINT is not configured');

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = process.env.AXPRO_SECRET_VAULT_TOKEN || process.env.VAULT_TOKEN;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (process.env.AXPRO_SECRET_VAULT_NAMESPACE) headers['X-Vault-Namespace'] = process.env.AXPRO_SECRET_VAULT_NAMESPACE;

  let url: URL;
  if (provider === 'HASHICORP_VAULT') {
    url = new URL(`/v1/${path.replace(/^\/+/, '')}`, endpoint);
    if (token) {
      delete headers.Authorization;
      headers['X-Vault-Token'] = token;
    }
  } else if (provider === 'HTTP_JSON') {
    url = new URL(endpoint);
    url.searchParams.set('path', path);
    url.searchParams.set('key', key);
  } else {
    throw new Error(`Unsupported AX PRO secret provider: ${provider}`);
  }

  const response = await fetch(url, { method: 'GET', headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`AX PRO secret provider returned HTTP ${response.status}`);
  const body = await response.json() as Record<string, any>;
  const value = provider === 'HASHICORP_VAULT'
    ? body.data?.data?.[key] ?? body.data?.[key] ?? body.data?.value
    : body.value ?? body.secret ?? body.data?.value ?? body.data;
  return typeof value === 'string' ? value : value === undefined ? null : JSON.stringify(value);
}

function parseSecretReference(value: string): { path: string; key: string } | null {
  if (!value.startsWith('secret://')) return null;
  const raw = value.slice('secret://'.length);
  const hashIndex = raw.indexOf('#');
  if (hashIndex > 0 && hashIndex < raw.length - 1) {
    return { path: raw.slice(0, hashIndex), key: raw.slice(hashIndex + 1) };
  }
  const separator = raw.lastIndexOf('/');
  if (separator <= 0 || separator === raw.length - 1) return null;
  return { path: raw.slice(0, separator), key: raw.slice(separator + 1) };
}

function isCredentials(value: unknown): value is AxProCredentials {
  return typeof value === 'object' && value !== null &&
    typeof (value as AxProCredentials).username === 'string' &&
    typeof (value as AxProCredentials).password === 'string' &&
    (value as AxProCredentials).username.length > 0 &&
    (value as AxProCredentials).password.length > 0;
}
