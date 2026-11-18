import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">StockPulse</h1>
        <p className="mt-2 text-slate-600">
          Inventory and stock ledger for retail teams.
        </p>
      </div>
      <Link
        href="/api/health"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        API health check
      </Link>
    </main>
  );
}