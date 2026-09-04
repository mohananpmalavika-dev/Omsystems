import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceDiscoveryService } from '@/lib/backend/security-device-discovery-service';
import { getCurrentUser } from '@/lib/backend';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const sessionToken = request.cookies.get('sentinel_access')?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: 'unauthenticated', message: 'Session token required' }, { status: 401 });
    }

    const { jobId } = await params;
    const currentUser = await getCurrentUser(sessionToken);
    const body = await request.json().catch(() => ({})) as { action?: string };
    const service = SecurityDeviceDiscoveryService.getInstance();
    if (body.action === 'retry') {
      const job = await service.retryDiscovery(currentUser.tenantId ?? 'default-tenant', jobId, currentUser.id);
      return NextResponse.json({ data: job }, { status: 201 });
    }
    const cancelled = await service.cancelDiscovery(currentUser.tenantId ?? 'default-tenant', jobId);

    if (!cancelled) {
      return NextResponse.json(
        { error: 'job_not_cancellable', message: 'Only pending or running discovery jobs can be cancelled' },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true, status: 'cancelled' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'cancel_failed';
    return NextResponse.json({ error: 'cancel_failed', message }, { status: 502 });
  }
}
