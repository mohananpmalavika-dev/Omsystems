import type { NextRequest } from 'next/server';

export function buildControlPlaneHeaders(
  request: NextRequest,
  initial: Record<string, string> = {},
): Record<string, string> | null {
  const authorization = request.headers.get('authorization');
  const bearerToken = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : undefined;
  const sessionToken = request.cookies.get('sentinel_access')?.value ??
    request.headers.get('x-sentinel-session') ?? bearerToken;
  const headers: Record<string, string> = { ...initial };

  if (sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  } else if (process.env.NODE_ENV === 'production') {
    return null;
  } else {
    const developmentUserId = process.env.DASHBOARD_DEV_USER_ID || 'user-global-admin';
    if (!developmentUserId) return null;
    headers['x-user-id'] = developmentUserId;
  }

  const bridgeKey = process.env.EDGE_BRIDGE_SHARED_KEY;
  if (bridgeKey) headers['x-edge-bridge-key'] = bridgeKey;
  return headers;
}
