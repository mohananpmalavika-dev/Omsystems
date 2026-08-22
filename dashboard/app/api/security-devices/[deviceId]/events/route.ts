/**
 * Security Device Hub - Device Events API
 * 
 * Get event log for a specific device
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

    const { deviceId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const filters: any = {
      deviceId,
    };

    if (searchParams.get('eventType')) filters.eventType = searchParams.get('eventType')!;
    if (searchParams.get('severity')) filters.severity = searchParams.get('severity')!;
    if (searchParams.get('from')) filters.from = new Date(searchParams.get('from')!);
    if (searchParams.get('to')) filters.to = new Date(searchParams.get('to')!);

    const limit = parseInt(searchParams.get('limit') || '100');

    const service = SecurityDeviceService.getInstance();
    const events = await service.getDeviceEvents(filters, limit);

    return NextResponse.json({ data: events });
  } catch (error) {
    console.error('Failed to load device events:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';
    
    if (message.includes('unauthenticated')) {
      return NextResponse.json(
        { error: 'unauthenticated', message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'events_unavailable', message },
      { status: 502 }
    );
  }
}
