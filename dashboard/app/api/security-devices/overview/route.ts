/**
 * Security Device Hub - Overview Stats API
 * 
 * Returns high-level metrics and device type breakdown for dashboard
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

    const service = SecurityDeviceService.getInstance();

    // Get all devices (consider pagination for large deployments)
    const allDevices = await service.getAllDevices({ includeHealth: true });

    // Calculate stats
    const totalDevices = allDevices.length;
    const onlineDevices = allDevices.filter(d => d.health?.status === 'online').length;
    const offlineDevices = allDevices.filter(d => d.health?.status === 'offline').length;
    const degradedDevices = allDevices.filter(d => d.health?.status === 'degraded').length;
    const alarmDevices = allDevices.filter(d => d.health?.hasActiveAlarm).length;

    // Get unique branch count
    const branches = new Set(allDevices.map(d => d.branchId)).size;

    // Device type breakdown
    const deviceTypeMap = new Map<string, { count: number; online: number; offline: number }>();
    
    allDevices.forEach(device => {
      const typeKey = device.deviceType;
      const existing = deviceTypeMap.get(typeKey) || { count: 0, online: 0, offline: 0 };
      
      existing.count++;
      if (device.health?.status === 'online') existing.online++;
      if (device.health?.status === 'offline') existing.offline++;
      
      deviceTypeMap.set(typeKey, existing);
    });

    // Map device types to friendly names with icons
    const deviceTypeLabels: Record<string, string> = {
      'ip-camera': 'Cameras',
      'nvr': 'NVR/DVR',
      'dvr': 'NVR/DVR',
      'access-controller': 'Access Controllers',
      'door': 'Doors',
      'intrusion-panel': 'Alarm Panels',
      'fire-panel': 'Fire Panels',
      'ups': 'UPS',
      'panic-button': 'Panic Buttons',
      'atm': 'ATM',
      'vault-door': 'Vault Doors',
      'motion-sensor': 'Motion Sensors',
      'glass-break': 'Glass Break Sensors',
      'smoke-detector': 'Smoke Detectors',
      'fire-detector': 'Fire Detectors',
      'temperature-sensor': 'Temperature Sensors',
      'humidity-sensor': 'Humidity Sensors',
      'water-sensor': 'Water Sensors',
    };

    const breakdown = Array.from(deviceTypeMap.entries()).map(([type, stats]) => ({
      type: deviceTypeLabels[type] || type,
      deviceType: type,
      count: stats.count,
      online: stats.online,
      offline: stats.offline,
    }));

    return NextResponse.json({
      stats: {
        totalDevices,
        onlineDevices,
        offlineDevices,
        degradedDevices,
        alarmDevices,
        branches,
      },
      breakdown,
    });
  } catch (error) {
    console.error('Failed to load security device overview:', error);
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
