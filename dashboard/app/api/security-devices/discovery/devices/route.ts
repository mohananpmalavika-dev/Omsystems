/**
 * Security Device Hub - Discovered Devices API
 * 
 * Get discovered devices pending approval
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceDiscoveryService } from '@/lib/backend/security-device-discovery-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('sentinel_access')?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'unauthenticated', message: 'Session token required' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const status = searchParams.get('status');

    const service = SecurityDeviceDiscoveryService.getInstance();
    const devices = await service.listDiscoveredDevices(jobId || undefined, status as any);

    return NextResponse.json({ data: devices });
  } catch (error) {
    console.error('Failed to load discovered devices:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';
    
    if (message.includes('unauthenticated')) {
      return NextResponse.json(
        { error: 'unauthenticated', message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'devices_unavailable', message },
      { status: 502 }
    );
  }
}
