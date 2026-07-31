"use client";

/**
 * Active Infrastructure Incidents Widget
 * Displays critical infrastructure incidents with root cause analysis
 */

import { useState, useEffect } from "react";
import { AlertTriangle, Clock, CheckCircle2, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";

interface Incident {
  id: string;
  branchId: string;
  branchName: string;
  incidentType: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  rootCauseType: string;
  rootCauseConfidence: number;
  camerasAffected: number;
  infrastructureAffected: number;
  recommendedActions: string[];
  ageMinutes: number;
  createdAt: string;
}

interface ActiveInfrastructureIncidentsWidgetProps {
  branchId?: string;
  refreshKey: number;
}

export function ActiveInfrastructureIncidentsWidget({ 
  branchId,
  refreshKey 
}: ActiveInfrastructureIncidentsWidgetProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  useEffect(() => {
    loadIncidents();
  }, [branchId, refreshKey]);

  const loadIncidents = async () => {
    try {
      setLoading(true);
      setError(undefined);
      
      let url = "/api/v1/infrastructure/rca/incidents/active";
      if (branchId) {
        url += `?branchId=${branchId}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to load incidents");
      
      const { data } = await response.json();
      setIncidents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incidents");
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRootCauseLabel = (type: string) => {
    const labels: Record<string, string> = {
      'switch_port': 'Switch Port',
      'switch_device': 'Switch Device',
      'ups_power': 'UPS Power',
      'firewall': 'Firewall',
      'network_link': 'Network Link',
      'unknown': 'Unknown'
    };
    return labels[type] || type;
  };

  const formatAge = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Infrastructure Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Infrastructure Incidents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-600" />
            Active Infrastructure Incidents
          </CardTitle>
          <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
            {incidents.length} Active
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <CheckCircle2 size={48} className="mb-2" />
            <p>No active infrastructure incidents</p>
            <p className="text-sm">All systems operational</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {incidents.map(incident => (
              <div
                key={incident.id}
                className={`p-4 border-l-4 rounded-lg cursor-pointer transition-all ${
                  incident.severity === 'critical'
                    ? 'border-red-500 bg-red-50 hover:bg-red-100'
                    : incident.severity === 'warning'
                    ? 'border-amber-500 bg-amber-50 hover:bg-amber-100'
                    : 'border-blue-500 bg-blue-50 hover:bg-blue-100'
                }`}
                onClick={() => setSelectedIncident(incident)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(incident.severity)}`}>
                        {incident.severity.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock size={12} />
                        {formatAge(incident.ageMinutes)} ago
                      </span>
                    </div>
                    <h4 className="font-semibold text-gray-900">{incident.title}</h4>
                    <p className="text-sm text-gray-600">{incident.branchName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                  <span>📹 {incident.camerasAffected} cameras</span>
                  <span>🔧 {incident.infrastructureAffected} devices</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">Root Cause:</span>
                    <span className="px-2 py-0.5 bg-white border border-gray-300 rounded text-xs">
                      {getRootCauseLabel(incident.rootCauseType)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {Math.round(incident.rootCauseConfidence * 100)}% confidence
                    </span>
                  </div>
                  <button className="text-blue-600 hover:text-blue-700 text-xs font-medium">
                    View Details →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Incident Detail Modal */}
        {selectedIncident && (
          <IncidentDetailModal 
            incident={selectedIncident}
            onClose={() => setSelectedIncident(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

// Incident Detail Modal
interface IncidentDetailModalProps {
  incident: Incident;
  onClose: () => void;
}

function IncidentDetailModal({ incident, onClose }: IncidentDetailModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{incident.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Incident Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Incident Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Branch:</span>
                <span className="ml-2 font-medium">{incident.branchName}</span>
              </div>
              <div>
                <span className="text-gray-500">Severity:</span>
                <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                  incident.severity === 'critical' ? 'bg-red-100 text-red-800' :
                  incident.severity === 'warning' ? 'bg-amber-100 text-amber-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {incident.severity.toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Cameras Affected:</span>
                <span className="ml-2 font-medium">{incident.camerasAffected}</span>
              </div>
              <div>
                <span className="text-gray-500">Infrastructure Affected:</span>
                <span className="ml-2 font-medium">{incident.infrastructureAffected}</span>
              </div>
              <div>
                <span className="text-gray-500">Age:</span>
                <span className="ml-2 font-medium">{Math.round(incident.ageMinutes)} minutes</span>
              </div>
              <div>
                <span className="text-gray-500">Confidence:</span>
                <span className="ml-2 font-medium">{Math.round(incident.rootCauseConfidence * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Recommended Actions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Recommended Actions</h3>
            <ul className="space-y-2">
              {incident.recommendedActions.map((action, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-600 font-bold">{index + 1}.</span>
                  <span className="text-gray-700">{action}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Investigate
            </button>
            <button className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
              Acknowledge
            </button>
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
              Resolve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
