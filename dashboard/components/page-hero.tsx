import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: ReactNode;
  tone?: "navy" | "light";
};

export function PageHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
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
      {actions && <div className="page-hero-actions">{actions}</div>}
    </header>
  );
}
