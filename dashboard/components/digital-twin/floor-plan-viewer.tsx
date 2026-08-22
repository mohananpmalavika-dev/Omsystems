'use client';

/**
 * Interactive Floor Plan Viewer
 * Canvas-based floor plan with drag-and-drop device placement
 */

import { useState, useEffect, useRef } from 'react';
import { Camera, Video, DoorOpen, AlertCircle, Activity, Server } from 'lucide-react';
import DevicePlacementPanel from './device-placement-panel';
import DeviceStatusOverlay from './device-status-overlay';

interface FloorPlanViewerProps {
  floorId: string;
  floorPlan: {
    id: string;
    fileUrl: string;
    widthPixels?: number;
    heightPixels?: number;
  };
  editMode: boolean;
}

interface TwinObject {
  id: string;
  objectType: string;
  name: string;
  positionX: number;
  positionY: number;
  rotation: number;
  showStatus: boolean;
  currentStatus?: {
    status: string;
    statusColor: string;
    isOnline: boolean;
  };
}

export default function FloorPlanViewer({
  floorId,
  floorPlan,
  editMode,
}: FloorPlanViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [objects, setObjects] = useState<TwinObject[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedObject, setSelectedObject] = useState<TwinObject | null>(null);
  const [draggingObject, setDraggingObject] = useState<string | null>(null);
  const [floorImage, setFloorImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    loadFloorState();
    
    // Setup WebSocket for real-time updates
    const ws = setupWebSocket();
    
    return () => {
      ws?.close();
    };
  }, [floorId]);

  useEffect(() => {
    loadFloorPlanImage();
  }, [floorPlan]);

  useEffect(() => {
    if (floorImage && canvasRef.current) {
      renderCanvas();
    }
  }, [floorImage, objects, zones, alerts, scale, offset, selectedObject]);

  const loadFloorPlanImage = () => {
    const img = new Image();
    img.onload = () => {
      setFloorImage(img);
      fitToContainer(img);
    };
    img.src = floorPlan.fileUrl;
  };

  const fitToContainer = (img: HTMLImageElement) => {
    if (!containerRef.current) return;
    
    const container = containerRef.current.getBoundingClientRect();
    const scaleX = (container.width - 100) / img.width;
    const scaleY = (container.height - 100) / img.height;
    const newScale = Math.min(scaleX, scaleY, 1);
    
    setScale(newScale);
    setOffset({
      x: (container.width - img.width * newScale) / 2,
      y: (container.height - img.height * newScale) / 2,
    });
  };

  const loadFloorState = async () => {
    try {
      const response = await fetch(`/api/digital-twin/floors/${floorId}/state`);
      if (response.ok) {
        const data = await response.json();
        setObjects(data.objects);
        setZones(data.zones);
        setAlerts(data.alerts);
      }
    } catch (error) {
      console.error('Failed to load floor state:', error);
    }
  };

  const setupWebSocket = () => {
    // WebSocket connection for real-time updates
    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/digital-twin`);
    
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe:floor', floorId }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleRealtimeEvent(data);
    };

    return ws;
  };

  const handleRealtimeEvent = (event: any) => {
    switch (event.type) {
      case 'object_status_change':
        updateObjectStatus(event.data.objectId, event.data.newStatus, event.data.statusColor);
        break;
      case 'alert_triggered':
        setAlerts(prev => [...prev, event.data]);
        break;
      case 'alert_resolved':
        setAlerts(prev => prev.filter(a => a.id !== event.data.id));
        break;
    }
  };

  const updateObjectStatus = (objectId: string, status: string, statusColor: string) => {
    setObjects(prev =>
      prev.map(obj =>
        obj.id === objectId
          ? { ...obj, currentStatus: { status, statusColor, isOnline: status !== 'offline' } }
          : obj
      )
    );
  };

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !floorImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply transformations
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Draw floor plan image
    ctx.drawImage(floorImage, 0, 0);

    // Draw zones
    zones.forEach(zone => {
      drawZone(ctx, zone);
    });

    // Draw objects
    objects.forEach(obj => {
      drawObject(ctx, obj, obj.id === selectedObject?.id);
    });

    // Draw alerts
    alerts.forEach(alert => {
      drawAlert(ctx, alert);
    });

    // Restore context
    ctx.restore();
  };

  const drawZone = (ctx: CanvasRenderingContext2D, zone: any) => {
    if (!floorImage || !zone.vertices || zone.vertices.length < 3) return;

    ctx.save();
    ctx.beginPath();
    
    zone.vertices.forEach((vertex: any, index: number) => {
      const x = vertex.x * floorImage.width;
      const y = vertex.y * floorImage.height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.closePath();
    
    // Fill
    ctx.fillStyle = zone.fillColor || '#FF0000';
    ctx.globalAlpha = zone.fillOpacity || 0.2;
    ctx.fill();
    
    // Stroke
    ctx.globalAlpha = 1;
    ctx.strokeStyle = zone.strokeColor || '#FF0000';
    ctx.lineWidth = zone.strokeWidth || 2;
    ctx.stroke();
    
    ctx.restore();
  };

  const drawObject = (ctx: CanvasRenderingContext2D, obj: TwinObject, isSelected: boolean) => {
    if (!floorImage) return;

    const x = obj.positionX * floorImage.width;
    const y = obj.positionY * floorImage.height;
    const size = 32;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((obj.rotation * Math.PI) / 180);

    // Draw icon background
    const statusColor = obj.currentStatus?.statusColor || '#6b7280';
    ctx.fillStyle = isSelected ? '#3b82f6' : '#ffffff';
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = isSelected ? 4 : 3;
    
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Draw icon (simplified - in production use actual icons)
    ctx.fillStyle = statusColor;
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const icon = getObjectIcon(obj.objectType);
    ctx.fillText(icon, 0, 0);

    // Draw label
    if (obj.showStatus) {
      ctx.font = '12px Arial';
      ctx.fillStyle = '#000000';
      ctx.fillText(obj.name, 0, size / 2 + 16);
    }

    ctx.restore();
  };

  const drawAlert = (ctx: CanvasRenderingContext2D, alert: any) => {
    if (!floorImage) return;

    const obj = objects.find(o => o.id === alert.twinObjectId);
    if (!obj) return;

    const x = obj.positionX * floorImage.width;
    const y = obj.positionY * floorImage.height;

    // Pulsing alert ring
    const time = Date.now() / 1000;
    const pulseSize = 40 + Math.sin(time * 3) * 10;

    ctx.save();
    ctx.strokeStyle = getSeverityColor(alert.severity);
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7;

    ctx.beginPath();
    ctx.arc(x, y, pulseSize, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.restore();
  };

  const getObjectIcon = (type: string): string => {
    const icons: Record<string, string> = {
      camera: '📹',
      dvr: '📼',
      nvr: '💿',
      door: '🚪',
      panic_button: '🆘',
      fire_sensor: '🔥',
      smoke_sensor: '💨',
      motion_sensor: '👁',
      ups: '🔋',
      network_switch: '🔌',
      atm: '💳',
      vault: '🔐',
    };
    return icons[type] || '📍';
  };

  const getSeverityColor = (severity: string): string => {
    const colors: Record<string, string> = {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#eab308',
      low: '#3b82f6',
    };
    return colors[severity] || '#6b7280';
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!floorImage) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (event.clientX - rect.left - offset.x) / scale;
    const clickY = (event.clientY - rect.top - offset.y) / scale;

    // Check if clicked on an object
    const clickedObject = objects.find(obj => {
      const objX = obj.positionX * floorImage.width;
      const objY = obj.positionY * floorImage.height;
      const distance = Math.sqrt(Math.pow(clickX - objX, 2) + Math.pow(clickY - objY, 2));
      return distance < 20;
    });

    setSelectedObject(clickedObject || null);
  };

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
      // Middle mouse or Shift+Left mouse for panning
      setIsPanning(true);
      setPanStart({ x: event.clientX - offset.x, y: event.clientY - offset.y });
    } else if (editMode && selectedObject) {
      // Start dragging selected object
      setDraggingObject(selectedObject.id);
    }
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setOffset({
        x: event.clientX - panStart.x,
        y: event.clientY - panStart.y,
      });
    } else if (draggingObject && floorImage) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left - offset.x) / scale;
      const mouseY = (event.clientY - rect.top - offset.y) / scale;

      // Update object position (normalized coordinates)
      const normalizedX = mouseX / floorImage.width;
      const normalizedY = mouseY / floorImage.height;

      setObjects(prev =>
        prev.map(obj =>
          obj.id === draggingObject
            ? { ...obj, positionX: normalizedX, positionY: normalizedY }
            : obj
        )
      );
    }
  };

  const handleCanvasMouseUp = async () => {
    if (draggingObject) {
      // Save position to backend
      const obj = objects.find(o => o.id === draggingObject);
      if (obj) {
        try {
          await fetch(`/api/digital-twin/objects/${obj.id}/position`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              positionX: obj.positionX,
              positionY: obj.positionY,
              rotation: obj.rotation,
            }),
          });
        } catch (error) {
          console.error('Failed to update position:', error);
        }
      }
      setDraggingObject(null);
    }
    setIsPanning(false);
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.1, Math.min(5, prev * delta)));
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex">
      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas
          ref={canvasRef}
          width={containerRef.current?.clientWidth || 800}
          height={containerRef.current?.clientHeight || 600}
          onClick={handleCanvasClick}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onWheel={handleWheel}
          className="cursor-crosshair"
        />

        {/* Zoom Controls */}
        <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-2 space-y-2">
          <button
            onClick={() => setScale(prev => Math.min(5, prev * 1.2))}
            className="block w-10 h-10 hover:bg-gray-100 rounded"
          >
            +
          </button>
          <button
            onClick={() => setScale(prev => Math.max(0.1, prev / 1.2))}
            className="block w-10 h-10 hover:bg-gray-100 rounded"
          >
            −
          </button>
          <button
            onClick={() => floorImage && fitToContainer(floorImage)}
            className="block w-10 h-10 hover:bg-gray-100 rounded text-xs"
          >
            Fit
          </button>
        </div>
      </div>

      {/* Side Panels */}
      {editMode && (
        <DevicePlacementPanel
          floorId={floorId}
          floorImage={floorImage}
          onObjectCreated={loadFloorState}
        />
      )}

      {selectedObject && (
        <DeviceStatusOverlay
          object={selectedObject}
          onClose={() => setSelectedObject(null)}
        />
      )}
    </div>
  );
}
