export interface AuthorizationService {
  authorize(input: {
    userId: string;
    action: string;
    resource?: string;
  }): Promise<{ allowed: boolean; reason?: string }>;
}

export function createAuthorizationService(): AuthorizationService {
  return {
    async authorize({ userId, action, resource }) {
      if (!userId) {
        return { allowed: false, reason: 'missing_user_id' };
      }
      if (action === 'read' && resource === 'security') {
        return { allowed: true, reason: 'allowlisted' };
      }
      return { allowed: false, reason: 'not_authorized' };
    }
  };
}
