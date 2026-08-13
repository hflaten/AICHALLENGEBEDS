import { LeadWorkbench } from "@/components/lead-workbench";
import { getServerConfigStatus } from "@/lib/config";

export default function Home() {
  const status = getServerConfigStatus();

  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
              KPMG consultancy
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-5xl">
              Lead generator
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Store target companies, embed their account context, and use RAG to
              retrieve prospects that match a consultancy opportunity request.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <StatusPill label="OpenAI" ready={status.aiReady} />
            <StatusPill label="Supabase" ready={status.supabaseReady} />
            <StatusPill label="RAG" ready={status.ragReady} />
          </div>
        </header>

        <LeadWorkbench status={status} />

        <footer className="grid gap-3 border-t border-[var(--line)] py-4 text-sm text-[var(--muted)] sm:grid-cols-3">
          <RuntimeRow label="Model" value={status.model} />
          <RuntimeRow label="Embeddings" value={status.embeddingModel} />
          <RuntimeRow label="Database" value={status.supabaseReady ? "connected" : "env needed"} />
        </footer>
      </div>
    </main>
  );
}

function StatusPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={ready ? "font-medium text-[var(--accent)]" : "font-medium text-[var(--warning)]"}>
        {ready ? "Ready" : "Needs env"}
      </div>
    </div>
  );
}

function RuntimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
