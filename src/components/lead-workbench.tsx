"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { LeadCompany, LeadMatch, LeadSearchResult, UploadedDocumentEvidence } from "@/lib/leads/types";

type RuntimeStatus = {
  aiReady: boolean;
  embeddingModel: string;
  model: string;
  ragReady: boolean;
  supabaseReady: boolean;
};

type UploadRun = {
  id: string;
  created_at: string;
  status: "processing" | "completed" | "failed";
  file_name: string;
  content_type: string | null;
  file_size: number | null;
  project_title: string | null;
  project_summary: string | null;
  chunk_count: number;
  company_count: number;
  error_message: string | null;
};

type UploadStats = {
  chunks: number;
  companies: number;
};

const defaultRequest =
  "Find shipping companies with regulatory pressure, ownership change, leadership change, financial stress, or technology transformation needs where KPMG has a strong advisory fit.";

export function LeadWorkbench({ status }: { status: RuntimeStatus }) {
  const [request, setRequest] = useState(defaultRequest);
  const [result, setResult] = useState<LeadSearchResult | null>(null);
  const [companies, setCompanies] = useState<LeadCompany[]>([]);
  const [runs, setRuns] = useState<UploadRun[]>([]);
  const [stats, setStats] = useState<UploadStats>({ chunks: 0, companies: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSearch = useMemo(() => request.trim().length >= 8 && !isSearching && status.ragReady, [
    isSearching,
    request,
    status.ragReady,
  ]);

  async function refreshKnowledge() {
    await Promise.all([loadCompanies(), loadUploads()]);
  }

  async function loadCompanies() {
    if (!status.supabaseReady) return;

    try {
      const response = await fetch("/api/companies");
      const payload = (await response.json()) as { companies?: LeadCompany[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load companies.");
      setCompanies(payload.companies || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load companies.");
    }
  }

  async function loadUploads() {
    if (!status.supabaseReady) return;

    try {
      const response = await fetch("/api/uploads");
      const payload = (await response.json()) as { runs?: UploadRun[]; stats?: UploadStats; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load uploads.");
      setRuns(payload.runs || []);
      setStats(payload.stats || { chunks: 0, companies: 0 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load uploads.");
    }
  }

  useEffect(() => {
    void refreshKnowledge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function searchLeads(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSearch) return;

    setIsSearching(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/leads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, matchCount: 8, matchThreshold: 0.22 }),
      });
      const payload = (await response.json()) as { result?: LeadSearchResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Lead search failed.");
      setResult(payload.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lead search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (!selected.length || isUploading) return;

    setIsUploading(true);
    setError(null);
    setMessage(`Uploading ${selected.length} file${selected.length === 1 ? "" : "s"}...`);

    try {
      for (const file of selected) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as {
          error?: string;
          run?: { chunks: number; companies: number; fileName: string };
        };
        if (!response.ok || !payload.run) throw new Error(payload.error || `Upload failed for ${file.name}.`);
        setMessage(`${payload.run.fileName} indexed: ${payload.run.chunks} chunks, ${payload.run.companies} companies.`);
      }

      await refreshKnowledge();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void uploadFiles(event.dataTransfer.files);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void uploadFiles(event.target.files);
  }

  const displayedMatches = result?.matches.length ? result.matches : companies;
  const uploadedEvidence = result?.uploadedDocuments || [];

  return (
    <div className="grid flex-1 gap-5 py-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-h-[760px] flex-col rounded-md border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Lead search</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                Ask for a target profile. Results are grounded in uploaded project documents, KPMG corpus records, and structured company summaries.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Metric label="Companies" value={stats.companies || companies.length} />
              <Metric label="Chunks" value={stats.chunks} />
              <Metric label="Uploads" value={runs.length} />
            </div>
          </div>
        </div>

        <form onSubmit={searchLeads} className="border-b border-[var(--line)] p-4">
          <label className="block text-sm font-medium text-[var(--muted)]">
            Request
            <textarea
              required
              rows={4}
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              className="mt-1 w-full resize-y rounded-md border border-[var(--line)] bg-white p-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-5 text-sm">
              {message ? <span className="text-[var(--accent)]">{message}</span> : null}
              {error ? <span className="text-[var(--warning)]">{error}</span> : null}
              {!message && !error ? <span className="text-[var(--muted)]">Search across saved project knowledge</span> : null}
            </div>
            <button
              type="submit"
              disabled={!canSearch}
              className="h-10 rounded-md bg-[var(--foreground)] px-5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSearching ? "Searching..." : "Find leads"}
            </button>
          </div>
        </form>

        <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-96 rounded-md border border-[var(--line)] p-4">
            {result ? (
              <div>
                <div className="mb-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <Badge>{result.model}</Badge>
                  <Badge>{result.embeddingModel}</Badge>
                  <Badge>{`${result.matches.length} companies`}</Badge>
                  <Badge>{`${(result.documents?.length || 0) + uploadedEvidence.length} evidence records`}</Badge>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-7">{result.answer}</div>
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center text-sm text-[var(--muted)]">
                <p className="max-w-md">
                  Upload prior project files or use the existing corpus, then describe the lead profile KPMG wants to find.
                </p>
              </div>
            )}
          </div>

          <aside>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Ranked leads</h3>
              <button
                type="button"
                disabled={!status.supabaseReady}
                onClick={() => void refreshKnowledge()}
                className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-medium text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {displayedMatches.slice(0, 7).map((company) => (
                <CompanyCard key={company.id} company={company} />
              ))}
            </div>
          </aside>
        </div>

        {result ? (
          <div className="border-t border-[var(--line)] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Source evidence</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {uploadedEvidence.slice(0, 4).map((item) => (
                <EvidenceCard key={item.id} item={item} />
              ))}
              {(result.documents || []).slice(0, Math.max(0, 4 - uploadedEvidence.length)).map((item) => (
                <article key={item.id} className="rounded-md border border-[var(--line)] p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-semibold">{item.company_name || item.doc_type}</h4>
                    <span className="text-xs text-[var(--accent)]">{Math.round(item.similarity * 100)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">{[item.doc_type, item.trigger_name].filter(Boolean).join(" / ")}</p>
                  <p className="mt-2 line-clamp-4 text-[var(--muted)]">{item.content}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <aside className="space-y-5">
        <section className="rounded-md border border-[var(--line)] bg-[var(--panel)]">
          <div className="border-b border-[var(--line)] p-4">
            <h2 className="text-lg font-semibold">Knowledge intake</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Drop previous project files here. The app stores originals, extracts reusable lead knowledge, and embeds the evidence.
            </p>
          </div>
          <div className="p-4">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={[
                "grid min-h-44 place-items-center rounded-md border border-dashed p-5 text-center transition",
                isDragging ? "border-[var(--accent)] bg-[#ecfdf5]" : "border-[var(--line)] bg-[#fafafa]",
              ].join(" ")}
            >
              <div>
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-lg">
                  ↑
                </div>
                <p className="mt-3 text-sm font-medium">{isUploading ? "Indexing..." : "Drop files to index"}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">PDF, DOCX, PPTX, XLSX, CSV, TXT, MD up to 12 MB</p>
                <button
                  type="button"
                  disabled={isUploading || !status.ragReady}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 h-9 rounded-md border border-[var(--accent)] px-4 text-sm font-medium text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Choose files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,text/plain,text/csv,application/pdf"
                  onChange={handleInputChange}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-[var(--line)] bg-[var(--panel)]">
          <div className="border-b border-[var(--line)] p-4">
            <h2 className="text-lg font-semibold">Recent uploads</h2>
          </div>
          <div className="space-y-3 p-4">
            {runs.length ? (
              runs.map((run) => (
                <article key={run.id} className="rounded-md border border-[var(--line)] p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium">{run.file_name}</h3>
                    <StatusBadge status={run.status} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {run.chunk_count} chunks / {run.company_count} companies
                  </p>
                  {run.project_summary ? <p className="mt-2 line-clamp-3 text-[var(--muted)]">{run.project_summary}</p> : null}
                  {run.error_message ? <p className="mt-2 text-[var(--warning)]">{run.error_message}</p> : null}
                </article>
              ))
            ) : (
              <p className="text-sm text-[var(--muted)]">No uploaded project files yet.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-right">
      <div className="font-semibold">{value}</div>
      <div className="text-[var(--muted)]">{label}</div>
    </div>
  );
}

function CompanyCard({ company }: { company: LeadCompany | LeadMatch }) {
  return (
    <article className="rounded-md border border-[var(--line)] p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold">{company.name}</h4>
        {hasSimilarity(company) ? <span className="text-xs text-[var(--accent)]">{Math.round(company.similarity * 100)}%</span> : null}
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">{[company.industry, company.region].filter(Boolean).join(" / ")}</p>
      <p className="mt-2 line-clamp-4 text-[var(--muted)]">{company.description}</p>
      {company.services_fit.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {company.services_fit.slice(0, 3).map((service) => (
            <Badge key={service}>{service}</Badge>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function EvidenceCard({ item }: { item: UploadedDocumentEvidence }) {
  return (
    <article className="rounded-md border border-[var(--line)] p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold">{item.file_name}</h4>
        <span className="text-xs text-[var(--accent)]">{Math.round(item.similarity * 100)}%</span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Chunk {item.chunk_index}
        {typeof item.metadata.section === "string" ? ` / ${item.metadata.section}` : ""}
      </p>
      <p className="mt-2 line-clamp-4 text-[var(--muted)]">{item.content}</p>
    </article>
  );
}

function StatusBadge({ status }: { status: UploadRun["status"] }) {
  const label = status === "completed" ? "Indexed" : status === "processing" ? "Processing" : "Failed";
  return (
    <span className={status === "failed" ? "text-xs text-[var(--warning)]" : "text-xs text-[var(--accent)]"}>
      {label}
    </span>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)]">{children}</span>;
}

function hasSimilarity(company: LeadCompany | LeadMatch): company is LeadMatch {
  return "similarity" in company && typeof company.similarity === "number";
}
