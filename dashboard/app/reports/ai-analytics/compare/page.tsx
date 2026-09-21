'use client';

/**
 * AI Capability Comparison Page
 * 
 * Interactive comparison tool for analyzing AI capabilities side-by-side.
 * Features:
 * - Select 2-4 capabilities to compare
 * - Performance metrics comparison (accuracy, FP rate, speed, volume)
 * - Visual comparison with radar charts and bar charts
 * - Intelligent insights and recommendations
 * - Rankings by different metrics
 * - Export comparison report
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  Zap,
  Target,
  AlertCircle,
  CheckCircle,
  RefreshCcw,
  Download,
  Plus,
  X,
  Award,
  Info,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

interface CapabilityMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  false_positive_rate: number;
  detections: number;
  avg_inference_time_ms: number;
  active_cameras: number;
  incidents_prevented: number;
  cost_avoided: number;
  status: 'excellent' | 'good' | 'fair' | 'needs_attention';
}

interface ComparisonCapability {
  capability_type: string;
  display_name: string;
  domain: string;
  domain_name: string;
  stage: string;
  metrics: CapabilityMetrics;
}

interface ComparisonInsight {
  type: 'best_performer' | 'needs_improvement' | 'recommendation' | 'observation';
  capability_type: string;
  metric: string;
  value: number;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface ComparisonResult {
  capabilities: ComparisonCapability[];
  comparison_matrix: {
    metrics: string[];
    values: number[][];
  };
  insights: ComparisonInsight[];
  rankings: {
    by_accuracy: Array<{ capability_type: string; value: number; rank: number; display_name: string }>;
    by_speed: Array<{ capability_type: string; value: number; rank: number; display_name: string }>;
    by_volume: Array<{ capability_type: string; value: number; rank: number; display_name: string }>;
    by_cost_avoided: Array<{ capability_type: string; value: number; rank: number; display_name: string }>;
  };
  summary: {
    best_overall: string;
    fastest: string;
    most_accurate: string;
    highest_impact: string;
  };
}

interface CapabilityOption {
  capability_type: string;
  display_name: string;
  domain: string;
  stage: string;
  accuracy: number;
  detections: number;
  active: boolean;
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

const STATUS_CONFIG = {
  excellent: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Excellent' },
  good: { color: 'bg-blue-100 text-blue-800', icon: ThumbsUp, label: 'Good' },
  fair: { color: 'bg-yellow-100 text-yellow-800', icon: Info, label: 'Fair' },
  needs_attention: { color: 'bg-red-100 text-red-800', icon: AlertCircle, label: 'Needs Attention' },
};

const INSIGHT_ICONS = {
  best_performer: Award,
  needs_improvement: ThumbsDown,
  recommendation: Info,
  observation: Target,
};

export default function AiComparisonPage() {
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Capability selection
  const [availableCapabilities, setAvailableCapabilities] = useState<CapabilityOption[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);

  // Date range
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Load available capabilities
  useEffect(() => {
    loadAvailableCapabilities();
  }, []);

  const loadAvailableCapabilities = async () => {
    try {
      const response = await fetch('/api/control/v1/reports/ai-analytics/capabilities');
      if (!response.ok) throw new Error('Failed to load capabilities');

      const data = await response.json();
      
      // Flatten capabilities from all domains
      const allCapabilities: CapabilityOption[] = [];
      data.domains.forEach((domain: any) => {
        domain.capabilities.forEach((cap: any) => {
          allCapabilities.push({
            ...cap,
            domain: domain.domain,
          });
        });
      });

      setAvailableCapabilities(allCapabilities);

      // Pre-select first 2 capabilities if available
      if (allCapabilities.length >= 2) {
        setSelectedCapabilities([
          allCapabilities[0].capability_type,
          allCapabilities[1].capability_type,
        ]);
      }
    } catch (err) {
      console.error('Failed to load capabilities:', err);
    }
  };

  const loadComparison = async () => {
    if (selectedCapabilities.length < 2) {
      setError('Please select at least 2 capabilities to compare');
      return;
    }

    if (selectedCapabilities.length > 4) {
      setError('Maximum 4 capabilities can be compared at once');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/control/v1/reports/ai-analytics/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capability_types: selectedCapabilities,
          start_date: startDate,
          end_date: endDate,
        }),
      });

      if (!response.ok) throw new Error('Failed to load comparison');

      const data = await response.json();
      setComparison(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const addCapability = (capabilityType: string) => {
    if (selectedCapabilities.length >= 4) {
      setError('Maximum 4 capabilities can be compared');
      return;
    }
    if (!selectedCapabilities.includes(capabilityType)) {
      setSelectedCapabilities([...selectedCapabilities, capabilityType]);
    }
  };

  const removeCapability = (capabilityType: string) => {
    setSelectedCapabilities(selectedCapabilities.filter((c) => c !== capabilityType));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getRadarChartData = () => {
    if (!comparison) return [];

    const data = comparison.capabilities.map((cap) => ({
      capability: cap.display_name.substring(0, 15) + (cap.display_name.length > 15 ? '...' : ''),
      Accuracy: cap.metrics.accuracy,
      'Low FP Rate': 100 - cap.metrics.false_positive_rate,
      Speed: Math.max(0, 100 - cap.metrics.avg_inference_time_ms / 2),
      Volume: Math.min(100, (cap.metrics.detections / 10000) * 10),
      Impact: Math.min(100, (cap.metrics.cost_avoided / 1000) * 5),
    }));

    // Transpose for radar chart
    const metrics = ['Accuracy', 'Low FP Rate', 'Speed', 'Volume', 'Impact'];
    return metrics.map((metric) => {
      const point: any = { metric };
      data.forEach((cap, i) => {
        point[`cap${i}`] = cap[metric as keyof typeof cap];
      });
      return point;
    });
  };

  const getBarChartData = () => {
    if (!comparison) return [];

    return comparison.capabilities.map((cap) => ({
      name: cap.display_name.substring(0, 20),
      Accuracy: cap.metrics.accuracy,
      'FP Rate': cap.metrics.false_positive_rate,
      'Inference (ms)': cap.metrics.avg_inference_time_ms,
    }));
  };

  if (loading && !comparison) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCcw className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Capability Comparison</h1>
          <p className="text-gray-600 mt-1">Compare up to 4 capabilities side-by-side</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadComparison} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Capability Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Capabilities to Compare</CardTitle>
          <CardDescription>Choose 2-4 AI capabilities for side-by-side comparison</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Selected Capabilities */}
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedCapabilities.map((capType) => {
                const cap = availableCapabilities.find((c) => c.capability_type === capType);
                return (
                  <Badge key={capType} variant="secondary" className="px-3 py-2">
                    {cap?.display_name || capType}
                    <button
                      onClick={() => removeCapability(capType)}
                      className="ml-2 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
              {selectedCapabilities.length < 4 && (
                <Select onValueChange={addCapability}>
                  <SelectTrigger className="w-[250px]">
                    <Plus className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Add capability..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCapabilities
                      .filter((cap) => !selectedCapabilities.includes(cap.capability_type))
                      .map((cap) => (
                        <SelectItem key={cap.capability_type} value={cap.capability_type}>
                          {cap.display_name} ({cap.domain})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Date Range and Compare Button */}
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-md"
                />
              </div>
              <Button
                onClick={loadComparison}
                disabled={loading || selectedCapabilities.length < 2}
                className="px-8"
              >
                <Target className="h-4 w-4 mr-2" />
                Compare
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {comparison && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Best Overall</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-yellow-600" />
                  <span className="font-semibold">{comparison.summary.best_overall}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Most Accurate</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-green-600" />
                  <span className="font-semibold">{comparison.summary.most_accurate}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Fastest</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold">{comparison.summary.fastest}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Highest Impact</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                  <span className="font-semibold">{comparison.summary.highest_impact}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Comparison Table */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      {comparison.capabilities.map((cap, i) => (
                        <TableHead key={cap.capability_type} className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-semibold">{cap.display_name}</span>
                            <Badge variant="outline" className="text-xs">
                              {cap.domain_name}
                            </Badge>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Accuracy</TableCell>
                      {comparison.capabilities.map((cap) => (
                        <TableCell key={cap.capability_type} className="text-center">
                          <span className="font-semibold text-green-600">
                            {formatPercent(cap.metrics.accuracy)}
                          </span>
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">False Positive Rate</TableCell>
                      {comparison.capabilities.map((cap) => (
                        <TableCell key={cap.capability_type} className="text-center">
                          <span
                            className={
                              cap.metrics.false_positive_rate < 3
                                ? 'text-green-600'
                                : cap.metrics.false_positive_rate < 5
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                            }
                          >
                            {formatPercent(cap.metrics.false_positive_rate)}
                          </span>
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Total Detections</TableCell>
                      {comparison.capabilities.map((cap) => (
                        <TableCell key={cap.capability_type} className="text-center">
                          {formatNumber(cap.metrics.detections)}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Avg Inference Time</TableCell>
                      {comparison.capabilities.map((cap) => (
                        <TableCell key={cap.capability_type} className="text-center">
                          {cap.metrics.avg_inference_time_ms.toFixed(0)}ms
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Active Cameras</TableCell>
                      {comparison.capabilities.map((cap) => (
                        <TableCell key={cap.capability_type} className="text-center">
                          {cap.metrics.active_cameras}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Incidents Prevented</TableCell>
                      {comparison.capabilities.map((cap) => (
                        <TableCell key={cap.capability_type} className="text-center">
                          {cap.metrics.incidents_prevented}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Cost Avoided</TableCell>
                      {comparison.capabilities.map((cap) => (
                        <TableCell key={cap.capability_type} className="text-center">
                          <span className="font-semibold text-purple-600">
                            {formatCurrency(cap.metrics.cost_avoided)}
                          </span>
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Status</TableCell>
                      {comparison.capabilities.map((cap) => {
                        const statusConfig = STATUS_CONFIG[cap.metrics.status];
                        const Icon = statusConfig.icon;
                        return (
                          <TableCell key={cap.capability_type} className="text-center">
                            <Badge className={statusConfig.color}>
                              <Icon className="h-3 w-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Visual Comparison Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Radar</CardTitle>
                <CardDescription>Multi-dimensional performance comparison</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={getRadarChartData()}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    {comparison.capabilities.map((cap, i) => (
                      <Radar
                        key={cap.capability_type}
                        name={cap.display_name}
                        dataKey={`cap${i}`}
                        stroke={COLORS[i]}
                        fill={COLORS[i]}
                        fillOpacity={0.3}
                      />
                    ))}
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key Metrics Comparison</CardTitle>
                <CardDescription>Accuracy, FP rate, and inference time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={getBarChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Accuracy" fill="#10b981" />
                    <Bar dataKey="FP Rate" fill="#ef4444" />
                    <Bar dataKey="Inference (ms)" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Insights and Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle>Insights & Recommendations</CardTitle>
              <CardDescription>AI-generated analysis of comparison results</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {comparison.insights.map((insight, index) => {
                  const Icon = INSIGHT_ICONS[insight.type];
                  const cap = comparison.capabilities.find(
                    (c) => c.capability_type === insight.capability_type,
                  );
                  const priorityColors = {
                    high: 'border-red-200 bg-red-50',
                    medium: 'border-yellow-200 bg-yellow-50',
                    low: 'border-blue-200 bg-blue-50',
                  };

                  return (
                    <div
                      key={index}
                      className={`border-l-4 p-4 ${priorityColors[insight.priority]}`}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{insight.description}</p>
                          {cap && (
                            <p className="text-sm text-gray-600 mt-1">
                              Capability: {cap.display_name} | Metric: {insight.metric} | Value:{' '}
                              {insight.value.toFixed(1)}
                            </p>
                          )}
                        </div>
                        <Badge variant={insight.priority === 'high' ? 'destructive' : 'secondary'}>
                          {insight.priority}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Rankings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Accuracy Ranking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {comparison.rankings.by_accuracy.map((rank) => (
                    <div key={rank.capability_type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{rank.rank}</Badge>
                        <span>{rank.display_name}</span>
                      </div>
                      <span className="font-semibold text-green-600">
                        {formatPercent(rank.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Speed Ranking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {comparison.rankings.by_speed.map((rank) => (
                    <div key={rank.capability_type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{rank.rank}</Badge>
                        <span>{rank.display_name}</span>
                      </div>
                      <span className="font-semibold text-blue-600">{rank.value.toFixed(0)}ms</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Volume Ranking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {comparison.rankings.by_volume.map((rank) => (
                    <div key={rank.capability_type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{rank.rank}</Badge>
                        <span>{rank.display_name}</span>
                      </div>
                      <span className="font-semibold">{formatNumber(rank.value)} detections</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Impact Ranking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {comparison.rankings.by_cost_avoided.map((rank) => (
                    <div key={rank.capability_type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{rank.rank}</Badge>
                        <span>{rank.display_name}</span>
                      </div>
                      <span className="font-semibold text-purple-600">
                        {formatCurrency(rank.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
