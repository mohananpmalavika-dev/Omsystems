import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  tone?: "navy" | "light";
};

export function PageHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  backHref = "/",
  backLabel = "Back to workspace",
  tone = "navy",
}: PageHeroProps) {
  return (
    <header className={`page-hero page-hero-${tone}`}>
      <div className="page-hero-copy">
        <span className="page-hero-icon"><Icon size={23} /></span>
        <div>
          <p className="page-hero-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="page-hero-description">{description}</p>
        </div>
      </div>
      <div className="page-hero-actions">
        <Link href={backHref} className="page-hero-back">
          <ArrowLeft size={16} />
          <span>{backLabel}</span>
        </Link>
        {actions}
      </div>
    </header>
  );
}
