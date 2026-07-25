import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowRight, LoaderCircle, Plus } from "lucide-react";

type ModulePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actionHref?: string;
  actionLabel?: string;
  count?: number;
  countLabel?: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  children: ReactNode;
};

export function ModulePage({
  eyebrow,
  title,
  description,
  icon: Icon,
  actionHref,
  actionLabel,
  count,
  countLabel = "records",
  loading = false,
  error,
  empty = false,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Create the first record to start tracking this part of your operation.",
  children,
}: ModulePageProps) {
  return (
    <div className="module-page">
      <header className="module-hero">
        <div className="module-hero-copy">
          <div className="module-icon"><Icon size={21} /></div>
          <div>
            <p className="module-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="module-description">{description}</p>
          </div>
        </div>
        <div className="module-hero-actions">
          {typeof count === "number" && (
            <div className="module-count">
              <strong>{count}</strong>
              <span>{count === 1 ? countLabel.replace(/s$/, "") : countLabel}</span>
            </div>
          )}
          {actionHref && actionLabel && (
            <Link href={actionHref} className="primary-button module-primary-action">
              <Plus size={16} />
              {actionLabel}
            </Link>
          )}
        </div>
      </header>

      {error && (
        <div className="module-alert" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Data could not be refreshed</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      <section className="module-panel">
        {loading ? (
          <div className="module-state">
            <LoaderCircle className="module-spinner" size={25} />
            <strong>Loading operational data</strong>
            <span>Connecting to the control plane&hellip;</span>
          </div>
        ) : empty ? (
          <div className="module-state module-empty-state">
            <div className="module-empty-icon"><Icon size={24} /></div>
            <strong>{emptyTitle}</strong>
            <span>{emptyDescription}</span>
            {actionHref && actionLabel && (
              <Link href={actionHref}>
                {actionLabel} <ArrowRight size={14} />
              </Link>
            )}
          </div>
        ) : (
          children
        )}
      </section>
    </div>
  );
}

export function ModuleStatus({ value }: { value?: string | null }) {
  const normalized = (value || "unknown").toLowerCase().replace(/[\s_]+/g, "-");
  const positive = ["active", "operational", "online", "completed", "healthy"];
  const caution = ["degraded", "pending", "open", "medium", "maintenance-due"];
  const negative = ["offline", "critical", "failed", "expired", "retired"];
  const tone = positive.includes(normalized)
    ? "positive"
    : caution.includes(normalized)
      ? "caution"
      : negative.includes(normalized)
        ? "negative"
        : "neutral";

  return <span className={`module-status ${tone}`}><i />{value || "Unknown"}</span>;
}
