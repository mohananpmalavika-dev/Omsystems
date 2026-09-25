export function isDashboardBasicAuth(authorization?: string | null) {
  return authorization?.toLowerCase().startsWith("basic ") === true;
}

export function getLiveSessionToken(input: {
  cookieToken?: string;
  sentinelSession?: string | null;
  authorization?: string | null;
}) {
  const bearerToken = input.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearerToken || input.sentinelSession || input.cookieToken;
}
