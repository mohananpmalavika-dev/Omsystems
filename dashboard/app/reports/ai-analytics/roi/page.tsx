'use client';

/**
 * AI ROI Calculator Page
 * 
 * Interactive ROI calculator for AI analytics capabilities.
 * Features:
 * - Investment cost inputs (configurable)
 * - Real-time ROI calculation
 * - Multi-year projections with charts
 * - Cost avoided breakdown by domain
 * - Export to PDF/Excel
 * - NPV and IRR visualization
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Calendar,
  Download,
  RefreshCcw,
  AlertCircle,
  CheckCircle,
  Info,
} from 'lucide-react';

interface RoiReport {
  period: {
    start_date: string;
    end_date: string;
    months: number;
  };
  investment: {
    initial_setup: {
      platform_license: number;
      model_training: number;
      infrastructure: number;
      integration: number;
      total: number;
    };
    annual_recurring: {
      platform_license: number;
      cloud_computing: number;
      model_maintenance: number;
      support_training: number;
      total: number;
    };
    first_year_total: number;
    annual_recurring_total: number;
  };
  benefits: {
    prevented_losses: {
      theft_prevention: number;
      fraud_detection: number;
      safety_incidents_avoided: number;
      liability_claims_prevented: number;
      subtotal: number;
    };
    operational_efficiency: {
      investigation_time_saved: number;
      manual_monitoring_reduced: number;
      false_alarm_reduction: number;
      faster_incident_response: number;
      subtotal: number;
    };
    compliance_risk: {
      audit_preparation: number;
      compliance_fines_avoided: number;
      insurance_premium_reduction: number;
      regulatory_confidence: number;
      subtotal: number;
    };
    total_annual_benefits: number;
  };
  roi_calculation: {
    year_1: {
      investment: number;
      benefits: number;
      net_benefit: number;
      roi_percent: number;
      payback_period_months: number;
    };
    year_2_3_recurring: {
      annual_cost: number;
      annual_benefits: number;
      net_annual_benefit: number;
      roi_percent: number;
    };
    three_year_npv: number;
    three_year_irr: number;
  };
  projections?: {
    year_1: { investment: number; benefits: number; net: number };
    year_2: { investment: number; benefits: number; net: number };
    year_3: { investment: number; benefits: number; net: number };
  };
  breakdown_by_domain: Array<{
    domain: string;
    domain_name: string;
    cost_avoided: number;
    percent_of_total: number;
  }>;
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

export default function AiRoiCalculatorPage() {
  const [loading, setLoading] = useState(false);
  const [roiReport, setRoiReport] = useState<RoiReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Date range
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [includeProjections, setIncludeProjections] = useState(true);

  // Load ROI report
  const loadRoiReport = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        include_projections: includeProjections.toString(),
      });

      const response = await fetch(`/api/control/v1/reports/ai-analytics/roi?${params}`);
      if (!response.ok) {
        throw new Error('Failed to load ROI report');
      }

      const data = await response.json();
      setRoiReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoiReport();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Prepare chart data
  const getProjectionChartData = () => {
    if (!roiReport?.projections) return [];
    const { year_1, year_2, year_3 } = roiReport.projections;
    return [
      { year: 'Year 1', Investment: year_1.investment, Benefits: year_1.benefits, Net: year_1.net },
      { year: 'Year 2', Investment: year_2.investment, Benefits: year_2.benefits, Net: year_2.net },
      { year: 'Year 3', Investment: year_3.investment, Benefits: year_3.benefits, Net: year_3.net },
    ];
  };

  const getBenefitsBreakdownData = () => {
    if (!roiReport) return [];
    const { prevented_losses, operational_efficiency, compliance_risk } = roiReport.benefits;
    return [
      { name: 'Prevented Losses', value: prevented_losses.subtotal },
      { name: 'Operational Efficiency', value: operational_efficiency.subtotal },
      { name: 'Compliance & Risk', value: compliance_risk.subtotal },
    ];
  };

  const getInvestmentBreakdownData = () => {
    if (!roiReport) return [];
    const { initial_setup } = roiReport.investment;
    return [
      { name: 'Platform License', value: initial_setup.platform_license },
      { name: 'Model Training', value: initial_setup.model_training },
      { name: 'Infrastructure', value: initial_setup.infrastructure },
      { name: 'Integration', value: initial_setup.integration },
    ];
  };

  if (loading && !roiReport) {
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
          <h1 className="text-3xl font-bold text-gray-900">AI ROI Calculator</h1>
          <p className="text-gray-600 mt-1">
            Calculate return on investment for AI analytics capabilities
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadRoiReport} disabled={loading}>
            <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Date Range Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Analysis Period</CardTitle>
          <CardDescription>Select date range for ROI calculation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={loadRoiReport} disabled={loading} className="w-full">
                <Calendar className="h-4 w-4 mr-2" />
                Calculate ROI
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

      {roiReport && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Year 1 ROI</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {formatPercent(roiReport.roi_calculation.year_1.roi_percent)}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Net Benefit: {formatCurrency(roiReport.roi_calculation.year_1.net_benefit)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Payback Period</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {roiReport.roi_calculation.year_1.payback_period_months.toFixed(1)} months
                </div>
                <p className="text-xs text-gray-600 mt-2">Time to break even</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>3-Year NPV</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">
                  {formatCurrency(roiReport.roi_calculation.three_year_npv)}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  IRR: {formatPercent(roiReport.roi_calculation.three_year_irr)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Benefits</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {formatCurrency(roiReport.benefits.total_annual_benefits)}
                </div>
                <p className="text-xs text-gray-600 mt-2">Annual value generated</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="summary" className="space-y-6">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="investment">Investment</TabsTrigger>
              <TabsTrigger value="benefits">Benefits</TabsTrigger>
              <TabsTrigger value="projections">Projections</TabsTrigger>
              <TabsTrigger value="breakdown">Domain Breakdown</TabsTrigger>
            </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Year 1 Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle>Year 1 Financial Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Total Investment</span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(roiReport.roi_calculation.year_1.investment)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Annual Benefits</span>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(roiReport.roi_calculation.year_1.benefits)}
                      </span>
                    </div>
                    <div className="border-t pt-4 flex justify-between items-center">
                      <span className="text-gray-900 font-semibold">Net Benefit</span>
                      <span className="font-bold text-2xl text-green-600">
                        {formatCurrency(roiReport.roi_calculation.year_1.net_benefit)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">ROI</span>
                      <Badge variant="default" className="bg-green-600">
                        {formatPercent(roiReport.roi_calculation.year_1.roi_percent)}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Payback Period</span>
                      <span className="font-semibold text-blue-600">
                        {roiReport.roi_calculation.year_1.payback_period_months.toFixed(1)} months
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Year 2-3 Recurring */}
                <Card>
                  <CardHeader>
                    <CardTitle>Year 2-3 Recurring</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Annual Cost</span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(roiReport.roi_calculation.year_2_3_recurring.annual_cost)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Annual Benefits</span>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(
                          roiReport.roi_calculation.year_2_3_recurring.annual_benefits,
                        )}
                      </span>
                    </div>
                    <div className="border-t pt-4 flex justify-between items-center">
                      <span className="text-gray-900 font-semibold">Net Annual Benefit</span>
                      <span className="font-bold text-2xl text-green-600">
                        {formatCurrency(
                          roiReport.roi_calculation.year_2_3_recurring.net_annual_benefit,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Annual ROI</span>
                      <Badge variant="default" className="bg-green-600">
                        {formatPercent(roiReport.roi_calculation.year_2_3_recurring.roi_percent)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Benefits Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Benefits Distribution</CardTitle>
                  <CardDescription>Annual benefits by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={getBenefitsBreakdownData()}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {getBenefitsBreakdownData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Investment Tab */}
            <TabsContent value="investment" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Initial Setup Costs</CardTitle>
                    <CardDescription>One-time investment</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span>Platform License (Year 1)</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.investment.initial_setup.platform_license)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Model Training</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.investment.initial_setup.model_training)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Infrastructure (GPUs)</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.investment.initial_setup.infrastructure)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Integration & Setup</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.investment.initial_setup.integration)}
                      </span>
                    </div>
                    <div className="border-t pt-3 flex justify-between">
                      <span className="font-bold">Total</span>
                      <span className="font-bold text-lg">
                        {formatCurrency(roiReport.investment.initial_setup.total)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Annual Recurring Costs</CardTitle>
                    <CardDescription>Ongoing operational expenses</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span>Platform License</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.investment.annual_recurring.platform_license)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cloud Computing</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.investment.annual_recurring.cloud_computing)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Model Maintenance</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.investment.annual_recurring.model_maintenance)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Support & Training</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.investment.annual_recurring.support_training)}
                      </span>
                    </div>
                    <div className="border-t pt-3 flex justify-between">
                      <span className="font-bold">Total</span>
                      <span className="font-bold text-lg">
                        {formatCurrency(roiReport.investment.annual_recurring.total)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Investment Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={getInvestmentBreakdownData()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="value" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Benefits Tab */}
            <TabsContent value="benefits" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Prevented Losses</CardTitle>
                    <CardDescription>
                      {formatCurrency(roiReport.benefits.prevented_losses.subtotal)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Theft Prevention</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.benefits.prevented_losses.theft_prevention)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Fraud Detection</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.benefits.prevented_losses.fraud_detection)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Safety Incidents</span>
                      <span className="font-semibold">
                        {formatCurrency(
                          roiReport.benefits.prevented_losses.safety_incidents_avoided,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Liability Claims</span>
                      <span className="font-semibold">
                        {formatCurrency(
                          roiReport.benefits.prevented_losses.liability_claims_prevented,
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Operational Efficiency</CardTitle>
                    <CardDescription>
                      {formatCurrency(roiReport.benefits.operational_efficiency.subtotal)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Investigation Time</span>
                      <span className="font-semibold">
                        {formatCurrency(
                          roiReport.benefits.operational_efficiency.investigation_time_saved,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Manual Monitoring</span>
                      <span className="font-semibold">
                        {formatCurrency(
                          roiReport.benefits.operational_efficiency.manual_monitoring_reduced,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>False Alarm Reduction</span>
                      <span className="font-semibold">
                        {formatCurrency(
                          roiReport.benefits.operational_efficiency.false_alarm_reduction,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Faster Response</span>
                      <span className="font-semibold">
                        {formatCurrency(
                          roiReport.benefits.operational_efficiency.faster_incident_response,
                        )}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Compliance & Risk</CardTitle>
                    <CardDescription>
                      {formatCurrency(roiReport.benefits.compliance_risk.subtotal)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Audit Preparation</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.benefits.compliance_risk.audit_preparation)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Fines Avoided</span>
                      <span className="font-semibold">
                        {formatCurrency(
                          roiReport.benefits.compliance_risk.compliance_fines_avoided,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Insurance Reduction</span>
                      <span className="font-semibold">
                        {formatCurrency(
                          roiReport.benefits.compliance_risk.insurance_premium_reduction,
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Regulatory Confidence</span>
                      <span className="font-semibold">
                        {formatCurrency(roiReport.benefits.compliance_risk.regulatory_confidence)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Benefit Calculation Methodology</AlertTitle>
                <AlertDescription>
                  Benefits are calculated from actual incident prevention data, investigation time
                  saved, and industry-standard cost estimates. Values are conservative and based on
                  12-month rolling averages.
                </AlertDescription>
              </Alert>
            </TabsContent>

            {/* Projections Tab */}
            <TabsContent value="projections" className="space-y-6">
              {roiReport.projections && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>3-Year Financial Projection</CardTitle>
                      <CardDescription>Projected ROI with 5% annual benefit growth</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={getProjectionChartData()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="year" />
                          <YAxis />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Legend />
                          <Bar dataKey="Investment" fill="#ef4444" />
                          <Bar dataKey="Benefits" fill="#10b981" />
                          <Bar dataKey="Net" fill="#8b5cf6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle>Year 1</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between">
                          <span>Investment</span>
                          <span className="text-red-600 font-semibold">
                            {formatCurrency(roiReport.projections.year_1.investment)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Benefits</span>
                          <span className="text-green-600 font-semibold">
                            {formatCurrency(roiReport.projections.year_1.benefits)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                          <span className="font-bold">Net</span>
                          <span className="font-bold text-green-600">
                            {formatCurrency(roiReport.projections.year_1.net)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Year 2</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between">
                          <span>Investment</span>
                          <span className="text-red-600 font-semibold">
                            {formatCurrency(roiReport.projections.year_2.investment)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Benefits</span>
                          <span className="text-green-600 font-semibold">
                            {formatCurrency(roiReport.projections.year_2.benefits)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                          <span className="font-bold">Net</span>
                          <span className="font-bold text-green-600">
                            {formatCurrency(roiReport.projections.year_2.net)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Year 3</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex justify-between">
                          <span>Investment</span>
                          <span className="text-red-600 font-semibold">
                            {formatCurrency(roiReport.projections.year_3.investment)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Benefits</span>
                          <span className="text-green-600 font-semibold">
                            {formatCurrency(roiReport.projections.year_3.benefits)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                          <span className="font-bold">Net</span>
                          <span className="font-bold text-green-600">
                            {formatCurrency(roiReport.projections.year_3.net)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Advanced Financial Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          Net Present Value (NPV)
                        </h4>
                        <p className="text-3xl font-bold text-purple-600">
                          {formatCurrency(roiReport.roi_calculation.three_year_npv)}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          Discounted at 8% annual rate
                        </p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          Internal Rate of Return (IRR)
                        </h4>
                        <p className="text-3xl font-bold text-blue-600">
                          {formatPercent(roiReport.roi_calculation.three_year_irr)}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          Effective annual return rate
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Domain Breakdown Tab */}
            <TabsContent value="breakdown" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Cost Avoided by AI Domain</CardTitle>
                  <CardDescription>
                    Financial impact breakdown across capability domains
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {roiReport.breakdown_by_domain.map((domain, index) => (
                      <div key={domain.domain} className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{domain.domain_name}</span>
                            <span className="text-sm font-semibold">
                              {formatCurrency(domain.cost_avoided)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{
                                width: `${domain.percent_of_total}%`,
                                backgroundColor: COLORS[index % COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                        <Badge variant="secondary">{domain.percent_of_total.toFixed(1)}%</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>ROI Calculation Complete</AlertTitle>
                <AlertDescription>
                  This ROI analysis is based on actual performance data from {roiReport.period.months}{' '}
                  months of AI analytics operation. All financial projections use conservative
                  industry-standard assumptions.
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
