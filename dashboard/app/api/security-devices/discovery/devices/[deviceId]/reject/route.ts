/**
 * Security Device Hub - Reject Discovered Device API
 * 
 * Reject a discovered device
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceDiscoveryService } from '@/lib/backend/security-device-discovery-service';

export const dynamic = 'force-dynamic';

export async function POST(
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
    await service.rejectDiscoveredDevice(deviceId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to reject device:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';
    
    if (message.includes('unauthenticated')) {
      return NextResponse.json(
        { error: 'unauthenticated', message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'rejection_failed', message },
      { status: 502 }
    );
  }
}
