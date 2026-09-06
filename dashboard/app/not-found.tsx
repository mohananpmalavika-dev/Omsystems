import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto my-12 max-w-lg rounded-2xl border border-slate-300 bg-white p-8 text-center text-slate-900">
      <p className="text-sm font-semibold text-slate-500">404</p>
      <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
      <p className="mt-3 text-sm text-slate-600">This link may have moved. Use the module search or return to the Command Center.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Open Command Center</Link>
    </section>
  );
}
