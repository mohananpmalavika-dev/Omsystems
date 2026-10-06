"use client";
import { useState } from 'react';
import { validReportDay } from '../../../packages/contracts/src/report-hierarchy';

export type ReportDateRange = { startDate?: string; endDate?: string };
export function ReportDateControls({ range, onGenerate }: { range: ReportDateRange; onGenerate: (range: ReportDateRange) => void }) {
  const [start, setStart] = useState(range.startDate ?? '');
  const [end, setEnd] = useState(range.endDate ?? '');
  const [error, setError] = useState('');
  return <section className="card flex flex-wrap items-end gap-3 print:hidden" aria-label="Report period">
    <label className="text-xs">From date (IST)<input type="date" aria-label="Report start date" className="input block mt-1" value={start} onChange={event=>setStart(event.target.value)}/></label>
    <label className="text-xs">To date (IST)<input type="date" aria-label="Report end date" className="input block mt-1" min={start} value={end} onChange={event=>setEnd(event.target.value)}/></label>
    <button className="btn-primary" onClick={()=>{if(!validReportDay(start)||!validReportDay(end)||start>end){setError('Select valid dates in order.');return;}setError('');onGenerate({startDate:start,endDate:end});}}>Generate report</button>
    <button className="btn-secondary" onClick={()=>{setStart('');setEnd('');setError('');onGenerate({});}}>Use preset period</button>
    <span className="text-xs text-slate-500">{range.startDate ? `${range.startDate} – ${range.endDate} · IST` : 'Preset period · choose the same date for a daily report'}</span>
    {error && <span role="alert" className="text-xs text-red-500">{error}</span>}
  </section>;
}
