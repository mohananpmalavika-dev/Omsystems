import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/backend';
import { SecurityDeviceDiscoveryService } from '@/lib/backend/security-device-discovery-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get('sentinel_access')?.value;
  if (!sessionToken) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Session token required' },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => ({})) as { threshold?: unknown; deviceIds?: unknown };
    const threshold = body.threshold === undefined ? 90 : Number(body.threshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      return NextResponse.json(
        { error: 'validation_error', message: 'threshold must be between 0 and 100' },
        { status: 400 },
      );
    }
    const requestedIds = Array.isArray(body.deviceIds)
      ? new Set(body.deviceIds.filter((id): id is string => typeof id === 'string' && id.length > 0))
      : null;

    const service = SecurityDeviceDiscoveryService.getInstance();
    const [currentUser, pendingDevices] = await Promise.all([
      getCurrentUser(sessionToken),
      service.listDiscoveredDevices(undefined, 'pending'),
    ]);
    const eligible = pendingDevices.filter((device) =>
      Number(device.confidence) >= threshold && (!requestedIds || requestedIds.has(device.id)),
    );
    const outcomes = await Promise.allSettled(
      eligible.map((device) => service.approveDiscoveredDevice(device.id, currentUser.id)),
    );
    const failures = outcomes.flatMap((outcome, index) => outcome.status === 'rejected'
      ? [{ id: eligible[index]!.id, error: outcome.reason instanceof Error ? outcome.reason.message : 'approval_failed' }]
      : []);

    return NextResponse.json({
      approved: outcomes.length - failures.length,
      eligible: eligible.length,
      failures,
    }, { status: failures.length > 0 ? 207 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    return NextResponse.json(
      { error: 'bulk_approval_failed', message },
      { status: message.includes('authenticated') ? 401 : 502 },
    );
  }
}
