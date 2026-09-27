'use client';

import { InspectionDesk } from "@/components/inspection-desk";
import { WorkflowNav } from "@/components/workflow-nav";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, Plus, Search, Filter, CheckCircle, XCircle, Clock } from 'lucide-react';

interface Requirement {
  id: string;
  frameworkId: string;
  requirementCode: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  isMandatory: boolean;
  status: 'active' | 'draft' | 'deprecated';
  controlCount?: number;
  implementationStatus?: string;
  createdAt: string;
}

export default function RequirementsPage() {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchRequirements();
  }, []);

  const fetchRequirements = async () => {
    try {
      const response = await fetch('/api/compliance/requirements');
      if (!response.ok) throw new Error("Unable to load requirements.");
      const data = await response.json();
      setRequirements((data.data || []).map((item: any) => ({
        ...item,
        requirementCode: item.requirementCode ?? item.requirementNumber ?? item.code ?? item.id?.slice(0, 8) ?? 'REQ',
        title: item.title ?? item.requirementTitle ?? 'Untitled requirement',
        description: item.description ?? '',
        category: item.category ?? 'Uncategorized',
        subcategory: item.subcategory ?? '',
        isMandatory: item.isMandatory ?? item.mandatory ?? false,
        status: ['active', 'draft', 'deprecated'].includes(item.status) ? item.status : 'active',
      })));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Requirements unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRequirements = requirements.filter(req => {
    const matchesSearch = 
      req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.requirementCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || req.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const categories = Array.from(new Set(requirements.map(r => r.category)));

  return <main className="obligation-library-page page-container"><header className="workflow-heading"><div><p className="workflow-kicker">ASSURANCE / OBLIGATION LIBRARY</p><h1>Know what must hold.</h1><p>Choose an obligation family. Read its scope and implementation context before working on the requirement.</p></div><Link className="btn-primary" href="/compliance/requirements/new"><Plus size={16} />Add requirement</Link></header>
    {error && <p role="alert" className="work-order-form-error">{error}</p>}
    <div className="obligation-library"><nav className="obligation-categories" aria-label="Requirement categories"><p className="workflow-kicker">OBLIGATION FAMILIES</p>{["all",...categories].map(category => <button key={category} type="button" aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)}><strong>{category === "all" ? "Every obligation" : category}</strong><span>{error || loading ? "—" : requirements.filter(record => category === "all" || record.category === category).length}</span></button>)}</nav>
      <div className="obligation-records"><div className="assurance-scope"><label className="task-search"><Search size={16} /><input aria-label="Search requirements" placeholder="Search code, title or scope" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /></label><WorkflowNav label="Requirement lifecycle" value={statusFilter} onChange={setStatusFilter} items={[{id:"all",label:"All"},{id:"active",label:"Active"},{id:"draft",label:"Draft"},{id:"deprecated",label:"Deprecated"}]} /></div>
        <InspectionDesk label="Obligations" emptyMessage={loading ? "Loading obligations…" : error ? "The obligation library is unavailable." : "No obligations match this scope."} records={filteredRequirements.map(record => ({id:record.id,title:record.title,subtitle:record.requirementCode,status:record.status,description:record.description,fields:[{label:"Category",value:record.category},{label:"Mandatory",value:record.isMandatory ? "Yes" : "No"},{label:"Linked controls",value:record.controlCount ?? "Not reported"},{label:"Implementation",value:record.implementationStatus || "Not reported"},{label:"Subcategory",value:record.subcategory || "Not recorded"}],href:"/compliance/requirements/"+record.id,actionLabel:"Work on obligation"}))} /></div>
    </div>
  </main>;
}
