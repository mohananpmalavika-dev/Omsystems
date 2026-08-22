/**
 * Vehicle Analytics Dashboard
 * Real-time vehicle monitoring with ANPR, journey, and watchlist features
 */

import React, { useState, useEffect } from 'react';
import { Search, Car, MapPin, AlertTriangle, Activity, Filter } from 'lucide-react';

interface VehicleEvent {
  id: string;
  cameraId: string;
  occurredAt: string;
  vehicleType: string;
  color?: string;
  normalizedPlate?: string;
  plateConfidence?: number;
  direction?: string;
  speed?: number;
  snapshotUri?: string;
}

interface VehicleStats {
  total: number;
  byType: Record<string, number>;
  byColor: Record<string, number>;
  withPlates: number;
  avgConfidence: number;
}

interface WatchlistEntry {
  id: string;
  normalizedPlate: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
}

export const VehicleAnalyticsDashboard: React.FC = () => {
  const [events, setEvents] = useState<VehicleEvent[]>([]);
  const [stats, setStats] = useState<VehicleStats | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [searchPlate, setSearchPlate] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'search' | 'journey' | 'watchlist'>('live');
  
  // Filters
  const [filters, setFilters] = useState({
    vehicleType: '',
    color: '',
    camera: '',
    dateFrom: '',
    dateTo: '',
  });
  
  useEffect(() => {
    loadRecentEvents();
    loadStats();
    loadWatchlist();
    
    // Refresh every 10 seconds
    const interval = setInterval(() => {
      loadRecentEvents();
      loadStats();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);
  
  const loadRecentEvents = async () => {
    try {
      const params = new URLSearchParams({
        limit: '50',
        orderBy: 'occurredAt',
        orderDirection: 'desc',
      });
      
      const response = await fetch(`/api/vehicle-analytics/events?${params}`);
      const data = await response.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  };
  
  const loadStats = async () => {
    try {
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const to = new Date().toISOString();
      
      const response = await fetch(`/api/vehicle-analytics/stats?from=${from}&to=${to}`);
      const data = await response.json();
      setStats(data.stats || null);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };
  
  const loadWatchlist = async () => {
    try {
      const response = await fetch('/api/vehicle-analytics/watchlist');
      const data = await response.json();
      setWatchlist(data.entries || []);
    } catch (error) {
      console.error('Failed to load watchlist:', error);
    }
  };
  
  const searchByPlate = async () => {
    if (!searchPlate.trim()) return;
    
    setLoading(true);
    try {
      const plate = searchPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const response = await fetch(`/api/vehicle-analytics/plates/${plate}`);
      const data = await response.json();
      setEvents(data.events || []);
    } catch (error) {
      console.error('Plate search failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const addToWatchlist = async (plate: string) => {
    try {
      const response = await fetch('/api/vehicle-analytics/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate,
          reason: 'Added from dashboard',
          severity: 'medium',
          category: 'other',
        }),
      });
      
      if (response.ok) {
        await loadWatchlist();
        alert('Added to watchlist successfully');
      }
    } catch (error) {
      console.error('Failed to add to watchlist:', error);
    }
  };
  
  const viewJourney = async (plate: string) => {
    setLoading(true);
    try {
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const to = new Date().toISOString();
      
      const response = await fetch(`/api/vehicle-analytics/journey/${plate}?from=${from}&to=${to}`);
      const data = await response.json();
      
      if (data.journey) {
        // Display journey in modal or separate view
        console.log('Journey:', data.journey);
        alert(`Vehicle journey: ${data.journey.appearances.length} appearances`);
      }
    } catch (error) {
      console.error('Journey query failed:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };
  
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Car className="w-8 h-8" />
            Vehicle Analytics & ANPR
          </h1>
          <p className="text-gray-600 mt-1">Real-time vehicle tracking and license plate recognition</p>
        </div>
        
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Vehicles (24h)</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <Activity className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">With Plates</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.withPlates}</p>
                  <p className="text-xs text-gray-500">
                    {stats.total > 0 ? Math.round((stats.withPlates / stats.total) * 100) : 0}% recognition rate
                  </p>
                </div>
                <Search className="w-8 h-8 text-green-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Watchlist Entries</p>
                  <p className="text-2xl font-bold text-gray-900">{watchlist.length}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg Confidence</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Math.round(stats.avgConfidence * 100)}%
                  </p>
                </div>
                <Activity className="w-8 h-8 text-purple-500" />
              </div>
            </div>
          </div>
        )}
        
        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('live')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'live'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Live Feed
              </button>
              <button
                onClick={() => setActiveTab('search')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'search'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Search
              </button>
              <button
                onClick={() => setActiveTab('journey')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'journey'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Journey
              </button>
              <button
                onClick={() => setActiveTab('watchlist')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'watchlist'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Watchlist
              </button>
            </nav>
          </div>
          
          {/* Search Tab */}
          {activeTab === 'search' && (
            <div className="p-6">
              <div className="flex gap-4 mb-6">
                <input
                  type="text"
                  placeholder="Enter plate number (e.g., KL01AB1234)"
                  value={searchPlate}
                  onChange={(e) => setSearchPlate(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchByPlate()}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={searchByPlate}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  Search
                </button>
              </div>
            </div>
          )}
          
          {/* Watchlist Tab */}
          {activeTab === 'watchlist' && (
            <div className="p-6">
              <div className="space-y-3">
                {watchlist.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No watchlist entries</p>
                ) : (
                  watchlist.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-4 rounded-lg border ${getSeverityColor(entry.severity)}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono font-bold text-lg">{entry.normalizedPlate}</p>
                          <p className="text-sm mt-1">{entry.reason}</p>
                          <div className="flex gap-2 mt-2">
                            <span className="text-xs px-2 py-1 bg-white rounded">
                              {entry.severity}
                            </span>
                            {entry.category && (
                              <span className="text-xs px-2 py-1 bg-white rounded">
                                {entry.category}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => viewJourney(entry.normalizedPlate)}
                          className="px-4 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50"
                        >
                          View Journey
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Events List */}
        {(activeTab === 'live' || activeTab === 'search') && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {activeTab === 'live' ? 'Recent Detections' : 'Search Results'}
              </h2>
            </div>
            
            <div className="divide-y divide-gray-200">
              {events.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No vehicles detected</p>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          {event.normalizedPlate ? (
                            <span className="font-mono font-bold text-lg text-blue-600">
                              {event.normalizedPlate}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">No plate detected</span>
                          )}
                          
                          {event.plateConfidence && (
                            <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                              {Math.round(event.plateConfidence * 100)}% conf
                            </span>
                          )}
                        </div>
                        
                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                          <span className="flex items-center gap-1">
                            <Car className="w-4 h-4" />
                            {event.vehicleType}
                            {event.color && ` • ${event.color}`}
                          </span>
                          
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {event.cameraId}
                          </span>
                          
                          {event.speed && (
                            <span>{Math.round(event.speed)} km/h</span>
                          )}
                          
                          {event.direction && (
                            <span className="capitalize">{event.direction}</span>
                          )}
                        </div>
                        
                        <p className="mt-1 text-xs text-gray-500">
                          {new Date(event.occurredAt).toLocaleString()}
                        </p>
                      </div>
                      
                      <div className="flex gap-2">
                        {event.normalizedPlate && (
                          <>
                            <button
                              onClick={() => viewJourney(event.normalizedPlate!)}
                              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                            >
                              Journey
                            </button>
                            <button
                              onClick={() => addToWatchlist(event.normalizedPlate!)}
                              className="px-3 py-1 text-sm bg-orange-100 text-orange-700 border border-orange-300 rounded hover:bg-orange-200"
                            >
                              Add to Watchlist
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
