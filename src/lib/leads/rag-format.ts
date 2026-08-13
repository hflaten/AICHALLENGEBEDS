import type { LeadCompany } from "./types";
import type { KpmRagRecord, RagDocumentMatch } from "./rag-types";

export function ragRecordToContent(record: KpmRagRecord) {
  return [
    record.text,
    record.selskap ? `Selskap: ${record.selskap}` : "",
    record.org_id ? `Org.nr: ${record.org_id}` : "",
    record.sektor ? `Sektor: ${record.sektor}` : "",
    record.trigger ? `Trigger: ${record.trigger}` : "",
    record.trigger_familie ? `Trigger-familie: ${record.trigger_familie}` : "",
    record.dato ? `Dato: ${record.dato}` : "",
    typeof record.vekt === "number" ? `Vekt: ${record.vekt}` : "",
    typeof record.ferskhet === "number" ? `Ferskhet: ${record.ferskhet}` : "",
    record.kilde_status ? `Kilde-status: ${record.kilde_status}` : "",
    typeof record.verifisert === "boolean" ? `Verifisert: ${record.verifisert ? "ja" : "nei"}` : "",
    typeof record.produksjonsdata === "boolean"
      ? `Produksjonsdata: ${record.produksjonsdata ? "ja" : "nei"}`
      : "",
    typeof record.syntetisk_demo === "boolean" ? `Syntetisk demo: ${record.syntetisk_demo ? "ja" : "nei"}` : "",
    record.anbefalt_tjenester?.length ? `Anbefalte tjenester: ${record.anbefalt_tjenester.join("; ")}` : "",
    record.synonymer?.length ? `Synonymer: ${record.synonymer.join("; ")}` : "",
    record.questions?.length ? `Kontrollspørsmål: ${record.questions.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function ragRecordToMetadata(record: KpmRagRecord) {
  return {
    original_id: record.id,
    provenance: record.provenance ?? null,
    kildenivaa: record.kildenivaa ?? null,
    kilde_status: record.kilde_status ?? null,
    verifisert: record.verifisert ?? null,
    produksjonsdata: record.produksjonsdata ?? null,
    syntetisk_demo: record.syntetisk_demo ?? null,
    trigger_kode: record.trigger_kode ?? null,
    trigger_familie: record.trigger_familie ?? null,
    dager_siden: record.dager_siden ?? null,
    vekt: record.vekt ?? null,
    ferskhet: record.ferskhet ?? null,
    grunnbidrag: record.grunnbidrag ?? null,
    halveringstid_dager: record.halveringstid_dager ?? null,
    spraak: record.spraak ?? null,
    synonymer: record.synonymer ?? [],
    kilder: record.kilder ?? [],
    questions: record.questions ?? [],
    anbefalt_tjenester: record.anbefalt_tjenester ?? [],
    modellversjon: record.modellversjon ?? null,
    vurderingsdato: record.vurderingsdato ?? null,
    raw: record,
  };
}

export function ragRecordToDocument(record: KpmRagRecord) {
  return {
    source_id: record.id,
    doc_type: record.type,
    company_name: cleanNullable(record.selskap),
    org_id: cleanNullable(record.org_id),
    sector: cleanNullable(record.sektor),
    trigger_name: cleanNullable(record.trigger),
    event_date: cleanNullable(record.dato),
    content: ragRecordToContent(record),
    metadata: ragRecordToMetadata(record),
  };
}

export function ragDocumentsToContext(matches: RagDocumentMatch[]) {
  return matches
    .map((match, index) =>
      [
        `[${index + 1}] ${match.company_name || match.doc_type} (${Math.round(match.similarity * 100)}% semantic match)`,
        `Record ID: ${match.source_id}`,
        `Type: ${match.doc_type}`,
        match.company_name ? `Company: ${match.company_name}` : "",
        match.org_id ? `Org ID: ${match.org_id}` : "",
        match.sector ? `Sector: ${match.sector}` : "",
        match.trigger_name ? `Trigger: ${match.trigger_name}` : "",
        match.event_date ? `Date: ${match.event_date}` : "",
        `Verification: ${verificationLabel(match.metadata)}`,
        `Content: ${match.content}`,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function ragRecordGroupsToCompanies(records: KpmRagRecord[]) {
  const grouped = new Map<string, KpmRagRecord[]>();

  for (const record of records) {
    const companyName = cleanNullable(record.selskap);
    if (!companyName) continue;
    grouped.set(companyName, [...(grouped.get(companyName) || []), record]);
  }

  return [...grouped.entries()].map(([name, companyRecords]) => {
    const sectors = unique(companyRecords.map((record) => record.sektor));
    const triggers = unique(companyRecords.map((record) => record.trigger));
    const services = unique(companyRecords.flatMap((record) => record.anbefalt_tjenester || []));
    const verifiedCount = companyRecords.filter((record) => record.verifisert).length;
    const productionCount = companyRecords.filter((record) => record.produksjonsdata).length;
    const syntheticCount = companyRecords.filter((record) => record.synthetic_demo || record.provenance === "SYNTETISK").length;
    const bestScore = companyRecords
      .map((record) => (typeof record.grunnbidrag === "number" ? record.grunnbidrag : null))
      .filter((value): value is number => value !== null)
      .sort((a, b) => b - a)[0];

    const company: Omit<LeadCompany, "id" | "created_at"> & { metadata: Record<string, unknown> } = {
      name,
      website: null,
      industry: sectors.join(", ") || null,
      region: "Norway / Nordics",
      company_size: null,
      revenue_range: null,
      description: [
        `${name} appears in the KPMG shipping lead RAG corpus with ${companyRecords.length} records.`,
        sectors.length ? `Sectors: ${sectors.join(", ")}.` : "",
        triggers.length ? `Observed triggers: ${triggers.join("; ")}.` : "",
        typeof bestScore === "number" ? `Highest contribution score: ${bestScore}.` : "",
        `${verifiedCount} verified records, ${productionCount} production-data records, ${syntheticCount} synthetic demo records.`,
      ]
        .filter(Boolean)
        .join(" "),
      pain_points: triggers,
      buying_signals: companyRecords
        .filter((record) => record.trigger || record.text)
        .slice(0, 12)
        .map((record) => [record.trigger, record.dato, record.kilde_status].filter(Boolean).join(" | ")),
      services_fit: services,
      contact_name: null,
      contact_title: null,
      contact_email: null,
      source: "KPMG JSONL RAG corpus",
      metadata: {
        ingestion: "kpm-jsonl",
        source_record_ids: companyRecords.map((record) => record.id),
        record_count: companyRecords.length,
        verified_count: verifiedCount,
        production_count: productionCount,
        synthetic_count: syntheticCount,
      },
    };

    return company;
  });
}

function cleanNullable(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function verificationLabel(metadata: Record<string, unknown>) {
  const parts = [
    metadata.produksjonsdata === true ? "production data" : "not production data",
    metadata.verifisert === true ? "verified" : "not verified",
    metadata.syntetisk_demo === true || metadata.provenance === "SYNTETISK" ? "synthetic demo" : "",
    typeof metadata.kilde_status === "string" ? `source status: ${metadata.kilde_status}` : "",
  ].filter(Boolean);

  return parts.join(", ");
}
