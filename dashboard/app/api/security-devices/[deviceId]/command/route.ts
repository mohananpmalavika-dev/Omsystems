/**
 * Security Device Hub - Device Command Execution API
 * 
 * Execute commands on security devices with RBAC enforcement
 */

import { NextRequest, NextResponse } from 'next/server';
import { SecurityDeviceService } from '@/lib/backend/security-device-service';

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
    const body = await request.json();
    const { command, parameters, reason, mfaToken } = body;

    if (!command) {
      return NextResponse.json(
        { error: 'validation_error', message: 'Command is required' },
        { status: 400 }
      );
    }

    const service = SecurityDeviceService.getInstance();

    // Execute command with RBAC and MFA checks
    const result = await service.executeCommand(
      deviceId,
      command,
      sessionToken, // userId derived from session
      parameters,
      reason,
      mfaToken
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Failed to execute device command:', error);
    const message = error instanceof Error ? error.message : 'unknown_error';
    
    if (message.includes('unauthenticated') || message.includes('unauthorized')) {
      return NextResponse.json(
        { error: 'unauthorized', message },
        { status: 403 }
      );
    }

    if (message.includes('mfa_required')) {
      return NextResponse.json(
        { error: 'mfa_required', message: 'MFA token required for this command' },
        { status: 403 }
      );
    }

    if (message.includes('approval_required')) {
      return NextResponse.json(
        { error: 'approval_required', message: 'Supervisor approval required' },
        { status: 202 } // Accepted, pending approval
      );
    }

    return NextResponse.json(
      { error: 'command_failed', message },
      { status: 502 }
    );
  }
}
