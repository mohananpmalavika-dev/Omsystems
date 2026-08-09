export interface SecurityServiceRegistry {
  identity: {
    verifyIdentity(input: { userId: string; sessionId?: string; ipAddress?: string; userAgent?: string }): Promise<{ ok: boolean; reason?: string }>;
  };
  authorization: {
    authorize(input: { userId: string; action: string; resource?: string }): Promise<{ allowed: boolean; reason?: string }>;
  };
  crypto: {
    hash(input: string): string;
    verify(input: string, hash: string): boolean;
  };
  observability: {
    record(event: string, details?: Record<string, unknown>): void;
  };
}

export function createCanonicalSecurityServices(): SecurityServiceRegistry {
  return {
    identity: {
      async verifyIdentity({ userId, sessionId }) {
        if (!userId) {
          return { ok: false, reason: 'missing_user_id' };
        }
        return { ok: true, reason: sessionId ? 'session_provided' : 'session_missing' };
      },
    },
    authorization: {
      async authorize({ userId, action, resource }) {
        if (!userId) {
          return { allowed: false, reason: 'missing_user_id' };
        }
        if (action === 'read' && resource === 'security') {
          return { allowed: true, reason: 'allowlisted' };
        }
        return { allowed: false, reason: 'not_authorized' };
      },
    },
    crypto: {
      hash(input: string) {
        return `hashed:${input}`;
      },
      verify(input: string, hash: string) {
        return this.hash(input) === hash;
      },
    },
    observability: {
      record(event: string, details?: Record<string, unknown>) {
        void event;
        void details;
      },
    },
  };
}
