import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "./workstream-focus.module.css";

export type WorkstreamFocusItem = {
  key: string;
  title: string;
  detail: string;
  meta: string;
  action: string;
  tone?: "critical" | "warning" | "neutral";
  href?: string;
  onClick?: () => void;
};

export function WorkstreamFocus({
  eyebrow,
  title,
  description,
  items,
  emptyMessage,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: WorkstreamFocusItem[];
  emptyMessage: string;
}) {
  return (
    <section className={styles.section} aria-label={title}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}><span aria-hidden="true" />{eyebrow}</p>
          <h2>{title}</h2>
          <p className={styles.description}>{description}</p>
        </div>
        <span className={styles.count}>{items.length} {items.length === 1 ? "item" : "items"}</span>
      </header>
      {items.length === 0 ? <p className={styles.empty}>{emptyMessage}</p> : (
        <div className={styles.grid}>
          {items.map((item) => {
            const content = <>
              <span className={`${styles.meta} ${styles[item.tone ?? "neutral"]}`}>{item.meta}</span>
              <strong>{item.title}</strong>
              <span className={styles.detail}>{item.detail}</span>
              <span className={styles.action}>{item.action}<ArrowUpRight size={15} aria-hidden="true" /></span>
            </>;
            return item.href ? (
              <Link key={item.key} href={item.href} className={styles.card}>{content}</Link>
            ) : (
              <button key={item.key} type="button" onClick={item.onClick} className={styles.card}>{content}</button>
            );
          })}
        </div>
      )}
    </section>
  );
}
