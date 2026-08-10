/**
 * Recording Compliance API Route
 * GET /api/recording-compliance/[cameraId]
 * 
 * Returns evidence-based recording compliance status for a camera
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { cameraId: string } }
) {
  try {
    const { cameraId } = params;
    
    // Call backend API
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const response = await fetch(
      `${backendUrl}/api/recording-compliance/v2/${cameraId}`,
      {
        headers: {
          'Authorization': request.headers.get('Authorization') || '',
        },
        // Don't cache - compliance data should be fresh
        cache: 'no-store'
      }
    );
    
    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Camera not found or no recorder configured' },
          { status: 404 }
        );
      }
      
      throw new Error(`Backend returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Parse dates
    if (data.checkedAt) data.checkedAt = new Date(data.checkedAt);
    if (data.reachable?.checkedAt) data.reachable.checkedAt = new Date(data.reachable.checkedAt);
    if (data.authentication?.checkedAt) data.authentication.checkedAt = new Date(data.authentication.checkedAt);
    if (data.channel?.checkedAt) data.channel.checkedAt = new Date(data.channel.checkedAt);
    if (data.stream?.checkedAt) data.stream.checkedAt = new Date(data.stream.checkedAt);
    if (data.recording?.checkedAt) data.recording.checkedAt = new Date(data.recording.checkedAt);
    if (data.archive?.checkedAt) data.archive.checkedAt = new Date(data.archive.checkedAt);
    if (data.archive?.lastRecordingTime) data.archive.lastRecordingTime = new Date(data.archive.lastRecordingTime);
    if (data.archive?.oldestRecordingTime) data.archive.oldestRecordingTime = new Date(data.archive.oldestRecordingTime);
    if (data.storage?.checkedAt) data.storage.checkedAt = new Date(data.storage.checkedAt);
    if (data.clock?.checkedAt) data.clock.checkedAt = new Date(data.clock.checkedAt);
    if (data.lastVerifiedHealthyAt) data.lastVerifiedHealthyAt = new Date(data.lastVerifiedHealthyAt);
    
    if (data.errors) {
      data.errors = data.errors.map((error: any) => ({
        ...error,
        timestamp: new Date(error.timestamp)
      }));
    }
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Failed to fetch recording compliance:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch recording compliance status' },
      { status: 500 }
    );
  }
}
