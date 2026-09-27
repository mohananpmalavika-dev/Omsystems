"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, FileCheck2 } from "lucide-react";

type Chapter = { title: string; description: string; content: ReactNode };
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function RecordComposer({ chapters, footer, notices, onSubmit, busy = false }: {
  chapters: Chapter[]; footer: ReactNode; notices?: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>; busy?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [step, setStep] = useState(0);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [review, setReview] = useState<{ title: string; fields: { label: string; value: string }[] }[]>([]);
  const fields = (index: number) => Array.from(form.current?.querySelectorAll<Field>(`[data-chapter="${index}"] input, [data-chapter="${index}"] select, [data-chapter="${index}"] textarea`) ?? []);
  const validate = (indexes: number[]) => {
    for (const index of indexes) {
      const invalid = fields(index).find(field => !field.disabled && !field.checkValidity());
      if (invalid) {
        setStep(index);
        const label = invalid.closest("label")?.cloneNode(true) as HTMLElement | undefined;
        label?.querySelectorAll("input, select, textarea, em").forEach(node => node.remove());
        setValidationMessage(`${label?.textContent?.trim() || "This field"}: ${invalid.validationMessage}`);
        requestAnimationFrame(() => invalid.focus());
        return false;
      }
    }
    setValidationMessage(null);
    return true;
  };
  const navigate = (next: number) => {
    if (!ready || busy || (next > step && !validate(Array.from({ length: next }, (_, i) => i)))) return;
    if (next === chapters.length) setReview(chapters.map((chapter, index) => ({ title: chapter.title, fields: fields(index).filter(field => field.type !== "hidden" && field.type !== "password").map(field => {
      const label = field.closest("label")?.cloneNode(true) as HTMLElement | undefined;
      label?.querySelectorAll("input, select, textarea, em").forEach(node => node.remove());
      const value = field instanceof HTMLSelectElement ? field.selectedOptions[0]?.text ?? "" : field instanceof HTMLInputElement && field.type === "checkbox" ? field.checked ? "Yes" : "No" : field.value;
      return { label: label?.textContent?.trim() || field.name || "Field", value: value || "Not provided" };
    }) })));
    setStep(next);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (busy) { event.preventDefault(); return; }
    if (step < chapters.length) { event.preventDefault(); navigate(step + 1); return; }
    if (!validate(chapters.map((_, i) => i))) { event.preventDefault(); return; }
    void onSubmit(event);
  };
  return <form ref={form} className="record-composer" aria-busy={!ready || busy} noValidate onSubmit={submit} onChangeCapture={() => setValidationMessage(null)}>
    <nav className="composer-route" aria-label="Record creation stages">
      <p className="workflow-kicker">BUILD THE RECORD</p>
      {[...chapters.map(chapter => chapter.title), "Review & create"].map((title, index) => <button key={title} type="button" disabled={!ready || busy} aria-current={index === step ? "step" : undefined} onClick={() => navigate(index)}>
        <span>{index < step ? <Check size={14} /> : String(index + 1).padStart(2, "0")}</span><strong>{title}</strong><ArrowRight size={15} />
      </button>)}
      <small>Your entries stay here as you move between stages. The record is saved when you create it.</small>
    </nav>
    <div className="composer-canvas">
      {chapters.map((chapter, index) => <section key={chapter.title} data-chapter={index} hidden={step !== index}>
        <header><p className="workflow-kicker">STAGE {String(index + 1).padStart(2, "0")}</p><h2>{chapter.title}</h2><p>{chapter.description}</p></header>
        <div className="composer-fields">{chapter.content}</div>
      </section>)}
      {step === chapters.length && <section className="composer-review"><header><FileCheck2 size={26} /><h2>Ready for the record?</h2><p>Check the details before creating. You can return to any stage to make changes.</p></header>
        {review.map((chapter, index) => <article key={chapter.title}><header><h3>{chapter.title}</h3><button type="button" disabled={busy} onClick={() => navigate(index)}>Edit</button></header><dl>{chapter.fields.map((field, i) => <div key={i}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></article>)}
      </section>}
      {validationMessage && <p role="alert" className="work-order-form-error">{validationMessage}</p>}
      {notices && <div className="composer-notices" role="status">{notices}</div>}
      <div className="composer-actions"><button type="button" className="btn-secondary" disabled={!ready || step === 0 || busy} onClick={() => navigate(step - 1)}><ArrowLeft size={15} />Back</button>
        {step < chapters.length ? <button type="button" className="btn-primary" disabled={!ready || busy} onClick={() => navigate(step + 1)}>{step === chapters.length - 1 ? "Review record" : "Continue"}<ArrowRight size={15} /></button> : <div className="composer-submit">{footer}</div>}
      </div>
    </div>
  </form>;
}
