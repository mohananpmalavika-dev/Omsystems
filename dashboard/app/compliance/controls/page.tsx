'use client';

import { InspectionDesk } from "@/components/inspection-desk";
import { WorkflowNav } from "@/components/workflow-nav";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, Search, CheckCircle2, XCircle, Clock, AlertCircle, FileText } from 'lucide-react';
import { PageHero } from '@/components/page-hero';
import { ComplianceHubNav } from '@/components/compliance/compliance-hub-nav';

interface Control {
  id: string;
  requirementId: string;
  controlCode: string;
  title: string;
  description: string;
  controlType: 'preventive' | 'detective' | 'corrective' | 'deterrent';
  implementationStatus: 'not_implemented' | 'in_progress' | 'implemented' | 'verified';
  effectiveness: 'effective' | 'partially_effective' | 'ineffective' | 'not_tested';
  testFrequency: string;
  lastTestDate?: string;
  nextTestDate?: string;
  owner?: string;
  evidenceCount?: number;
}

export default function ControlsPage() {
  const [controls, setControls] = useState<Control[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchControls();
  }, []);

  const fetchControls = async () => {
    try {
      const response = await fetch('/api/compliance/controls');
      if (!response.ok) throw new Error("Unable to load controls.");
      const data = await response.json();
      setControls((data.data || []).map((item: any) => ({
        ...item,
        controlCode: item.controlCode ?? item.controlNumber ?? item.id?.slice(0, 8) ?? 'CTRL',
        title: item.title ?? item.controlName ?? 'Untitled control',
        description: item.description ?? item.controlDescription ?? '',
        controlType: ['preventive', 'detective', 'corrective', 'deterrent'].includes(item.controlType) ? item.controlType : 'preventive',
        implementationStatus: normalizeImplementationStatus(item.implementationStatus),
        effectiveness: normalizeEffectiveness(item.effectiveness ?? item.effectivenessRating),
        testFrequency: item.testFrequency ?? item.testingFrequency ?? '',
      })));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Controls unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const filteredControls = controls.filter(control => {
    const matchesSearch = 
      control.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      control.controlCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      control.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === 'all' || control.controlType === typeFilter;
    const matchesStatus = statusFilter === 'all' || control.implementationStatus === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const lanes = [{id:"all",label:"All safeguards"},{id:"not_implemented",label:"To implement"},{id:"in_progress",label:"In progress"},{id:"implemented",label:"To verify"},{id:"verified",label:"Verified"}];
  const priority: Record<string, number> = { not_implemented: 0, in_progress: 1, implemented: 2, verified: 3 };
  const ordered = [...filteredControls].sort((a,b) => priority[a.implementationStatus] - priority[b.implementationStatus]);
  return <main className="assurance-review-page page-container"><header className="workflow-heading"><div><p className="workflow-kicker">ASSURANCE / SAFEGUARD REVIEW</p><h1>Close the control gap.</h1><p>Move from implementation scope to a safeguard brief. Review ownership, testing and evidence before opening its full record.</p></div><Link href="/compliance/requirements" className="btn-secondary">Review requirements</Link></header><ComplianceHubNav />
    <div className="inspection-toolbar"><WorkflowNav label="Implementation lanes" value={statusFilter} onChange={setStatusFilter} items={lanes.map(lane => ({...lane,count:error || loading ? undefined : controls.filter(control => lane.id === "all" || control.implementationStatus === lane.id).length}))} /></div>
    <div className="assurance-scope"><label className="task-search"><Search size={16} /><input aria-label="Search controls" placeholder="Search safeguard, code or description" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /></label><label>Control type<select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">All types</option>{["preventive","detective","corrective","deterrent"].map(type => <option key={type} value={type}>{type}</option>)}</select></label></div>
    {error && <p role="alert" className="work-order-form-error">{error}</p>}
    <InspectionDesk label="Safeguard review queue" emptyMessage={loading ? "Loading safeguards…" : error ? "The safeguard register is unavailable." : "No safeguards match these filters."} records={ordered.map(control => ({id:control.id,title:control.title,subtitle:control.controlCode + " · " + control.controlType,status:control.implementationStatus,description:control.description,fields:[{label:"Owner",value:control.owner || "Unassigned"},{label:"Effectiveness",value:control.effectiveness.replaceAll("_"," ")},{label:"Test cadence",value:control.testFrequency || "Not recorded"},{label:"Last tested",value:control.lastTestDate ? new Date(control.lastTestDate).toLocaleDateString() : "Not tested"},{label:"Next test",value:control.nextTestDate ? new Date(control.nextTestDate).toLocaleDateString() : "Not scheduled"},{label:"Evidence",value:control.evidenceCount ?? "Not reported"}],href:"/compliance/controls/"+control.id,actionLabel:control.implementationStatus === "implemented" ? "Review verification" : "Open safeguard"}))} />
  </main>;
}

function normalizeImplementationStatus(value: unknown): Control['implementationStatus'] {
  if (value === 'in_progress' || value === 'implemented' || value === 'verified') return value;
  return 'not_implemented';
}

function normalizeEffectiveness(value: unknown): Control['effectiveness'] {
  if (value === 'effective' || value === 'partially_effective' || value === 'ineffective' || value === 'not_tested') return value;
  if (typeof value === 'number') {
    if (value >= 4) return 'effective';
    if (value >= 2) return 'partially_effective';
    if (value > 0) return 'ineffective';
  }
  return 'not_tested';
}
