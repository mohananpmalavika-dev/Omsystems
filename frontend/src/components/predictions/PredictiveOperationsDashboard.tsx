/**
 * Predictive Operations Dashboard
 * 
 * Main dashboard for viewing and managing failure predictions across all branches.
 * Displays summary metrics, priority table, and filtering options.
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  TrendingDown, 
  Clock, 
  Shield,
  Server,
  HardDrive,
  Wifi,
  Camera,
  Battery,
  Database,
  CheckCircle,
  XCircle
} from 'lucide-react';

interface Prediction {
  id: string;
  deviceId: string;
  deviceType: string;
  branchNodeId: string;
  branchName: string;
  predictionType: string;
  probability: number;
  confidence: string;
  riskClassification: string;
  expectedFailureFrom: string;
  expectedFailureTo: string;
  predictedImpact: {
    cameras?: number;
    recordingAtRisk: boolean;
    complianceAtRisk: boolean;
  };
  recommendedAction: string;
  hoursUntilFailure: number;
  evidenceCount: number;
}

interface DashboardSummary {
  predictions24h: number;
  predictions3d: number;
  criticalBranches: number;
  camerasAffected: number;
  complianceRisks: number;
  preventableFailures: number;
}

export const PredictiveOperationsDashboard: React.FC = () => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({
    predictions24h: 0,
    predictions3d: 0,
    criticalBranches: 0,
    camerasAffected: 0,
    complianceRisks: 0,
    preventableFailures: 0
  });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    riskLevel: 'all',
    predictionType: 'all',
    timeWindow: '7'
  });

  useEffect(() => {
    fetchPredictions();
    const interval = setInterval(fetchPredictions, 5 * 60 * 1000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, [filters]);

  const fetchPredictions = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.riskLevel !== 'all') params.append('riskLevel', filters.riskLevel);
      if (filters.predictionType !== 'all') params.append('predictionType', filters.predictionType);
      params.append('timeWindow', filters.timeWindow);

      const response = await fetch(`/api/v1/predictions/branches?${params}`);
      const data = await response.json();

      if (data.success) {
        setPredictions(data.data.predictions);
        calculateSummary(data.data.predictions);
      }
    } catch (error) {
      console.error('Error fetching predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = (preds: Prediction[]) => {
    const predictions24h = preds.filter(p => p.hoursUntilFailure <= 24).length;
    const predictions3d = preds.filter(p => p.hoursUntilFailure <= 72).length;
    const criticalBranches = new Set(
      preds
        .filter(p => ['critical_risk', 'imminent_failure'].includes(p.riskClassification))
        .map(p => p.branchNodeId)
    ).size;
    const camerasAffected = preds.reduce((sum, p) => sum + (p.predictedImpact.cameras || 0), 0);
    const complianceRisks = preds.filter(p => p.predictedImpact.complianceAtRisk).length;
    const preventableFailures = preds.filter(p => p.hoursUntilFailure >= 6).length;

    setSummary({
      predictions24h,
      predictions3d,
      criticalBranches,
      camerasAffected,
      complianceRisks,
      preventableFailures
    });
  };

  const getRiskBadgeClass = (riskClassification: string): string => {
    switch (riskClassification) {
      case 'imminent_failure':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'critical_risk':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'high_risk':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'emerging_risk':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPredictionIcon = (predictionType: string) => {
    switch (predictionType) {
      case 'recorder_failure':
        return <Server className="w-5 h-5" />;
      case 'disk_failure':
        return <HardDrive className="w-5 h-5" />;
      case 'network_failure':
        return <Wifi className="w-5 h-5" />;
      case 'camera_failure':
        return <Camera className="w-5 h-5" />;
      case 'ups_failure':
        return <Battery className="w-5 h-5" />;
      case 'storage_retention_failure':
        return <Database className="w-5 h-5" />;
      default:
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const formatTimeWindow = (hours: number): string => {
    if (hours < 0) return 'Overdue';
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = Math.round(hours / 24);
    return `${days}d`;
  };

  const handleAcknowledge = async (predictionId: string) => {
    try {
      await fetch(`/api/v1/predictions/${predictionId}/acknowledge`, {
        method: 'POST'
      });
      fetchPredictions();
    } catch (error) {
      console.error('Error acknowledging prediction:', error);
    }
  };

  const handleCreateWorkOrder = async (predictionId: string) => {
    try {
      await fetch(`/api/v1/predictions/${predictionId}/create-work-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      fetchPredictions();
    } catch (error) {
      console.error('Error creating work order:', error);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading predictions...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Predictive Operations</h1>
          <p className="text-sm text-gray-600 mt-1">
            AI-powered failure prediction and preventive maintenance
          </p>
        </div>
        <button
          onClick={fetchPredictions}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>


      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <Clock className="w-8 h-8 text-red-600" />
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">{summary.predictions24h}</div>
              <div className="text-xs text-gray-600">Next 24 Hours</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <TrendingDown className="w-8 h-8 text-orange-600" />
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">{summary.predictions3d}</div>
              <div className="text-xs text-gray-600">Next 3 Days</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <AlertTriangle className="w-8 h-8 text-yellow-600" />
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">{summary.criticalBranches}</div>
              <div className="text-xs text-gray-600">Critical Branches</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <Camera className="w-8 h-8 text-blue-600" />
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">{summary.camerasAffected}</div>
              <div className="text-xs text-gray-600">Cameras Affected</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <Shield className="w-8 h-8 text-purple-600" />
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">{summary.complianceRisks}</div>
              <div className="text-xs text-gray-600">Compliance Risks</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">{summary.preventableFailures}</div>
              <div className="text-xs text-gray-600">Preventable</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
            <select
              value={filters.riskLevel}
              onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Risks</option>
              <option value="imminent_failure">Imminent Failure</option>
              <option value="critical_risk">Critical Risk</option>
              <option value="high_risk">High Risk</option>
              <option value="emerging_risk">Emerging Risk</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prediction Type</label>
            <select
              value={filters.predictionType}
              onChange={(e) => setFilters({ ...filters, predictionType: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="recorder_failure">Recorder Failure</option>
              <option value="disk_failure">Disk Failure</option>
              <option value="network_failure">Network Failure</option>
              <option value="camera_failure">Camera Failure</option>
              <option value="ups_failure">UPS Failure</option>
              <option value="storage_retention_failure">Storage Retention</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Window</label>
            <select
              value={filters.timeWindow}
              onChange={(e) => setFilters({ ...filters, timeWindow: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="1">Next 24 Hours</option>
              <option value="3">Next 3 Days</option>
              <option value="7">Next 7 Days</option>
              <option value="30">Next 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Priority Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Prediction Priority</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Branch
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Predicted Failure
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Probability
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Failure Window
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Impact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {predictions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No predictions found. System is monitoring for potential failures.
                  </td>
                </tr>
              ) : (
                predictions.map((prediction) => (
                  <tr key={prediction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{prediction.branchName}</div>
                      <div className="text-xs text-gray-500">{prediction.deviceId}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {getPredictionIcon(prediction.predictionType)}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {prediction.predictionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </div>
                          <div className="text-xs text-gray-500">{prediction.evidenceCount} evidence items</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getRiskBadgeClass(prediction.riskClassification)}`}>
                        {Math.round(prediction.probability * 100)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatTimeWindow(prediction.hoursUntilFailure)}</div>
                      <div className="text-xs text-gray-500">{prediction.confidence} confidence</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {prediction.predictedImpact.cameras && `${prediction.predictedImpact.cameras} cameras`}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {prediction.predictedImpact.recordingAtRisk && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded">
                            Recording Risk
                          </span>
                        )}
                        {prediction.predictedImpact.complianceAtRisk && (
                          <span className="inline-flex px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                            Compliance Risk
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{prediction.recommendedAction}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleAcknowledge(prediction.id)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Acknowledge"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleCreateWorkOrder(prediction.id)}
                        className="text-green-600 hover:text-green-900"
                        title="Create Work Order"
                      >
                        <AlertTriangle className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PredictiveOperationsDashboard;
