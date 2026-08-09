export interface IdentityService {
  verifyIdentity(input: {
    userId: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ ok: boolean; reason?: string }>;
}

export function createIdentityService(): IdentityService {
  return {
    async verifyIdentity({ userId, sessionId }) {
      if (!userId) {
        return { ok: false, reason: 'missing_user_id' };
      }
      return { ok: true, reason: sessionId ? 'session_provided' : 'session_missing' };
    }
  };
}
