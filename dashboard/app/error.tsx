"use client";
import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunkError =
    error?.name === "ChunkLoadError" ||
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
      error?.message || ""
    );

  useEffect(() => {
    if (isChunkError) {
      const guardKey = "sentinel_chunk_reload_guard";
      const lastReload = sessionStorage.getItem(guardKey);
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 20000) {
        sessionStorage.setItem(guardKey, String(now));
        console.warn("[WorkspaceError] Chunk error caught in Error Boundary, refreshing app...");
        window.location.reload();
      }
    }
  }, [isChunkError]);

  return (
    <section className="workspace-state" role="alert">
      <span className="workspace-state-icon"><AlertTriangle size={26} /></span>
      <h1>We couldn't load this page</h1>
      <p>Try again, or return to your overview to continue working.</p>
      <div className="workspace-state-actions">
        <button type="button" className="ui-button ui-button-primary" onClick={() => isChunkError ? window.location.reload() : reset()}><RefreshCw size={16} /> Try again</button>
        <Link href="/" className="ui-button ui-button-outline">Go to overview</Link>
      </div>
    </section>
  );
}
