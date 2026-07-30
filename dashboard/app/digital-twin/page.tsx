'use client';

/**
 * Digital Twin Main Page
 * Entry point for Digital Twin visualization
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MapPin, Plus, Layers } from 'lucide-react';

interface Site {
  id: string;
  name: string;
  description?: string;
  address?: string;
  organizationId: string;
}

interface Building {
  id: string;
  siteId: string;
  name: string;
  buildingType?: string;
  totalFloors: number;
  branchId?: string;
}

export default function DigitalTwinPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    if (selectedSite) {
      loadBuildings(selectedSite);
    }
  }, [selectedSite]);

  const loadSites = async () => {
    try {
      // Get organization ID from session
      const orgId = localStorage.getItem('organizationId');
      const response = await fetch(`/api/digital-twin/organizations/${orgId}/sites`);
      if (response.ok) {
        const data = await response.json();
        setSites(data);
        if (data.length > 0) {
          setSelectedSite(data[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load sites:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBuildings = async (siteId: string) => {
    try {
      const response = await fetch(`/api/digital-twin/sites/${siteId}/buildings`);
      if (response.ok) {
        const data = await response.json();
        setBuildings(data);
      }
    } catch (error) {
      console.error('Failed to load buildings:', error);
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Digital Twin</h1>
          <p className="text-gray-600 mt-1">Interactive branch visualization with live device status</p>
        </div>
        <button
          onClick={() => router.push('/digital-twin/setup')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          New Site
        </button>
      </div>

      {sites.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Sites Configured</h3>
          <p className="text-gray-600 mb-6">
            Create your first site to start building your Digital Twin
          </p>
          <button
            onClick={() => router.push('/digital-twin/setup')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Setup Digital Twin
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sites Sidebar */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sites</h2>
            <div className="space-y-2">
              {sites.map((site) => (
                <button
                  key={site.id}
                  onClick={() => setSelectedSite(site.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedSite === site.id
                      ? 'bg-blue-50 border-2 border-blue-600'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-gray-600 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{site.name}</div>
                      {site.address && (
                        <div className="text-sm text-gray-600 truncate">{site.address}</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Buildings Grid */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Buildings</h2>
            {buildings.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-4">No buildings in this site</p>
                <button
                  onClick={() => router.push(`/digital-twin/sites/${selectedSite}/buildings/new`)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Building
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {buildings.map((building) => (
                  <button
                    key={building.id}
                    onClick={() => router.push(`/digital-twin/buildings/${building.id}`)}
                    className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow text-left"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 rounded-lg">
                          <Building2 className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{building.name}</h3>
                          {building.buildingType && (
                            <span className="text-sm text-gray-600 capitalize">
                              {building.buildingType}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Layers className="w-4 h-4" />
                      <span>{building.totalFloors} Floor{building.totalFloors !== 1 ? 's' : ''}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
