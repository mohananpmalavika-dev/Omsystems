/**
 * Prediction Detail View
 * 
 * Displays comprehensive details for a single prediction including:
 * - Evidence visualization with trend graphs
 * - Impact assessment
 * - Recommended actions
 * - Historical context
 * - Action buttons (acknowledge, create work order, feedback)
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Server,
  HardDrive,
  Wifi,
  Camera,
  Battery,
  Database
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Evidence {
  id: string;
  evidenceType: string;
  evidenceDescription: string;
  metricName: string;
  currentValue: number;
  baselineValue: number | null;
  changePercentage: number | null;
  trendData: Array<{ timestamp: string; value: number }> | null;
  weight: number;
}

interface PredictionDetail {
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
  timeHorizonDays: number;
  predictedImpact: {
    cameras?: number;
    recordingAtRisk: boolean;
    complianceAtRisk: boolean;
    estimatedDowntime?: number;
  };
  recommendedAction: string;
  preventiveActions: string[];
  evidence: Evidence[];
  status: string;
  predictedAt: string;
  modelVersion: string;
}

interface PredictionDetailViewProps {
  predictionId: string;
  onClose: () => void;
}

export const PredictionDetailView: React.FC<PredictionDetailViewProps> = ({
  predictionId,
  onClose
}) => {
  const [prediction, setPrediction] = useState<PredictionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  useEffect(() => {
    fetchPredictionDetail();
  }, [predictionId]);

  const fetchPredictionDetail = async () => {
    try {
      const response = await fetch(`/api/v1/predictions/${predictionId}`);
      const data = await response.json();
      if (data.success) {
        setPrediction(data.data);
      }
    } catch (error) {
      console.error('Error fetching prediction:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    try {
      await fetch(`/api/v1/predictions/${predictionId}/acknowledge`, {
        method: 'POST'
      });
      fetchPredictionDetail();
    } catch (error) {
      console.error('Error acknowledging prediction:', error);
    }
  };

  const handleCreateWorkOrder = async () => {
    try {
      await fetch(`/api/v1/predictions/${predictionId}/create-work-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      alert('Work order created successfully');
      fetchPredictionDetail();
    } catch (error) {
      console.error('Error creating work order:', error);
    }
  };

  const handleSubmitFeedback = async (feedbackType: string, rating: number, comments: string) => {
    try {
      await fetch(`/api/v1/predictions/${predictionId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackType,
          accuracyRating: rating,
          usefulnessRating: rating,
          comments
        })
      });
      setShowFeedbackModal(false);
      alert('Feedback submitted successfully');
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const getRiskColor = (classification: string): string => {
    switch (classification) {
      case 'imminent_failure': return 'text-red-700 bg-red-50 border-red-300';
      case 'critical_risk': return 'text-orange-700 bg-orange-50 border-orange-300';
      case 'high_risk': return 'text-yellow-700 bg-yellow-50 border-yellow-300';
      case 'emerging_risk': return 'text-blue-700 bg-blue-50 border-blue-300';
      default: return 'text-gray-700 bg-gray-50 border-gray-300';
    }
  };

  const getPredictionIcon = (predictionType: string) => {
    const iconClass = "w-12 h-12";
    switch (predictionType) {
      case 'recorder_failure': return <Server className={iconClass} />;
      case 'disk_failure': return <HardDrive className={iconClass} />;
      case 'network_failure': return <Wifi className={iconClass} />;
      case 'camera_failure': return <Camera className={iconClass} />;
      case 'ups_failure': return <Battery className={iconClass} />;
      case 'storage_retention_failure': return <Database className={iconClass} />;
      default: return <AlertTriangle className={iconClass} />;
    }
  };

  const formatDateTime = (dateString: string): string => {
    return new Date(dateString).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeWindow = (from: string, to: string): string => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const now = new Date();
    
    const hoursFrom = (fromDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    const hoursTo = (toDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursFrom < 0) return 'Overdue';
    if (hoursFrom < 24) return `${Math.round(hoursFrom)}-${Math.round(hoursTo)} hours`;
    
    const daysFrom = Math.round(hoursFrom / 24);
    const daysTo = Math.round(hoursTo / 24);
    return `${daysFrom}-${daysTo} days`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading prediction details...</p>
        </div>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <p className="text-red-600">Prediction not found</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-600 text-white rounded">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl my-8 mx-4">
        {/* Header */}
        <div className={`p-6 border-b-4 ${getRiskColor(prediction.riskClassification)} border-l-0 border-r-0 border-t-0`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <div className={`p-3 rounded-lg ${getRiskColor(prediction.riskClassification)}`}>
                {getPredictionIcon(prediction.predictionType)}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {prediction.predictionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </h2>
                <p className="text-gray-600 mt-1">
                  {prediction.branchName} • {prediction.deviceId}
                </p>
                <div className="flex items-center space-x-3 mt-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(prediction.riskClassification)}`}>
                    {Math.round(prediction.probability * 100)}% Probability
                  </span>
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                    {prediction.confidence} Confidence
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XCircle className="w-8 h-8" />
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Time Window */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-2 text-gray-600 mb-2">
                <Clock className="w-5 h-5" />
                <span className="text-sm font-medium">Failure Window</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {formatTimeWindow(prediction.expectedFailureFrom, prediction.expectedFailureTo)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {formatDateTime(prediction.expectedFailureFrom)} - {formatDateTime(prediction.expectedFailureTo)}
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-2 text-gray-600 mb-2">
                <Activity className="w-5 h-5" />
                <span className="text-sm font-medium">Predicted Impact</span>
              </div>
              {prediction.predictedImpact.cameras && (
                <p className="text-lg font-semibold text-gray-900">
                  {prediction.predictedImpact.cameras} Cameras
                </p>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {prediction.predictedImpact.recordingAtRisk && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded">Recording Risk</span>
                )}
                {prediction.predictedImpact.complianceAtRisk && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">Compliance Risk</span>
                )}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-2 text-gray-600 mb-2">
                <FileText className="w-5 h-5" />
                <span className="text-sm font-medium">Evidence Items</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {prediction.evidence?.length || 0} Items
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Model: {prediction.modelVersion}
              </p>
            </div>
          </div>

          {/* Recommended Action */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">Recommended Action</h3>
            <p className="text-blue-800">{prediction.recommendedAction}</p>
          </div>


          {/* Preventive Actions */}
          {prediction.preventiveActions && prediction.preventiveActions.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Preventive Actions</h3>
              <ul className="space-y-2">
                {prediction.preventiveActions.map((action, index) => (
                  <li key={index} className="flex items-start space-x-2">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700">{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Evidence Section */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Supporting Evidence</h3>
            <div className="space-y-4">
              {prediction.evidence?.map((evidence) => (
                <div key={evidence.id} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 mb-1">
                        {evidence.evidenceType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </h4>
                      <p className="text-sm text-gray-600">{evidence.evidenceDescription}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {evidence.changePercentage !== null && evidence.changePercentage > 0 && (
                        <div className="flex items-center text-red-600">
                          <TrendingUp className="w-4 h-4 mr-1" />
                          <span className="text-sm font-medium">+{evidence.changePercentage.toFixed(1)}%</span>
                        </div>
                      )}
                      {evidence.changePercentage !== null && evidence.changePercentage < 0 && (
                        <div className="flex items-center text-green-600">
                          <TrendingDown className="w-4 h-4 mr-1" />
                          <span className="text-sm font-medium">{evidence.changePercentage.toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <span className="text-xs text-gray-500">Current Value</span>
                      <p className="text-lg font-semibold text-gray-900">
                        {evidence.currentValue.toFixed(2)}
                      </p>
                    </div>
                    {evidence.baselineValue !== null && (
                      <div>
                        <span className="text-xs text-gray-500">Baseline Value</span>
                        <p className="text-lg font-semibold text-gray-600">
                          {evidence.baselineValue.toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Trend Chart */}
                  {evidence.trendData && evidence.trendData.length > 0 && (
                    <div className="mt-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={evidence.trendData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="timestamp" 
                            tickFormatter={(value) => new Date(value).toLocaleDateString()}
                            fontSize={12}
                          />
                          <YAxis fontSize={12} />
                          <Tooltip 
                            labelFormatter={(value) => new Date(value).toLocaleString()}
                            formatter={(value: number) => [value.toFixed(2), evidence.metricName]}
                          />
                          <Legend />
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#3B82F6" 
                            strokeWidth={2}
                            name={evidence.metricName}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>Weight: {(evidence.weight * 100).toFixed(0)}%</span>
                    <span>Metric: {evidence.metricName}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <div className="flex items-center space-x-3">
              <button
                onClick={handleAcknowledge}
                disabled={prediction.status === 'acknowledged'}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <CheckCircle className="w-5 h-5" />
                <span>{prediction.status === 'acknowledged' ? 'Acknowledged' : 'Acknowledge'}</span>
              </button>

              <button
                onClick={handleCreateWorkOrder}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <FileText className="w-5 h-5" />
                <span>Create Work Order</span>
              </button>

              <button
                onClick={() => setShowFeedbackModal(true)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center space-x-2"
              >
                <ThumbsUp className="w-5 h-5" />
                <span>Provide Feedback</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <FeedbackModal
          onClose={() => setShowFeedbackModal(false)}
          onSubmit={handleSubmitFeedback}
        />
      )}
    </div>
  );
};

// Feedback Modal Component
const FeedbackModal: React.FC<{
  onClose: () => void;
  onSubmit: (type: string, rating: number, comments: string) => void;
}> = ({ onClose, onSubmit }) => {
  const [feedbackType, setFeedbackType] = useState('helpful');
  const [rating, setRating] = useState(3);
  const [comments, setComments] = useState('');

  const handleSubmit = () => {
    onSubmit(feedbackType, rating, comments);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Prediction Feedback</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Was this prediction helpful?
            </label>
            <select
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="helpful">Helpful</option>
              <option value="not_helpful">Not Helpful</option>
              <option value="incorrect">Incorrect</option>
              <option value="too_early">Too Early</option>
              <option value="too_late">Too Late</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Accuracy Rating: {rating}/5
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={rating}
              onChange={(e) => setRating(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Poor</span>
              <span>Excellent</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comments (optional)
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Additional feedback..."
            />
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Submit Feedback
          </button>
        </div>
      </div>
    </div>
  );
};

export default PredictionDetailView;
