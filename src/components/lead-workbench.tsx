"use client";

import { FormEvent, useMemo, useState } from "react";
import type { LeadCompany, LeadMatch, LeadSearchResult } from "@/lib/leads/types";
import { splitList } from "@/lib/leads/format";

type RuntimeStatus = {
  aiReady: boolean;
  embeddingModel: string;
  model: string;
  ragReady: boolean;
  supabaseReady: boolean;
};

type CompanyFormState = {
  name: string;
  website: string;
  industry: string;
  region: string;
  company_size: string;
  revenue_range: string;
  description: string;
  pain_points: string;
  buying_signals: string;
  services_fit: string;
  contact_name: string;
  contact_title: string;
  contact_email: string;
  source: string;
};

const emptyCompany: CompanyFormState = {
  name: "",
  website: "",
  industry: "",
  region: "",
  company_size: "",
  revenue_range: "",
  description: "",
  pain_points: "",
  buying_signals: "",
  services_fit: "",
  contact_name: "",
  contact_title: "",
  contact_email: "",
  source: "",
};

export function LeadWorkbench({ status }: { status: RuntimeStatus }) {
  const [companyForm, setCompanyForm] = useState<CompanyFormState>({
    ...emptyCompany,
    name: "Nordic Grid Systems",
    website: "https://example.com",
    industry: "Energy infrastructure",
    region: "Nordics",
    company_size: "1,000-5,000 employees",
    revenue_range: "EUR 250M-1B",
    description:
      "Regional grid operator modernizing asset maintenance, reporting, and regulatory data workflows across several markets.",
    pain_points: "Legacy ERP landscape\nManual regulatory reporting\nCyber resilience gaps",
    buying_signals: "New transformation office\nHiring data governance roles\nUpcoming compliance deadline",
    services_fit: "Technology transformation\nCyber security\nESG and regulatory reporting",
    contact_title: "Chief Transformation Officer",
    source: "Manual research",
  });
  const [companies, setCompanies] = useState<LeadCompany[]>([]);
  const [request, setRequest] = useState(
    "Find Nordic mid-market companies with regulatory pressure, legacy systems, and a strong fit for KPMG technology transformation.",
  );
  const [result, setResult] = useState<LeadSearchResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canUseRag = status.ragReady;
  const canSave = useMemo(
    () => companyForm.name.trim().length > 0 && companyForm.description.trim().length >= 20 && !isSaving,
    [companyForm.description, companyForm.name, isSaving],
  );
  const canSearch = useMemo(() => request.trim().length >= 8 && !isSearching, [isSearching, request]);

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

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...companyForm,
          pain_points: splitList(companyForm.pain_points),
          buying_signals: splitList(companyForm.buying_signals),
          services_fit: splitList(companyForm.services_fit),
        }),
      });
      const payload = (await response.json()) as { company?: LeadCompany; error?: string };
      if (!response.ok || !payload.company) throw new Error(payload.error || "Company save failed.");
      setCompanies((current) => [payload.company as LeadCompany, ...current].slice(0, 12));
      setCompanyForm(emptyCompany);
      setMessage(`${payload.company.name} was added and embedded for RAG search.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Company save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function seedKpmRagCorpus() {
    if (!canUseRag || isSeeding) return;

    setIsSeeding(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/rag/seed", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        companies?: number;
        count?: number;
        error?: string;
        productionRecords?: number;
        syntheticRecords?: number;
        verifiedRecords?: number;
      };
      if (!response.ok || typeof payload.count !== "number" || typeof payload.companies !== "number") {
        throw new Error(payload.error || "KPMG RAG corpus import failed.");
      }

      setMessage(
        `${payload.count} RAG records and ${payload.companies} company summaries were embedded. ${payload.verifiedRecords || 0} verified, ${payload.productionRecords || 0} production, ${payload.syntheticRecords || 0} synthetic.`,
      );
      await loadCompanies();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "KPMG RAG corpus import failed.");
    } finally {
      setIsSeeding(false);
    }
  }

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
        body: JSON.stringify({ request, matchCount: 6, matchThreshold: 0.25 }),
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

  return (
    <div className="grid flex-1 gap-5 py-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="rounded-md border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] p-4">
          <h2 className="text-lg font-semibold">Company intake</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Add target accounts and buying context to the Supabase vector store.
          </p>
        </div>
        <div className="border-b border-[var(--line)] p-4">
          <button
            type="button"
            disabled={!canUseRag || isSeeding}
            onClick={() => void seedKpmRagCorpus()}
            className="h-10 w-full rounded-md border border-[var(--accent)] px-4 font-medium text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSeeding ? "Embedding KPMG corpus..." : "Load KPMG RAG corpus"}
          </button>
        </div>
        <form onSubmit={saveCompany} className="space-y-3 p-4">
          <Field label="Company" value={companyForm.name} onChange={(value) => updateCompany("name", value)} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website" value={companyForm.website} onChange={(value) => updateCompany("website", value)} />
            <Field label="Industry" value={companyForm.industry} onChange={(value) => updateCompany("industry", value)} />
            <Field label="Region" value={companyForm.region} onChange={(value) => updateCompany("region", value)} />
            <Field label="Size" value={companyForm.company_size} onChange={(value) => updateCompany("company_size", value)} />
          </div>
          <Field
            label="Revenue"
            value={companyForm.revenue_range}
            onChange={(value) => updateCompany("revenue_range", value)}
          />
          <TextArea
            label="Account description"
            value={companyForm.description}
            onChange={(value) => updateCompany("description", value)}
            rows={4}
            required
          />
          <TextArea
            label="Pain points"
            value={companyForm.pain_points}
            onChange={(value) => updateCompany("pain_points", value)}
            rows={3}
          />
          <TextArea
            label="Buying signals"
            value={companyForm.buying_signals}
            onChange={(value) => updateCompany("buying_signals", value)}
            rows={3}
          />
          <TextArea
            label="KPMG service fit"
            value={companyForm.services_fit}
            onChange={(value) => updateCompany("services_fit", value)}
            rows={3}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Contact"
              value={companyForm.contact_name}
              onChange={(value) => updateCompany("contact_name", value)}
            />
            <Field
              label="Title"
              value={companyForm.contact_title}
              onChange={(value) => updateCompany("contact_title", value)}
            />
          </div>
          <Field
            label="Email"
            value={companyForm.contact_email}
            onChange={(value) => updateCompany("contact_email", value)}
          />
          <Field label="Source" value={companyForm.source} onChange={(value) => updateCompany("source", value)} />
          <button
            type="submit"
            disabled={!canSave || !canUseRag}
            className="h-10 w-full rounded-md bg-[var(--accent)] px-4 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Embedding..." : "Add company"}
          </button>
        </form>
      </section>

      <section className="flex min-h-[760px] flex-col rounded-md border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] p-4">
          <h2 className="text-lg font-semibold">Lead generator</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Ask for an ideal prospect profile. RAG retrieves matching companies and the AI ranks the outreach fit.
          </p>
        </div>
        <div className="border-b border-[var(--line)] p-4">
          <form onSubmit={searchLeads} className="space-y-3">
            <TextArea label="Lead request" value={request} onChange={setRequest} rows={4} required />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                {message ? <span className="text-[var(--accent)]">{message}</span> : null}
                {error ? <span className="text-[var(--warning)]">{error}</span> : null}
                {!message && !error ? <span className="text-[var(--muted)]">{companies.length} companies indexed</span> : null}
              </div>
              <button
                type="submit"
                disabled={!canSearch || !canUseRag}
                className="h-10 rounded-md bg-[var(--foreground)] px-4 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSearching ? "Searching..." : "Find leads"}
              </button>
            </div>
          </form>
        </div>

        <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-h-96 rounded-md border border-[var(--line)] p-4">
            {result ? (
              <div>
                <div className="mb-4 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                  <span>{result.model}</span>
                  <span>{result.embeddingModel}</span>
                  <span>{result.matches.length} matches</span>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-7">{result.answer}</div>
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center text-sm text-[var(--muted)]">
                <p className="max-w-md">
                  Add companies, then describe the type of lead KPMG wants to find. Results will be grounded in the stored company records.
                </p>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Retrieved accounts</h3>
              <button
                type="button"
                disabled={!status.supabaseReady}
                onClick={() => void loadCompanies()}
                className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-medium text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {(result?.matches.length ? result.matches : companies).slice(0, 6).map((company) => (
                <article key={company.id} className="rounded-md border border-[var(--line)] p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-semibold">{company.name}</h4>
                    {hasSimilarity(company) ? (
                      <span className="text-xs text-[var(--accent)]">{Math.round(company.similarity * 100)}%</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[var(--muted)]">{[company.industry, company.region].filter(Boolean).join(" / ")}</p>
                  <p className="mt-2 max-h-[4.5rem] overflow-hidden text-[var(--muted)]">{company.description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  function updateCompany(key: keyof CompanyFormState, value: string) {
    setCompanyForm((current) => ({ ...current, [key]: value }));
  }
}

function hasSimilarity(company: LeadCompany | LeadMatch): company is LeadMatch {
  return "similarity" in company && typeof company.similarity === "number";
}

function Field({
  label,
  onChange,
  required,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="block text-sm font-medium text-[var(--muted)]">
      {label}
      <input
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}

function TextArea({
  label,
  onChange,
  required,
  rows,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  rows: number;
  value: string;
}) {
  return (
    <label className="block text-sm font-medium text-[var(--muted)]">
      {label}
      <textarea
        required={required}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full resize-y rounded-md border border-[var(--line)] bg-white p-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}
