/**
 * Security Device Hub - Delete Discovered Device API
 *
 * Permanently deletes a pending discovered device from the staging table so it
 * can be re-discovered on the next network scan.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceDiscoveryService } from '@/lib/backend/security-device-discovery-service';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  try {
    const sessionToken = request.cookies.get('sentinel_access')?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'unauthenticated', message: 'Session token required' },
        { status: 401 }
      );
    }

    const { deviceId } = await params;

    const service = SecurityDeviceDiscoveryService.getInstance();
    await service.deleteDiscoveredDevice(deviceId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete discovered device:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';

    if (message.includes('unauthenticated')) {
      return NextResponse.json(
        { error: 'unauthenticated', message },
        { status: 401 }
      );
    }

    if (message.includes('not_found') || message.includes('not_pending')) {
      return NextResponse.json(
        { error: 'device_not_found', message },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'delete_failed', message },
      { status: 502 }
    );
  }
}
