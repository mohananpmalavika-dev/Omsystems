"use client";

import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/app-layout';
import { PageHero } from '@/components/page-hero';
import { 
  DollarSign, TrendingUp, TrendingDown, PieChart, BarChart3, 
  Download, RefreshCw, AlertTriangle, CheckCircle2, Target,
  Zap, ArrowRight, Calculator
} from 'lucide-react';
import Link from 'next/link';

interface TCOData {
  period: string;
  dateRange: { start: string; end: string };
  generatedAt: string;
  summary: {
    totalCost: number;
    capex: number;
    opex: number;
    hiddenCosts: number;
    costPerCamera: number;
    costPerIncident: number;
    costPerBranch: number;
  };
  breakdown: {
    capex: Array<{ item: string; quantity: number; unitCost: number; total: number }>;
    opex: Array<{ item: string; total: number }>;
    hiddenCosts: Array<{ item: string; total: number }>;
  };
  branches: Array<{ branch: string; incidentCount: number; totalCost: number }>;
  budget: {
    allocated: number;
    spent: number;
    remaining: number;
    utilizationPercent: number;
    variance: number;
  };
  recommendations: Array<{
    priority: string;
    category: string;
    title: string;
    description: string;
    recommendation: string;
    potentialSavings?: number;
    branches?: string[];
  }>;
  insights: Array<{
    type: string;
    title: string;
    message: string;
    details: string;
  }>;
}

interface ROIData {
  period: string;
  dateRange: { start: string; end: string };
  investment: {
    capex: number;
    opex: number;
    total: number;
  };
  benefits: Array<{ item: string; value: number }>;
  totalBenefits: number;
  roi: {
    netBenefit: number;
    percentage: number;
    paybackMonths: number;
    status: string;
  };
  insights: Array<{
    type: string;
    title: string;
    message: string;
    details: string;
  }>;
}

