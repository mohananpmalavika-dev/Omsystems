import type { FastifyRequest } from 'fastify';

export function operationalUser(request: FastifyRequest) {
  const user = request.currentUser;
  if (!user?.id || !user.tenantId || (user.status !== undefined && user.status !== 'active')) {
    throw Object.assign(new Error('authenticated_user_required'), { statusCode: 401 });
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && ['viewer', 'auditor'].includes(user.role || 'viewer')) {
    throw Object.assign(new Error('read_only_user'), { statusCode: 403 });
  }
  return { tenantId: user.tenantId, userId: user.id, role: user.role };
}
