"use client";

export function ReportPagination({ total, page, pageSize, onPage, onPageSize }: {
  total: number; page: number; pageSize: number; onPage: (page: number) => void; onPageSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  return <nav aria-label="Report pagination" className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs print:hidden">
    <span>{total ? (current - 1) * pageSize + 1 : 0}–{Math.min(current * pageSize, total)} of {total.toLocaleString()} rows</span>
    <div className="flex items-center gap-3">
      <label>Rows per page <select aria-label="Rows per page" className="input ml-2" value={pageSize} onChange={event => { onPageSize(Number(event.target.value)); onPage(1); }}>{[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
      <button type="button" className="btn-secondary" disabled={current <= 1} onClick={() => onPage(current - 1)}>Previous</button>
      <span>Page {current} / {pages}</span>
      <button type="button" className="btn-secondary" disabled={current >= pages} onClick={() => onPage(current + 1)}>Next</button>
    </div>
  </nav>;
}
