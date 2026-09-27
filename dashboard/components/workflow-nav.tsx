"use client";

type WorkflowNavProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { id: string; label: string; count?: number }[];
};

export function WorkflowNav({ label, value, onChange, items }: WorkflowNavProps) {
  return <nav className="workflow-nav" aria-label={label}>
    {items.map(item => <button key={item.id} type="button" aria-pressed={value === item.id} onClick={() => onChange(item.id)}>
      {item.label}{item.count !== undefined && <span>{item.count}</span>}
    </button>)}
  </nav>;
}
