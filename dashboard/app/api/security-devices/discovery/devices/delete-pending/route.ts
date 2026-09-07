/**
 * Security Device Hub - Bulk Delete Pending Discovered Devices API
 *
 * Deletes ALL pending-review discovered devices from the staging table so they
 * can be re-discovered on the next network scan.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceDiscoveryService } from '@/lib/backend/security-device-discovery-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('sentinel_access')?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'unauthenticated', message: 'Session token required' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const branchId: string | undefined = body.branchId || undefined;

    const service = SecurityDeviceDiscoveryService.getInstance();
    const deleted = await service.deleteAllPendingDiscoveredDevices(branchId);

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    console.error('Failed to bulk-delete pending discovered devices:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';

    if (message.includes('unauthenticated')) {
      return NextResponse.json(
        { error: 'unauthenticated', message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'bulk_delete_failed', message },
      { status: 502 }
    );
  }
}
