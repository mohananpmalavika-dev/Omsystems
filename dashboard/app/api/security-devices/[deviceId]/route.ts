/**
 * Security Device Hub - Device Detail API
 * 
 * Get detailed information about a specific security device
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceService } from '@/lib/backend/security-device-service';

export const dynamic = 'force-dynamic';

export async function GET(
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

      const service = SecurityDeviceService.getInstance();
    const { deviceId } = await params;
    const device = await service.getDeviceById(deviceId);

    if (!device) {
      return NextResponse.json(
        { error: 'device_not_found', message: 'Device not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: device });
  } catch (error) {
    console.error('Failed to load security device:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';
    
    if (message.includes('unauthenticated')) {
      return NextResponse.json(
        { error: 'unauthenticated', message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'device_unavailable', message },
      { status: 502 }
    );
  }
}
