'use client';

import Link from "next/link";
import { WorkflowNav } from "@/components/workflow-nav";
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { complianceApi } from '@/lib/api-client';

type AssessmentStatus = 'compliant' | 'exception' | 'non-compliant' | 'incomplete';

interface Assessment {
  id: string;
  frameworkId: string;
  frameworkName?: string;
  branchNodeId?: string;
  branchName?: string;
  status: AssessmentStatus;
  assessmentPeriodStart?: string | null;
  assessmentPeriodEnd?: string | null;
  summary?: {
    compliancePercentage?: number;
    totalRequirements?: number;
    compliantRequirements?: number;
    criticalFindings?: number;
  };
  createdAt: string;
  updatedAt: string;
}

const statusLabels: Record<AssessmentStatus, string> = {
  compliant: 'Compliant', exception: 'Exception', 'non-compliant': 'Non-compliant', incomplete: 'Incomplete',
};

export default function AssessmentsPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AssessmentStatus | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [frameworkId, setFrameworkId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await complianceApi.listAssessments(status ? { status } : undefined);
      setFeedError(null);
      setAssessments(Array.isArray(response.data) ? response.data as Assessment[] : []);
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Assessments unavailable.');
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void fetchAssessments(); }, [fetchAssessments]);

  const formatDate = (dateString?: string | null) => {
    if (!dateString || Number.isNaN(new Date(dateString).getTime())) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleCreateAssessment = () => {
    setShowCreateModal(true);
  };

  const createAssessment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const assessment = await complianceApi.createAssessment({
        frameworkId,
        status: 'incomplete',
        ...(periodStart ? { assessmentPeriodStart: new Date(`${periodStart}T00:00:00.000Z`).toISOString() } : {}),
        ...(periodEnd ? { assessmentPeriodEnd: new Date(`${periodEnd}T00:00:00.000Z`).toISOString() } : {}),
      }) as Assessment;
      setShowCreateModal(false);
      setFrameworkId('');
      setPeriodStart('');
      setPeriodEnd('');
      router.push(`/compliance/assessments/${assessment.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create assessment.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="assessment-runway-page page-container">
      <header className="workflow-heading"><div><p className="workflow-kicker">ASSURANCE / ASSESSMENT RUNWAY</p><h1>From review to assurance.</h1><p>Follow the assessment states. Open a review to record findings and advance its actual outcome.</p></div><button className="btn-primary" onClick={handleCreateAssessment}>New assessment</button></header>
      {feedError && <p role="alert" className="work-order-form-error">{feedError}</p>}
      {error && <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</div>}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="new-assessment-title">
          <form onSubmit={createAssessment} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 id="new-assessment-title" className="text-xl font-semibold text-gray-900">New assessment</h2>
            <p className="mt-1 text-sm text-gray-600">Use the framework ID from the framework catalog. The assessment starts as incomplete until results are recorded.</p>
            <label className="mt-5 block text-sm font-medium text-gray-700">Framework ID
              <input required value={frameworkId} onChange={(event) => setFrameworkId(event.target.value)} placeholder="UUID" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">Period start<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label>
              <label className="text-sm font-medium text-gray-700">Period end<input type="date" min={periodStart || undefined} value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" /></label>
            </div>
            <div className="mt-6 flex justify-end gap-3"><button type="button" className="px-4 py-2 text-sm text-gray-700" onClick={() => setShowCreateModal(false)} disabled={creating}>Cancel</button><button type="submit" disabled={creating} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{creating ? 'Creating…' : 'Create assessment'}</button></div>
          </form>
        </div>
      )}

      <WorkflowNav label="Assessment scope" value={status} onChange={value => setStatus(value as AssessmentStatus | '')} items={[{id:"",label:"All reviews"},{id:"incomplete",label:"In progress"},{id:"non-compliant",label:"Action required"},{id:"exception",label:"Exceptions"},{id:"compliant",label:"Assured"}]} />
      {loading ? <div className="workflow-empty">Loading assessment runway…</div> : feedError ? <div className="workflow-empty">Assessment data is unavailable.</div> : <div className="assessment-runway">{([
        {id:"incomplete",title:"01 / In review",hint:"Complete the requirement checks."},
        {id:"non-compliant",title:"02 / Action required",hint:"Resolve the recorded compliance gaps."},
        {id:"exception",title:"03 / Exceptions",hint:"Review accepted exceptions and their context."},
        {id:"compliant",title:"04 / Assured",hint:"Review completed assurance outcomes."}
      ] as const).filter(lane => !status || lane.id === status).map(lane => {
        const records = assessments.filter(record => record.status === lane.id);
        return <section key={lane.id} className="assessment-lane"><header><p className="workflow-kicker">{lane.title}</p><strong>{records.length}</strong><p>{lane.hint}</p></header>{records.length ? records.map(record => <Link key={record.id} href={"/compliance/assessments/"+record.id}><span>{statusLabels[record.status]}</span><h2>{record.frameworkName || "Assessment"}</h2><p>{record.branchName || "Framework scope"}</p><small>{formatDate(record.assessmentPeriodStart)} → {formatDate(record.assessmentPeriodEnd)}</small><dl><div><dt>Compliance</dt><dd>{record.summary?.compliancePercentage == null ? "Not scored" : record.summary.compliancePercentage.toFixed(1)+"%"}</dd></div><div><dt>Requirements met</dt><dd>{record.summary ? (record.summary.compliantRequirements ?? "—")+" / "+(record.summary.totalRequirements ?? "—") : "Not reported"}</dd></div><div><dt>Critical findings</dt><dd>{record.summary?.criticalFindings ?? "Not reported"}</dd></div></dl><b>Open review ↗</b></Link>) : <p className="workflow-empty">No reviews in this state.</p>}</section>;
      })}</div>}
    </div>
  );
}
