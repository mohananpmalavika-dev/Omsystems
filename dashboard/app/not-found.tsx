import Link from "next/link";
import { Search } from "lucide-react";
export default function NotFound() {
  return (
    <section className="workspace-state">
      <span className="workspace-state-icon"><Search size={26} /></span>
      <p className="eyebrow-label">Page not found</p>
      <h1>Let's get you back to work</h1>
      <p>This page may have moved, or the address may be incorrect. Find the feature you need in the workspace directory.</p>
      <div className="workspace-state-actions">
        <Link href="/modules" className="ui-button ui-button-primary">Browse workspace</Link>
        <Link href="/" className="ui-button ui-button-outline">Go to overview</Link>
      </div>
    </section>
  );
}
