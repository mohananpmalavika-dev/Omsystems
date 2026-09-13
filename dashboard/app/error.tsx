"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
    <section
      role="alert"
      className="mx-auto my-12 max-w-lg rounded-2xl border border-slate-300 bg-white p-8 text-center text-slate-900 shadow-sm"
    >
      <h1 className="text-xl font-semibold">
        {isChunkError ? "Application Updated" : "This page could not be loaded"}
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        {isChunkError
          ? "A new version of the system is available. Reloading to get the latest update..."
          : "Try again, or return to the Command Center to continue working."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => (isChunkError ? window.location.reload() : reset())}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
        >
          {isChunkError ? "Reload Now" : "Try again"}
        </button>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 transition"
        >
          Command Center
        </Link>
      </div>
    </section>
  );
}
