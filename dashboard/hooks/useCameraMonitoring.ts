/**
 * Camera Monitoring WebSocket Hook
 * Real-time camera status, quality metrics, and alert updates
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRealtimeUpdates } from './useRealtimeUpdates';

export interface CameraStatus {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'warning' | 'degraded' | 'unknown';
  lastSeen?: Date;
  currentFps?: number;
  currentBitrate?: number;
  packetLoss?: number;
  latencyMs?: number;
  streamActive?: boolean;
  videoLoss?: boolean;
  imageFrozen?: boolean;
  blackScreen?: boolean;
}

export interface CameraQualityMetrics {
  cameraId: string;
  cameraName: string;
  currentFps: number;
  expectedFps: number;
  currentBitrate: number;
  packetLoss: number;
  latencyMs: number;
  streamActive: boolean;
  qualityScore: number;
  timestamp: Date;
}

export interface CameraQualityAlert {
  id: string;
  alertType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cameraId: string;
  cameraName: string;
  branchId: string;
  branchName: string;
  title: string;
  message: string;
  qualityType: string;
  fpsAtAlert?: number;
  bitrateAtAlert?: number;
  packetLossAtAlert?: number;
  latencyAtAlert?: number;
  detectedAt: Date;
}

export interface CameraStatusUpdate {
  branchId: string;
  branchName: string;
  region?: string;
  cameras: CameraStatus[];
  updatedAt: Date;
}

export interface UseCameraMonitoringOptions {
  branchId?: string;
  autoConnect?: boolean;
  onStatusUpdate?: (update: CameraStatusUpdate) => void;
  onQualityMetrics?: (metrics: CameraQualityMetrics[]) => void;
  onQualityAlert?: (alert: CameraQualityAlert) => void;
}

export function useCameraMonitoring(options: UseCameraMonitoringOptions = {}) {
  const {
    branchId,
    autoConnect = true,
    onStatusUpdate,
    onQualityMetrics,
    onQualityAlert,
  } = options;

  const [cameras, setCameras] = useState<Map<string, CameraStatus>>(new Map());
  const [qualityMetrics, setQualityMetrics] = useState<Map<string, CameraQualityMetrics>>(new Map());
  const [recentAlerts, setRecentAlerts] = useState<CameraQualityAlert[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Use refs for callbacks to avoid re-subscriptions
  const onStatusUpdateRef = useRef(onStatusUpdate);
  const onQualityMetricsRef = useRef(onQualityMetrics);
  const onQualityAlertRef = useRef(onQualityAlert);

  useEffect(() => {
    onStatusUpdateRef.current = onStatusUpdate;
    onQualityMetricsRef.current = onQualityMetrics;
    onQualityAlertRef.current = onQualityAlert;
  }, [onStatusUpdate, onQualityMetrics, onQualityAlert]);

  // Handle camera status updates
  const handleStatusUpdate = useCallback((event: any) => {
    if (event.type !== 'camera_status') return;
    
    const update: CameraStatusUpdate = {
      branchId: event.data.branchId,
      branchName: event.data.branchName,
      region: event.data.region,
      cameras: event.data.cameras.map((cam: any) => ({
        ...cam,
        lastSeen: cam.lastSeen ? new Date(cam.lastSeen) : undefined,
      })),
      updatedAt: new Date(event.data.updatedAt),
    };

    // Update local camera state
    setCameras((prev) => {
      const next = new Map(prev);
      update.cameras.forEach((camera) => {
        next.set(camera.id, camera);
      });
      return next;
    });

    setLastUpdate(new Date());

    // Call callback
    if (onStatusUpdateRef.current) {
      onStatusUpdateRef.current(update);
    }
  }, []);

  // Handle quality metrics updates
  const handleQualityMetrics = useCallback((event: any) => {
    if (event.type !== 'camera_quality_metrics') return;

    const metrics: CameraQualityMetrics[] = event.data.metrics.map((m: any) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));

    // Update local quality metrics state
    setQualityMetrics((prev) => {
      const next = new Map(prev);
      metrics.forEach((metric) => {
        next.set(metric.cameraId, metric);
      });
      return next;
    });

    setLastUpdate(new Date());

    // Call callback
    if (onQualityMetricsRef.current) {
      onQualityMetricsRef.current(metrics);
    }
  }, []);

  // Handle quality alerts
  const handleQualityAlert = useCallback((event: any) => {
    if (event.type !== 'alert' || event.data.alertType !== 'camera_quality') return;

    const alert: CameraQualityAlert = {
      ...event.data,
      detectedAt: new Date(event.data.detectedAt),
    };

    // Add to recent alerts (keep last 50)
    setRecentAlerts((prev) => {
      const next = [alert, ...prev].slice(0, 50);
      return next;
    });

    // Call callback
    if (onQualityAlertRef.current) {
      onQualityAlertRef.current(alert);
    }
  }, []);

  // Subscribe to WebSocket events
  const { isConnected: wsConnected } = useRealtimeUpdates({
    channels: branchId ? [`branch:${branchId}`] : ['global'],
    autoConnect,
    onUpdate: (event) => {
      handleStatusUpdate(event);
      handleQualityMetrics(event);
      handleQualityAlert(event);
    },
  });

  useEffect(() => {
    setIsConnected(wsConnected);
  }, [wsConnected]);

  // Get camera by ID
  const getCamera = useCallback(
    (cameraId: string): CameraStatus | undefined => {
      return cameras.get(cameraId);
    },
    [cameras]
  );

  // Get quality metrics for camera
  const getCameraQualityMetrics = useCallback(
    (cameraId: string): CameraQualityMetrics | undefined => {
      return qualityMetrics.get(cameraId);
    },
    [qualityMetrics]
  );

  // Get cameras by status
  const getCamerasByStatus = useCallback(
    (status: CameraStatus['status']): CameraStatus[] => {
      return Array.from(cameras.values()).filter((cam) => cam.status === status);
    },
    [cameras]
  );

  // Get cameras with quality issues
  const getCamerasWithQualityIssues = useCallback((): CameraStatus[] => {
    return Array.from(cameras.values()).filter(
      (cam) =>
        cam.videoLoss ||
        cam.imageFrozen ||
        cam.blackScreen ||
        (cam.currentFps && cam.currentFps < 10) ||
        (cam.packetLoss && cam.packetLoss > 5)
    );
  }, [cameras]);

  // Get summary statistics
  const getSummary = useCallback(() => {
    const allCameras = Array.from(cameras.values());
    const online = allCameras.filter((c) => c.status === 'online').length;
    const offline = allCameras.filter((c) => c.status === 'offline').length;
    const warning = allCameras.filter((c) => c.status === 'warning').length;
    const degraded = allCameras.filter((c) => c.status === 'degraded').length;
    const qualityIssues = getCamerasWithQualityIssues().length;

    return {
      total: allCameras.length,
      online,
      offline,
      warning,
      degraded,
      qualityIssues,
      uptimePercentage: allCameras.length > 0 ? (online / allCameras.length) * 100 : 0,
    };
  }, [cameras, getCamerasWithQualityIssues]);

  // Clear alerts
  const clearAlerts = useCallback(() => {
    setRecentAlerts([]);
  }, []);

  // Clear all data (useful for cleanup)
  const clearAll = useCallback(() => {
    setCameras(new Map());
    setQualityMetrics(new Map());
    setRecentAlerts([]);
    setLastUpdate(null);
  }, []);

  return {
    // State
    cameras: Array.from(cameras.values()),
    camerasMap: cameras,
    qualityMetrics: Array.from(qualityMetrics.values()),
    qualityMetricsMap: qualityMetrics,
    recentAlerts,
    isConnected,
    lastUpdate,

    // Getters
    getCamera,
    getCameraQualityMetrics,
    getCamerasByStatus,
    getCamerasWithQualityIssues,
    getSummary,

    // Actions
    clearAlerts,
    clearAll,
  };
}

/**
 * Hook for monitoring a specific camera
 */
