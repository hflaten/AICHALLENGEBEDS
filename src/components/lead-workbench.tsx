"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LeadCompany, LeadMatch, LeadSearchResult, RagDocumentEvidence, UploadedDocumentEvidence } from "@/lib/leads/types";

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

  const uploadedEvidence = result?.uploadedDocuments || [];
  const corpusEvidence = result?.documents || [];
  const evidenceCount = uploadedEvidence.length + corpusEvidence.length;

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

        <div className="flex-1 p-4">
          {result ? (
            <div className="space-y-4">
              <section className="rounded-md border border-[var(--line)] bg-[#fbfcfd] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">AI brief</p>
                    <h3 className="mt-1 text-xl font-semibold">Lead recommendations</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{result.model}</Badge>
                    <Badge>{result.embeddingModel}</Badge>
                    <Badge>{`${result.matches.length} companies`}</Badge>
                    <Badge>{`${evidenceCount} evidence records`}</Badge>
                  </div>
                </div>
                <AnswerBrief answer={result.answer} />
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Recommended companies</h3>
                  <button
                    type="button"
                    disabled={!status.supabaseReady}
                    onClick={() => void refreshKnowledge()}
                    className="rounded-md border border-[var(--line)] px-3 py-2 text-sm font-medium text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Refresh
                  </button>
                </div>
                <div className="mt-3 grid gap-3">
                  {result.matches.length ? (
                    result.matches.map((company, index) => (
                      <RecommendationCard
                        key={company.id}
                        company={company}
                        rank={index + 1}
                        evidence={[...uploadedEvidence, ...corpusEvidence].filter((item) => evidenceMatchesCompany(item, company.name)).slice(0, 2)}
                      />
                    ))
                  ) : (
                    <EmptyState>No companies matched this request. Try broadening the geography, sector, or trigger criteria.</EmptyState>
                  )}
                </div>
              </section>

              {evidenceCount ? (
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Evidence library</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {uploadedEvidence.slice(0, 4).map((item) => (
                      <EvidenceCard key={item.id} item={item} />
                    ))}
                    {corpusEvidence.slice(0, Math.max(0, 6 - uploadedEvidence.length)).map((item) => (
                      <CorpusEvidenceCard key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <EmptyState>
              Upload prior project files or use the existing corpus, then describe the lead profile KPMG wants to find.
            </EmptyState>
          )}
        </div>
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

function AnswerBrief({ answer }: { answer: string }) {
  const lines = answer
    .replaceAll("**", "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const summaryLines = lines
    .filter((line) => !line.startsWith("##") && !line.match(/^\d+\./) && !line.startsWith("-"))
    .slice(0, 3);

  return (
    <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--foreground)]">
      {summaryLines.length ? (
        summaryLines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)
      ) : (
        <p>
          RAG identified the companies below as the strongest matches for the request. Each recommendation is grounded in saved company
          summaries and source evidence.
        </p>
      )}
    </div>
  );
}

function RecommendationCard({
  company,
  evidence,
  rank,
}: {
  company: LeadMatch;
  evidence: Array<RagDocumentEvidence | UploadedDocumentEvidence>;
  rank: number;
}) {
  return (
    <article className="rounded-md border border-[var(--line)] bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--foreground)] text-xs font-semibold text-white">
              {rank}
            </span>
            <h4 className="text-lg font-semibold">{company.name}</h4>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {[company.industry, company.region, company.company_size].filter(Boolean).join(" / ")}
          </p>
        </div>
        <div className="min-w-32 rounded-md border border-[var(--line)] px-3 py-2 text-right">
          <div className="text-lg font-semibold text-[var(--accent)]">{formatLeadScore(company)}</div>
          <div className="text-xs text-[var(--muted)]">{company.dataset_score == null ? "Semantic match" : "Dataset score"}</div>
          {company.score_status ? <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">{company.score_status}</div> : null}
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-[var(--foreground)]">{company.description}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {typeof company.score_rank === "number" ? <Badge>{`Dataset rank #${company.score_rank}`}</Badge> : null}
        <Badge>{`${Math.round(company.similarity * 100)}% semantic match`}</Badge>
        {company.triggered_signals?.slice(0, 5).map((signal) => (
          <Badge key={signal}>{signal}</Badge>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SignalList title="Buying signals" items={company.buying_signals} />
        <SignalList title="Pain points" items={company.pain_points} />
        <SignalList title="KPMG fit" items={company.services_fit} />
      </div>

      {evidence.length ? (
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Supporting evidence</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {evidence.map((item) => (
              <EvidenceSnippet key={item.id} item={item} />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function SignalList({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[#fbfcfd] p-3">
      <h5 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{title}</h5>
      {items.length ? (
        <ul className="mt-2 space-y-2 text-sm leading-5">
          {items.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted)]">No structured signal available.</p>
      )}
    </div>
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

function CorpusEvidenceCard({ item }: { item: RagDocumentEvidence }) {
  return (
    <article className="rounded-md border border-[var(--line)] p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <h4 className="font-semibold">{item.company_name || item.doc_type}</h4>
        <span className="text-xs text-[var(--accent)]">{Math.round(item.similarity * 100)}%</span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">{[item.doc_type, item.trigger_name].filter(Boolean).join(" / ")}</p>
      <p className="mt-2 line-clamp-4 text-[var(--muted)]">{item.content}</p>
    </article>
  );
}

function EvidenceSnippet({ item }: { item: RagDocumentEvidence | UploadedDocumentEvidence }) {
  const label = "file_name" in item ? item.file_name : item.company_name || item.doc_type;
  const detail = "file_name" in item ? `Uploaded document / chunk ${item.chunk_index}` : [item.doc_type, item.trigger_name].filter(Boolean).join(" / ");

  return (
    <div className="rounded-md border border-[var(--line)] p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{label}</p>
        <span className="text-xs text-[var(--accent)]">{Math.round(item.similarity * 100)}%</span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
      <p className="mt-2 line-clamp-3 text-[var(--muted)]">{item.content}</p>
    </div>
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

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-80 place-items-center rounded-md border border-dashed border-[var(--line)] bg-[#fbfcfd] p-8 text-center text-sm leading-6 text-[var(--muted)]">
      <p className="max-w-md">{children}</p>
    </div>
  );
}

function evidenceMatchesCompany(item: RagDocumentEvidence | UploadedDocumentEvidence, companyName: string) {
  const haystack = "company_name" in item ? `${item.company_name || ""} ${item.content}` : item.content;
  return haystack.toLowerCase().includes(companyName.toLowerCase());
}

function formatLeadScore(company: LeadMatch) {
  if (typeof company.dataset_score === "number") return company.dataset_score.toFixed(1);
  return `${Math.round(company.similarity * 100)}%`;
}
