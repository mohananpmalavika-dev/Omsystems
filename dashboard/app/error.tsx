"use client";

import Link from "next/link";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section role="alert" className="mx-auto my-12 max-w-lg rounded-2xl border border-slate-300 bg-white p-8 text-center text-slate-900 shadow-sm">
      <h1 className="text-xl font-semibold">This page could not be loaded</h1>
      <p className="mt-3 text-sm text-slate-600">Try again, or return to the Command Center to continue working.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Try again</button>
        <Link href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Command Center</Link>
      </div>
    </section>
  );
}
