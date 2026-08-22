/**
 * Security Device Hub - Device List API
 * 
 * List all security devices with optional filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceService } from '@/lib/backend/security-device-service';

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
    const filters: any = {};

    if (searchParams.get('branchId')) filters.branchId = searchParams.get('branchId')!;
    if (searchParams.get('deviceType')) filters.deviceType = searchParams.get('deviceType')!;
    if (searchParams.get('status')) filters.status = searchParams.get('status')!;
    if (searchParams.get('hasActiveAlarm') === 'true') filters.hasActiveAlarm = true;
    if (searchParams.get('includeHealth') === 'true') filters.includeHealth = true;

    const service = SecurityDeviceService.getInstance();
    const devices = await service.getAllDevices(filters);

    return NextResponse.json({ data: devices });
  } catch (error) {
    console.error('Failed to load security devices:', error);
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
