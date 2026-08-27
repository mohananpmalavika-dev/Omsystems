/**
 * Security Device Hub - Device Discovery API
 * 
 * Start device discovery jobs and manage discovered devices
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceDiscoveryService } from '@/lib/backend/security-device-discovery-service';
import { getCurrentUser } from '@/lib/backend';

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
    const status = searchParams.get('status');

    const service = SecurityDeviceDiscoveryService.getInstance();
    const jobs = await service.listDiscoveryJobs(status || undefined);

    return NextResponse.json({ data: jobs });
  } catch (error) {
    console.error('Failed to load discovery jobs:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';
    
    if (message.includes('unauthenticated')) {
      return NextResponse.json(
        { error: 'unauthenticated', message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'discovery_unavailable', message },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('sentinel_access')?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: 'unauthenticated', message: 'Session token required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { branchId, networkRanges, protocols } = body;

    if (!branchId || !networkRanges) {
      return NextResponse.json(
        { error: 'validation_error', message: 'branchId and networkRanges are required' },
        { status: 400 }
      );
    }

    const service = SecurityDeviceDiscoveryService.getInstance();
    const currentUser = await getCurrentUser(sessionToken);
    const job = await service.startDiscovery(
      branchId,
      networkRanges,
      protocols,
      currentUser.id
    );

    return NextResponse.json({ data: job });
  } catch (error) {
    console.error('Failed to start discovery job:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';
    
    if (message.includes('unauthenticated')) {
      return NextResponse.json(
        { error: 'unauthenticated', message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'discovery_failed', message },
      { status: 502 }
    );
  }
}
