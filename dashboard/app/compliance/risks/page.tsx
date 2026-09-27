'use client';

import { RiskMap } from "@/components/compliance/risk-map";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Plus, Search, TrendingUp, Activity } from 'lucide-react';

interface Risk {
  id: string;
  requirementId: string;
  riskCode: string;
  title: string;
  description: string;
  category: string;
  likelihood: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  impact: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  inherentRiskScore: number;
  residualRiskScore: number;
  riskResponse: 'accept' | 'mitigate' | 'transfer' | 'avoid';
  status: 'identified' | 'assessed' | 'treated' | 'monitored' | 'closed';
  owner?: string;
  reviewDate?: string;
  mitigationCount?: number;
}

export default function RisksPage() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [likelihoodFilter, setLikelihoodFilter] = useState('all');
  const [impactFilter, setImpactFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchRisks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/compliance/risks');
      if (!response.ok) throw new Error('Unable to load the risk register.');
      const data = await response.json();
      setRisks(Array.isArray(data.data) ? data.data.map(normalizeRisk) : []);
    } catch (error) {
      console.error('Failed to fetch risks:', error);
      setError(error instanceof Error ? error.message : 'Unable to load the risk register.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRisks(); }, [fetchRisks]);

  const filteredRisks = risks.filter(risk => {
    const matchesSearch = 
      risk.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      risk.riskCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      risk.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesLikelihood = likelihoodFilter === 'all' || risk.likelihood === likelihoodFilter;
    const matchesImpact = impactFilter === 'all' || risk.impact === impactFilter;
    const matchesStatus = statusFilter === 'all' || risk.status === statusFilter;

    return matchesSearch && matchesLikelihood && matchesImpact && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="risk-map-heading"><div><p className="workflow-kicker">ASSURANCE / EXPOSURE ATLAS</p><h1>Risk, in perspective.</h1><p>Move from the exposure map to the decisions that reduce it.</p></div><Link href="/compliance/risks/new" className="btn-primary"><Plus size={16}/>Add risk</Link></header>
        {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error} <button type="button" className="font-semibold underline" onClick={() => void fetchRisks()}>Try again</button></div>}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  aria-label="Search compliance risks"
                  type="text"
                  placeholder="Search risks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Likelihood Filter */}
            <div className="w-full md:w-40">
              <select
                aria-label="Risk likelihood"
                value={likelihoodFilter}
                onChange={(e) => setLikelihoodFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="all">All Likelihood</option>
                <option value="very_low">Very Low</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="very_high">Very High</option>
              </select>
            </div>

            {/* Impact Filter */}
            <div className="w-full md:w-40">
              <select
                aria-label="Risk impact"
                value={impactFilter}
                onChange={(e) => setImpactFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="all">All Impact</option>
                <option value="very_low">Very Low</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="very_high">Very High</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="w-full md:w-40">
              <select
                aria-label="Risk stage"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="identified">Identified</option>
                <option value="assessed">Assessed</option>
                <option value="treated">Treated</option>
                <option value="monitored">Monitored</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        </div>

        <RiskMap unavailable={Boolean(error)} records={risks.filter(risk=>{const q=searchTerm.toLowerCase();return [risk.title,risk.riskCode,risk.description].some(value=>value.toLowerCase().includes(q))&&(statusFilter==="all"||risk.status===statusFilter);})} filtered={filteredRisks} likelihood={likelihoodFilter} impact={impactFilter} onCell={(likelihood,impact)=>{setLikelihoodFilter(likelihood);setImpactFilter(impact);}}/>

      </div>
    </div>
  );
}

const riskScale = { very_low: 1, negligible: 1, low: 2, medium: 3, high: 4, very_high: 5, critical: 5 } as const;

function normalizeScale(value: unknown): Risk['likelihood'] {
  if (value === 'critical' || value === 'very_high') return 'very_high';
  if (value === 'negligible' || value === 'very_low') return 'very_low';
  if (value === 'low' || value === 'high') return value;
  return 'medium';
}

function normalizeRisk(item: any): Risk {
  const likelihood = normalizeScale(item.likelihood ?? item.inherentLikelihood);
  const impact = normalizeScale(item.impact ?? item.inherentImpact);
  const residualLikelihood = normalizeScale(item.residualLikelihood ?? likelihood);
  const residualImpact = normalizeScale(item.residualImpact ?? impact);
  return {
    ...item,
    id: item.id,
    requirementId: item.requirementId ?? '',
    riskCode: item.riskCode ?? item.riskNumber ?? item.id?.slice(0, 8) ?? 'RISK',
    title: item.title ?? item.riskTitle ?? item.riskName ?? 'Untitled risk',
    description: item.description ?? item.riskDescription ?? '',
    category: item.category ?? item.riskCategory ?? 'compliance',
    likelihood,
    impact,
    inherentRiskScore: validScore(item.inherentRiskScore, riskScale[likelihood] * riskScale[impact]),
    residualRiskScore: validScore(item.residualRiskScore, riskScale[residualLikelihood] * riskScale[residualImpact]),
    riskResponse: ['accept', 'mitigate', 'transfer', 'avoid'].includes(item.riskResponse ?? item.riskTreatment) ? (item.riskResponse ?? item.riskTreatment) : 'mitigate',
    status: ['identified', 'assessed', 'treated', 'monitored', 'closed'].includes(item.status) ? item.status : 'identified',
    owner: item.owner ?? item.riskOwner,
    reviewDate: item.reviewDate ?? item.nextReviewDate,
  };
}

function validScore(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 25 ? value : fallback;
}
