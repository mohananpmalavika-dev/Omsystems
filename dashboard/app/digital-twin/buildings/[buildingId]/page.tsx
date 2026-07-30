'use client';

/**
 * Building Digital Twin Page
 * Multi-floor visualization with floor plan management
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Building2, Upload, Edit, Eye, Plus, ArrowLeft } from 'lucide-react';
import FloorPlanViewer from '@/components/digital-twin/floor-plan-viewer';
import FloorPlanUploadModal from '@/components/digital-twin/floor-plan-upload-modal';

interface Floor {
  id: string;
  buildingId: string;
  floorNumber: number;
  name: string;
  description?: string;
  floorHeightMeters?: number;
  areaSquareMeters?: number;
}

interface FloorPlan {
  id: string;
  floorId: string;
  version: number;
  fileUrl: string;
  fileType: string;
  isActive: boolean;
}

export default function BuildingDigitalTwinPage() {
  const params = useParams<{ buildingId?: string }>();
  const router = useRouter();
  const buildingId = typeof params?.buildingId === 'string' ? params.buildingId : '';

  const [building, setBuilding] = useState<any>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(null);
  const [floorPlan, setFloorPlan] = useState<FloorPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'viewer'>('list');

  useEffect(() => {
    loadBuilding();
    loadFloors();
  }, [buildingId]);

  useEffect(() => {
    if (selectedFloor) {
      loadFloorPlan(selectedFloor.id);
    }
  }, [selectedFloor]);

  const loadBuilding = async () => {
    try {
      const response = await fetch(`/api/digital-twin/buildings/${buildingId}`);
      if (response.ok) {
        const data = await response.json();
        setBuilding(data);
      }
    } catch (error) {
      console.error('Failed to load building:', error);
    }
  };

  const loadFloors = async () => {
    try {
      const response = await fetch(`/api/digital-twin/buildings/${buildingId}/floors`);
      if (response.ok) {
        const data = await response.json();
        setFloors(data);
        if (data.length > 0 && !selectedFloor) {
          setSelectedFloor(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load floors:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFloorPlan = async (floorId: string) => {
    try {
      const response = await fetch(`/api/digital-twin/floors/${floorId}/floor-plan`);
      if (response.ok) {
        const data = await response.json();
        setFloorPlan(data);
      } else {
        setFloorPlan(null);
      }
    } catch (error) {
      console.error('Failed to load floor plan:', error);
      setFloorPlan(null);
    }
  };

  const handleFloorPlanUploaded = () => {
    setShowUploadModal(false);
    if (selectedFloor) {
      loadFloorPlan(selectedFloor.id);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/digital-twin')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{building?.name}</h1>
                <p className="text-sm text-gray-600">{floors.length} Floors</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'viewer' : 'list')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              {viewMode === 'list' ? <Eye className="w-5 h-5" /> : <Edit className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Floor Selector Sidebar */}
        <div className="w-64 bg-white border-r overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Floors</h2>
            <div className="space-y-2">
              {floors.map((floor) => (
                <button
                  key={floor.id}
                  onClick={() => setSelectedFloor(floor)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedFloor?.id === floor.id
                      ? 'bg-blue-50 border-2 border-blue-600'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <div className="font-medium text-gray-900">{floor.name}</div>
                  <div className="text-sm text-gray-600">Floor {floor.floorNumber}</div>
                </button>
              ))}
              <button
                onClick={() => router.push(`/digital-twin/buildings/${buildingId}/floors/new`)}
                className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-600 hover:text-blue-600"
              >
                <Plus className="w-5 h-5 mx-auto" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-gray-50">
          {!selectedFloor ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-600">Select a floor to view</p>
            </div>
          ) : !floorPlan ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No Floor Plan Uploaded
                </h3>
                <p className="text-gray-600 mb-4">
                  Upload a floor plan to start positioning devices
                </p>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Upload Floor Plan
                </button>
              </div>
            </div>
          ) : (
            <FloorPlanViewer
              floorId={selectedFloor.id}
              floorPlan={floorPlan}
              editMode={viewMode === 'viewer'}
            />
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && selectedFloor && (
        <FloorPlanUploadModal
          floorId={selectedFloor.id}
          onClose={() => setShowUploadModal(false)}
          onUploaded={handleFloorPlanUploaded}
        />
      )}
    </div>
  );
}