export function useSingleCameraMonitoring(cameraId: string) {
  const [camera, setCamera] = useState<CameraStatus | null>(null);
  const [qualityMetrics, setQualityMetrics] = useState<CameraQualityMetrics | null>(null);
  const [alerts, setAlerts] = useState<CameraQualityAlert[]>([]);

  const { cameras, qualityMetricsMap, recentAlerts, isConnected } = useCameraMonitoring({
    autoConnect: true,
  });

  useEffect(() => {
    const foundCamera = cameras.find((c) => c.id === cameraId);
    if (foundCamera) {
      setCamera(foundCamera);
    }
  }, [cameras, cameraId]);

  useEffect(() => {
    const metrics = qualityMetricsMap.get(cameraId);
    if (metrics) {
      setQualityMetrics(metrics);
    }
  }, [qualityMetricsMap, cameraId]);

  useEffect(() => {
    const cameraAlerts = recentAlerts.filter((alert) => alert.cameraId === cameraId);
    setAlerts(cameraAlerts);
  }, [recentAlerts, cameraId]);

  return {
    camera,
    qualityMetrics,
    alerts,
    isConnected,
  };
}

/**
 * Hook for monitoring cameras in a specific branch
 */
export function useBranchCameraMonitoring(branchId: string) {
  const [cameras, setCameras] = useState<CameraStatus[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    online: 0,
    offline: 0,
    warning: 0,
    degraded: 0,
    qualityIssues: 0,
    uptimePercentage: 0,
  });

  const monitoring = useCameraMonitoring({
    branchId,
    autoConnect: true,
    onStatusUpdate: (update) => {
      if (update.branchId === branchId) {
        setCameras(update.cameras);
      }
    },
  });

  useEffect(() => {
    // Filter cameras for this branch
    const branchCameras = monitoring.cameras;
    setCameras(branchCameras);

    // Update summary
    const newSummary = monitoring.getSummary();
    setSummary(newSummary);
  }, [monitoring.cameras, monitoring.getSummary, branchId]);

  return {
    ...monitoring,
    cameras,
    summary,
  };
}
