import { kpmRagRecords } from "@/lib/leads/kpm-rag-data";
import { companyToEmbeddingText } from "@/lib/leads/format";
import { ragRecordGroupsToCompanies, ragRecordToDocument } from "@/lib/leads/rag-format";
import { createEmbeddings } from "@/lib/openai/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 300;

const EMBEDDING_BATCH_SIZE = 64;
const UPSERT_BATCH_SIZE = 100;

export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const documents = kpmRagRecords.map(ragRecordToDocument);
    const documentEmbeddings = await embedTexts(documents.map((document) => document.content));
    const documentRows = documents.map((document, index) => ({
      ...document,
      embedding: documentEmbeddings[index],
    }));

    for (const batch of chunk(documentRows, UPSERT_BATCH_SIZE)) {
      const { error } = await supabase.from("rag_documents").upsert(batch, { onConflict: "source_id" });
      if (error) throw new Error(error.message);
    }

    const companies = ragRecordGroupsToCompanies(kpmRagRecords);
    const companyEmbeddings = await embedTexts(companies.map(companyToEmbeddingText));
    const companyRows = companies.map((company, index) => ({
      ...company,
      embedding: companyEmbeddings[index],
    }));

    for (const batch of chunk(companyRows, UPSERT_BATCH_SIZE)) {
      const { error } = await supabase.from("lead_companies").upsert(batch, { onConflict: "name" });
      if (error) throw new Error(error.message);
    }

    return Response.json({
      count: documentRows.length,
      companies: companyRows.length,
      syntheticRecords: kpmRagRecords.filter((record) => record.syntetisk_demo || record.provenance === "SYNTETISK").length,
      verifiedRecords: kpmRagRecords.filter((record) => record.verifisert).length,
      productionRecords: kpmRagRecords.filter((record) => record.produksjonsdata).length,
    });
  } catch (caught) {
    return Response.json({ error: getErrorMessage(caught) }, { status: 500 });
  }
}

async function embedTexts(texts: string[]) {
  const embeddings: number[][] = [];

  for (const batch of chunk(texts, EMBEDDING_BATCH_SIZE)) {
    embeddings.push(...(await createEmbeddings(batch)));
  }

  return embeddings;
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

function getErrorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : "Unexpected KPMG RAG seed API error.";
}
