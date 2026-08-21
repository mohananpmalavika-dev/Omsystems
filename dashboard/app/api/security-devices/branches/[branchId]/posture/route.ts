/**
 * Security Device Hub - Branch Security Posture API
 * 
 * Get comprehensive security posture for a branch
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceService } from '@/lib/backend/security-device-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { branchId: string } }
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
    const posture = await service.getBranchSecurityPosture(params.branchId);

    if (!posture) {
      return NextResponse.json(
        { error: 'posture_not_found', message: 'Branch security posture not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: posture });
  } catch (error) {
    console.error('Failed to load branch security posture:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';
    
    if (message.includes('unauthenticated')) {
      return NextResponse.json(
        { error: 'unauthenticated', message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'posture_unavailable', message },
      { status: 502 }
    );
  }
}
