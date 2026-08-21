/**
 * Security Device Hub - Approve Discovered Device API
 * 
 * Approve and enroll a discovered device
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceDiscoveryService } from '@/lib/backend/security-device-discovery-service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { deviceId: string } }
) {
  try {
    const sessionToken = request.cookies.get('sentinel_access')?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'unauthenticated', message: 'Session token required' },
        { status: 401 }
      );
    }

    const service = SecurityDeviceDiscoveryService.getInstance();
    await service.approveDiscoveredDevice(params.deviceId, sessionToken);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to approve device:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';
    
    if (message.includes('unauthenticated')) {
      return NextResponse.json(
        { error: 'unauthenticated', message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'approval_failed', message },
      { status: 502 }
    );
  }
}
