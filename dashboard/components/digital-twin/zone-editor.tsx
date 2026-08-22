'use client';

/**
 * Zone Editor Component
 * Interactive polygon drawing tool for creating zones on floor plans
 */

import { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, Plus, Edit3 } from 'lucide-react';

interface ZoneEditorProps {
  floorId: string;
  floorImage: HTMLImageElement | null;
  existingZones: any[];
  onZoneCreated: () => void;
  onClose: () => void;
}

interface Point {
  x: number;
  y: number;
}

const ZONE_TYPES = [
  { value: 'restricted', label: 'Restricted Area', color: '#ef4444' },
  { value: 'public', label: 'Public Area', color: '#22c55e' },
  { value: 'emergency', label: 'Emergency Exit', color: '#f97316' },
  { value: 'queue', label: 'Queue Area', color: '#3b82f6' },
  { value: 'coverage', label: 'Camera Coverage', color: '#8b5cf6' },
];

export default function ZoneEditor({
  floorId,
  floorImage,
  existingZones,
  onZoneCreated,
  onClose,
}: ZoneEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [vertices, setVertices] = useState<Point[]>([]);
  const [zoneName, setZoneName] = useState('');
  const [zoneType, setZoneType] = useState('restricted');
  const [zoneColor, setZoneColor] = useState('#ef4444');
  const [isRestricted, setIsRestricted] = useState(true);
  const [alertOnEntry, setAlertOnEntry] = useState(false);
  const [showExisting, setShowExisting] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (floorImage && canvasRef.current) {
      renderCanvas();
    }
  }, [floorImage, vertices, existingZones, showExisting]);

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !floorImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw floor plan
    ctx.drawImage(floorImage, 0, 0, canvas.width, canvas.height);

    // Draw existing zones
    if (showExisting) {
      existingZones.forEach(zone => {
        drawZone(ctx, zone.vertices, zone.fillColor, zone.strokeColor, 0.2, false);
      });
    }

    // Draw current polygon
    if (vertices.length > 0) {
      drawZone(ctx, vertices, zoneColor, zoneColor, 0.3, true);
      
      // Draw vertices
      vertices.forEach((vertex, index) => {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = zoneColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(vertex.x * canvas.width, vertex.y * canvas.height, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        // Draw vertex number
        ctx.fillStyle = zoneColor;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          (index + 1).toString(),
          vertex.x * canvas.width,
          vertex.y * canvas.height
        );
      });
    }

    // Draw guide lines
    if (isDrawing && vertices.length > 0) {
      const lastVertex = vertices[vertices.length - 1];
      ctx.strokeStyle = zoneColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(lastVertex.x * canvas.width, lastVertex.y * canvas.height);
      // This would connect to mouse position in a real implementation
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const drawZone = (
    ctx: CanvasRenderingContext2D,
    vertices: Point[],
    fillColor: string,
    strokeColor: string,
    opacity: number,
    isCurrent: boolean
  ) => {
    if (vertices.length < 3) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    ctx.save();
    ctx.beginPath();
    
    vertices.forEach((vertex, index) => {
      const x = vertex.x * canvas.width;
      const y = vertex.y * canvas.height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.closePath();
    
    // Fill
    ctx.fillStyle = fillColor;
    ctx.globalAlpha = opacity;
    ctx.fill();
    
    // Stroke
    ctx.globalAlpha = 1;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isCurrent ? 3 : 2;
    ctx.stroke();
    
    ctx.restore();
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / canvas.width;
    const y = (event.clientY - rect.top) / canvas.height;

    // Check if clicking near first vertex to close polygon
    if (vertices.length >= 3) {
      const firstVertex = vertices[0];
      const distance = Math.sqrt(
        Math.pow((x - firstVertex.x) * canvas.width, 2) +
        Math.pow((y - firstVertex.y) * canvas.height, 2)
      );
      
      if (distance < 15) {
        // Close the polygon
        setIsDrawing(false);
        return;
      }
    }

    // Add new vertex
    setVertices(prev => [...prev, { x, y }]);
    if (!isDrawing) {
      setIsDrawing(true);
    }
  };

  const handleCanvasRightClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    
    // Remove last vertex
    if (vertices.length > 0) {
      setVertices(prev => prev.slice(0, -1));
      if (vertices.length === 1) {
        setIsDrawing(false);
      }
    }
  };

  const handleSaveZone = async () => {
    if (vertices.length < 3) {
      alert('A zone must have at least 3 points');
      return;
    }

    if (!zoneName.trim()) {
      alert('Please enter a zone name');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/digital-twin/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorId,
          name: zoneName,
          zoneType,
          vertices,
          fillColor: zoneColor,
          fillOpacity: 0.2,
          strokeColor: zoneColor,
          strokeWidth: 2,
          isRestricted,
          alertOnEntry,
          analyticsEnabled: true,
        }),
      });

      if (response.ok) {
        resetDrawing();
        onZoneCreated();
        alert('Zone created successfully');
      } else {
        alert('Failed to create zone');
      }
    } catch (error) {
      console.error('Failed to save zone:', error);
      alert('Failed to create zone');
    } finally {
      setSaving(false);
    }
  };

  const resetDrawing = () => {
    setVertices([]);
    setIsDrawing(false);
    setZoneName('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex">
      {/* Canvas Area */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="relative bg-white rounded-lg shadow-2xl overflow-hidden">
          <canvas
            ref={canvasRef}
            width={floorImage?.width || 800}
            height={floorImage?.height || 600}
            onClick={handleCanvasClick}
            onContextMenu={handleCanvasRightClick}
            className="cursor-crosshair"
            style={{ maxWidth: '80vw', maxHeight: '80vh' }}
          />
          
          {/* Instructions Overlay */}
          <div className="absolute top-4 left-4 bg-white bg-opacity-90 rounded-lg p-4 shadow-lg max-w-xs">
            <h4 className="font-semibold text-gray-900 mb-2">Drawing Instructions</h4>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• <strong>Left-click</strong> to add points</li>
              <li>• <strong>Right-click</strong> to remove last point</li>
              <li>• Click near the <strong>first point</strong> to close</li>
              <li>• Need at least <strong>3 points</strong> for a zone</li>
            </ul>
            {vertices.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm font-medium text-gray-900">
                  Points: {vertices.length}
                </p>
                {vertices.length >= 3 && (
                  <p className="text-xs text-green-600 mt-1">
                    Click near first point to close
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Controls Overlay */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
            <button
              onClick={resetDrawing}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
            <label className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg cursor-pointer hover:bg-gray-700">
              <input
                type="checkbox"
                checked={showExisting}
                onChange={(e) => setShowExisting(e.target.checked)}
                className="rounded"
              />
              Show Existing Zones
            </label>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <div className="w-96 bg-white overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Zone Editor</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Zone Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zone Name *
            </label>
            <input
              type="text"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="e.g., Vault Area"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Zone Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zone Type
            </label>
            <select
              value={zoneType}
              onChange={(e) => {
                setZoneType(e.target.value);
                const type = ZONE_TYPES.find(t => t.value === e.target.value);
                if (type) {
                  setZoneColor(type.color);
                  setIsRestricted(e.target.value === 'restricted');
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {ZONE_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Zone Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Zone Color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={zoneColor}
                onChange={(e) => setZoneColor(e.target.value)}
                className="w-16 h-10 rounded border border-gray-300"
              />
              <input
                type="text"
                value={zoneColor}
                onChange={(e) => setZoneColor(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {/* Zone Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isRestricted}
                onChange={(e) => setIsRestricted(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Restricted Area</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={alertOnEntry}
                onChange={(e) => setAlertOnEntry(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Alert on Entry</span>
            </label>
          </div>

          {/* Preview */}
          {vertices.length >= 3 && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Zone Preview</h4>
              <div className="space-y-1 text-sm text-gray-600">
                <p>Points: {vertices.length}</p>
                <p>Type: {ZONE_TYPES.find(t => t.value === zoneType)?.label}</p>
                <p>Restricted: {isRestricted ? 'Yes' : 'No'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 space-y-3">
          <button
            onClick={handleSaveZone}
            disabled={vertices.length < 3 || !zoneName.trim() || saving}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Saving...' : 'Save Zone'}
          </button>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