export default function FinancialTCOPage() {
  const [tcoData, setTcoData] = useState<TCOData | null>(null);
  const [roiData, setRoiData] = useState<ROIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('monthly');
  const [activeTab, setActiveTab] = useState<'tco' | 'roi'>('tco');

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'x-sentinel-session': token || '',
      };

      // Load TCO data
      const tcoResponse = await fetch(`/api/control/v1/reports/financial/tco?period=${period}`, {
        headers,
        credentials: 'include',
      });

      if (!tcoResponse.ok) throw new Error('Failed to load TCO data');
      const tcoResult = await tcoResponse.json();
      setTcoData(tcoResult.data);

      // Load ROI data
      const roiResponse = await fetch('/api/control/v1/reports/financial/roi', {
        headers,
        credentials: 'include',
      });

      if (!roiResponse.ok) throw new Error('Failed to load ROI data');
      const roiResult = await roiResponse.json();
      setRoiData(roiResult.data);

      setError('');
    } catch (err) {
      console.error('[FinancialTCO] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load financial data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [period]);

  const exportReport = async (format: 'pdf' | 'excel') => {
    alert(`Export to ${format.toUpperCase()} will be available soon`);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
            <p className="text-lg">Loading Financial Reports...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !tcoData || !roiData) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4">
            <p className="text-red-300">❌ {error || 'No data available'}</p>
            <button onClick={loadData} className="mt-3 btn-primary">
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <main className="p-6 space-y-6 max-w-[1800px] mx-auto">
        <PageHero
          eyebrow="Financial MIS"
          title="Total Cost of Ownership & ROI Analysis"
          description="Comprehensive financial analysis of security infrastructure investment and operational costs"
          icon={DollarSign}
          actions={
            <div className="flex gap-3">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="input"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
              <button onClick={loadData} className="btn-secondary">
                <RefreshCw size={16} /> Refresh
              </button>
              <button onClick={() => exportReport('pdf')} className="btn-primary">
                <Download size={16} /> Export PDF
              </button>
            </div>
          }
        />

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-gray-700">
          <button
            onClick={() => setActiveTab('tco')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === 'tco'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            <DollarSign size={16} className="inline mr-2" />
            Total Cost of Ownership
          </button>
          <button
            onClick={() => setActiveTab('roi')}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === 'roi'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            <Calculator size={16} className="inline mr-2" />
            ROI Analysis
          </button>
        </div>

        {/* TCO Tab */}
        {activeTab === 'tco' && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <MetricCard
                title="Total Cost"
                value={`$${tcoData.summary.totalCost.toLocaleString()}`}
                subtitle={`${period} total`}
                icon={DollarSign}
                color="blue"
              />
              <MetricCard
                title="CapEx"
                value={`$${tcoData.summary.capex.toLocaleString()}`}
                subtitle={`${Math.round((tcoData.summary.capex / tcoData.summary.totalCost) * 100)}% of total`}
                icon={Target}
                color="green"
              />
              <MetricCard
                title="OpEx"
                value={`$${tcoData.summary.opex.toLocaleString()}`}
                subtitle={`${Math.round((tcoData.summary.opex / tcoData.summary.totalCost) * 100)}% of total`}
                icon={TrendingUp}
                color="yellow"
              />
              <MetricCard
                title="Hidden Costs"
                value={`$${tcoData.summary.hiddenCosts.toLocaleString()}`}
                subtitle={`${Math.round((tcoData.summary.hiddenCosts / tcoData.summary.totalCost) * 100)}% of total`}
                icon={AlertTriangle}
                color="red"
              />
            </div>

            {/* Cost Breakdown Pie Chart */}
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <PieChart size={20} />
                  Cost Breakdown by Category
                </h3>
                <div className="space-y-4">
                  <CostBar
                    label="Capital Expenditure (CapEx)"
                    amount={tcoData.summary.capex}
                    total={tcoData.summary.totalCost}
                    color="green"
                  />
                  <CostBar
                    label="Operating Expenditure (OpEx)"
                    amount={tcoData.summary.opex}
                    total={tcoData.summary.totalCost}
                    color="blue"
                  />
                  <CostBar
                    label="Hidden/Indirect Costs"
                    amount={tcoData.summary.hiddenCosts}
                    total={tcoData.summary.totalCost}
                    color="red"
                  />
                </div>
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="flex justify-between font-semibold">
                    <span>Total Cost</span>
                    <span className="text-blue-400">${tcoData.summary.totalCost.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Cost Metrics */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Cost Efficiency Metrics</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded">
                    <span className="text-gray-300">Cost per Camera</span>
                    <span className="text-xl font-bold text-blue-400">
                      ${tcoData.summary.costPerCamera.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded">
                    <span className="text-gray-300">Cost per Incident</span>
                    <span className="text-xl font-bold text-blue-400">
                      ${tcoData.summary.costPerIncident.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-800/50 rounded">
                    <span className="text-gray-300">Cost per Branch (Avg)</span>
                    <span className="text-xl font-bold text-blue-400">
                      ${tcoData.summary.costPerBranch.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Breakdown Tables */}
            <div className="grid lg:grid-cols-3 gap-5">
              {/* CapEx Breakdown */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 text-green-400">CapEx Breakdown</h3>
                <div className="space-y-2">
                  {tcoData.breakdown.capex.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm p-2 bg-green-900/10 rounded">
                      <div>
                        <div className="font-medium">{item.item}</div>
                        <div className="text-xs text-gray-400">{item.quantity} × ${item.unitCost}</div>
                      </div>
                      <div className="font-semibold text-green-400">${item.total.toLocaleString()}</div>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-green-400 pt-2 border-t border-green-500/30">
                    <span>Total CapEx</span>
                    <span>${tcoData.summary.capex.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* OpEx Breakdown */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 text-blue-400">OpEx Breakdown</h3>
                <div className="space-y-2">
                  {tcoData.breakdown.opex.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm p-2 bg-blue-900/10 rounded">
                      <div className="font-medium">{item.item}</div>
                      <div className="font-semibold text-blue-400">${item.total.toLocaleString()}</div>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-blue-400 pt-2 border-t border-blue-500/30">
                    <span>Total OpEx</span>
                    <span>${tcoData.summary.opex.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Hidden Costs Breakdown */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 text-red-400">Hidden Costs</h3>
                <div className="space-y-2">
                  {tcoData.breakdown.hiddenCosts.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm p-2 bg-red-900/10 rounded">
                      <div className="font-medium">{item.item}</div>
                      <div className="font-semibold text-red-400">${item.total.toLocaleString()}</div>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-red-400 pt-2 border-t border-red-500/30">
                    <span>Total Hidden</span>
                    <span>${tcoData.summary.hiddenCosts.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Branch Cost Analysis */}
            {tcoData.branches.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 size={20} />
                  Cost by Branch
                </h3>
                <div className="space-y-2">
                  {tcoData.branches.slice(0, 10).map((branch, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-sm w-32 text-gray-400 truncate">{branch.branch}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-8 relative overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full flex items-center px-3"
                          style={{
                            width: `${Math.min(
                              100,
                              (branch.totalCost / Math.max(...tcoData.branches.map(b => b.totalCost))) * 100
                            )}%`
                          }}
                        >
                          <span className="text-sm font-semibold">${branch.totalCost.toLocaleString()}</span>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 w-24">{branch.incidentCount} incidents</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost Optimization Recommendations */}
            {tcoData.recommendations.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Zap size={20} className="text-yellow-400" />
                  Cost Optimization Recommendations
                </h3>
                <div className="space-y-3">
                  {tcoData.recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        rec.priority === 'high'
                          ? 'bg-red-900/20 border-red-500/50'
                          : rec.priority === 'medium'
                          ? 'bg-yellow-900/20 border-yellow-500/50'
                          : 'bg-blue-900/20 border-blue-500/50'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="text-xs uppercase tracking-wide text-gray-400">{rec.category}</span>
                          <h4 className="font-semibold">{rec.title}</h4>
                        </div>
                        {rec.potentialSavings && (
                          <div className="text-right">
                            <div className="text-xs text-gray-400">Potential Savings</div>
                            <div className="text-lg font-bold text-green-400">
                              ${rec.potentialSavings.toLocaleString()}
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-gray-300 mb-2">{rec.description}</p>
                      <p className="text-sm text-blue-300">
                        <strong>Action:</strong> {rec.recommendation}
                      </p>
                      {rec.branches && rec.branches.length > 0 && (
                        <div className="mt-2 text-xs text-gray-400">
                          Affected branches: {rec.branches.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ROI Tab */}
        {activeTab === 'roi' && (
          <>
            {/* ROI Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <MetricCard
                title="Total Investment"
                value={`$${roiData.investment.total.toLocaleString()}`}
                subtitle="Last 12 months"
                icon={DollarSign}
                color="blue"
              />
              <MetricCard
                title="Total Benefits"
                value={`$${roiData.totalBenefits.toLocaleString()}`}
                subtitle="Quantified value"
                icon={TrendingUp}
                color="green"
              />
              <MetricCard
                title="ROI"
                value={`${roiData.roi.percentage.toFixed(0)}%`}
                subtitle={roiData.roi.status}
                icon={Calculator}
                color={roiData.roi.percentage > 100 ? 'green' : roiData.roi.percentage > 0 ? 'yellow' : 'red'}
              />
              <MetricCard
                title="Payback Period"
                value={`${roiData.roi.paybackMonths}`}
                subtitle="months"
                icon={Target}
                color="blue"
              />
            </div>

            {/* ROI Calculation Breakdown */}
            <div className="grid lg:grid-cols-2 gap-5">
              {/* Investment Breakdown */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Investment Breakdown</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-red-900/20 rounded">
                    <span>Capital Expenditure</span>
                    <span className="font-bold text-red-400">${roiData.investment.capex.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-900/20 rounded">
                    <span>Operating Expenditure</span>
                    <span className="font-bold text-red-400">${roiData.investment.opex.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-900/30 rounded border border-red-500/30">
                    <span className="font-semibold">Total Investment</span>
                    <span className="font-bold text-xl text-red-400">
                      ${roiData.investment.total.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Benefits Breakdown */}
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">Quantified Benefits</h3>
                <div className="space-y-3">
                  {roiData.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-green-900/20 rounded">
                      <span>{benefit.item}</span>
                      <span className="font-bold text-green-400">${benefit.value.toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center p-3 bg-green-900/30 rounded border border-green-500/30">
                    <span className="font-semibold">Total Benefits</span>
                    <span className="font-bold text-xl text-green-400">
                      ${roiData.totalBenefits.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ROI Calculation */}
            <div className="card bg-gradient-to-r from-blue-950/40 to-purple-950/40 border-blue-500/30">
              <h3 className="text-lg font-semibold mb-4 text-center">ROI Calculation</h3>
              <div className="flex flex-col items-center space-y-4">
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-2">Net Benefit</div>
                  <div className="text-3xl font-bold">
                    ${roiData.roi.netBenefit.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    (Benefits ${roiData.totalBenefits.toLocaleString()} - Investment $
                    {roiData.investment.total.toLocaleString()})
                  </div>
                </div>
                <div className="text-5xl text-gray-600">÷</div>
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-2">Total Investment</div>
                  <div className="text-3xl font-bold">${roiData.investment.total.toLocaleString()}</div>
                </div>
                <div className="text-5xl text-gray-600">×</div>
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-2">100</div>
                </div>
                <div className="text-5xl text-gray-600">=</div>
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-2">ROI</div>
                  <div
                    className={`text-5xl font-bold ${
                      roiData.roi.percentage > 100
                        ? 'text-green-400'
                        : roiData.roi.percentage > 0
                        ? 'text-yellow-400'
                        : 'text-red-400'
                    }`}
                  >
                    {roiData.roi.percentage.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-400 mt-2">
                    Status: <span className="font-semibold capitalize">{roiData.roi.status}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ROI Insights */}
            {roiData.insights.length > 0 && (
              <div className="card">
                <h3 className="text-lg font-semibold mb-4">ROI Analysis Insights</h3>
                <div className="space-y-3">
                  {roiData.insights.map((insight, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        insight.type === 'success'
                          ? 'bg-green-900/20 border-green-500/50'
                          : insight.type === 'warning'
                          ? 'bg-yellow-900/20 border-yellow-500/50'
                          : 'bg-blue-900/20 border-blue-500/50'
                      }`}
                    >
                      <h4 className="font-semibold mb-1">{insight.title}</h4>
                      <p className="text-sm text-gray-300 mb-2">{insight.message}</p>
                      <p className="text-xs text-gray-400">{insight.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Related Reports */}
        <div className="card bg-gradient-to-br from-purple-950/30 to-pink-950/30 border-purple-500/30">
          <h3 className="text-lg font-semibold mb-3">Related MIS Reports</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <Link href="/reports/benchmarking" className="flex items-center justify-between p-3 bg-purple-900/20 hover:bg-purple-900/30 rounded-lg border border-purple-500/30 transition">
              <span className="font-medium">Branch Benchmarking</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/reports/compliance" className="flex items-center justify-between p-3 bg-purple-900/20 hover:bg-purple-900/30 rounded-lg border border-purple-500/30 transition">
              <span className="font-medium">Compliance Scorecard</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/mis-dashboard" className="flex items-center justify-between p-3 bg-purple-900/20 hover:bg-purple-900/30 rounded-lg border border-purple-500/30 transition">
              <span className="font-medium">Executive Dashboard</span>
              <ArrowRight size={16} />
            </Link>
            <Link href="/reports" className="flex items-center justify-between p-3 bg-purple-900/20 hover:bg-purple-900/30 rounded-lg border border-purple-500/30 transition">
              <span className="font-medium">All Reports</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}

// ========================
// Sub-components
// ========================

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
  color: 'blue' | 'green' | 'yellow' | 'red';
}) {
  const colorClasses = {
    blue: 'border-blue-500/50 bg-blue-950/30',
    green: 'border-green-500/50 bg-green-950/30',
    yellow: 'border-yellow-500/50 bg-yellow-950/30',
    red: 'border-red-500/50 bg-red-950/30'
  };

  const iconColorClasses = {
    blue: 'text-blue-400 bg-blue-500/20',
    green: 'text-green-400 bg-green-500/20',
    yellow: 'text-yellow-400 bg-yellow-500/20',
    red: 'text-red-400 bg-red-500/20'
  };

  const valueColorClasses = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400'
  };

  return (
    <div className={`card ${colorClasses[color]}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${iconColorClasses[color]}`}>
          <Icon size={20} />
        </div>
      </div>
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${valueColorClasses[color]} mb-1`}>{value}</div>
      <div className="text-xs text-gray-400">{subtitle}</div>
    </div>
  );
}

function CostBar({
  label,
  amount,
  total,
  color
}: {
  label: string;
  amount: number;
  total: number;
  color: 'blue' | 'green' | 'red';
}) {
  const percentage = (amount / total) * 100;

  const colorClasses = {
    blue: 'from-blue-600 to-blue-400',
    green: 'from-green-600 to-green-400',
    red: 'from-red-600 to-red-400'
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="font-semibold">${amount.toLocaleString()} ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${colorClasses[color]} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
