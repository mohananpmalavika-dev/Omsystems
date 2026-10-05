"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import styles from "./scope-multi-select.module.css";

interface Props {
  id: string;
  label: string;
  plural: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (values: string[]) => void;
}

export function ScopeMultiSelect({ id, label, plural, options, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const summary = !value.length ? `All ${plural} (${options.length})` : value.length === 1
    ? options.find(option => option.value === value[0])?.label ?? `1 ${label.toLowerCase()} selected`
    : `${value.length} ${plural.toLowerCase()} selected`;
  const visible = options.filter(option => option.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div ref={root} className={styles.root} onKeyDown={event => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <button ref={trigger} id={id} type="button" className={styles.trigger} aria-label={label} aria-expanded={open}
        aria-controls={`${id}-options`} onClick={() => { setOpen(!open); setQuery(""); }}>
        <span>{summary}</span><ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && <div id={`${id}-options`} className={styles.panel} role="group" aria-label={`Select ${plural.toLowerCase()}`}>
        <div className={styles.search}><Search size={14} aria-hidden="true" /><input autoFocus aria-label={`Search ${plural.toLowerCase()}`} placeholder={`Search ${plural.toLowerCase()}…`} value={query} onChange={event => setQuery(event.target.value)} /></div>
        <label className={styles.option}><input type="checkbox" checked={!value.length} onChange={() => onChange([])} />All {plural} ({options.length})</label>
        <div className={styles.options}>
          {visible.map(option => <label key={option.value} className={styles.option}>
            <input type="checkbox" checked={value.includes(option.value)} onChange={() => onChange(value.includes(option.value) ? value.filter(item => item !== option.value) : [...value, option.value])} />
            <span>{option.label}</span>
          </label>)}
          {!visible.length && <p className={styles.empty}>No {plural.toLowerCase()} found</p>}
        </div>
        <div className={styles.footer}><span>{value.length ? `${value.length} selected` : "All selected"}</span><button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }}>Done</button></div>
      </div>}
    </div>
  );
}
