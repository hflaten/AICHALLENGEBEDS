import { companyToEmbeddingText } from "@/lib/leads/format";
import { createEmbeddings, extractProjectKnowledge } from "@/lib/openai/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { chunkParsedUpload } from "@/lib/uploads/chunk";
import { parseUploadedFile } from "@/lib/uploads/parse";
import type { ExtractedCompany } from "@/lib/uploads/types";

export const maxDuration = 300;

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const STORAGE_BUCKET = "project-documents";
const EMBEDDING_BATCH_SIZE = 64;

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("ingestion_runs")
      .select("id,created_at,status,file_name,content_type,file_size,project_title,project_summary,chunk_count,company_count,error_message")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const [{ count: companyCount }, { count: documentCount }] = await Promise.all([
      supabase.from("lead_companies").select("id", { count: "exact", head: true }),
      supabase.from("document_chunks").select("id", { count: "exact", head: true }),
    ]);

    return Response.json({
      runs: data || [],
      stats: {
        companies: companyCount || 0,
        chunks: documentCount || 0,
      },
    });
  } catch (caught) {
    return Response.json({ error: getErrorMessage(caught) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let runId: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "Upload a file using the `file` form field." }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: "File is too large. Upload files up to 12 MB." }, { status: 413 });
    }

    const supabase = getSupabaseAdmin();
    const { data: run, error: runError } = await supabase
      .from("ingestion_runs")
      .insert({
        status: "processing",
        file_name: file.name,
        content_type: file.type || null,
        file_size: file.size,
      })
      .select("id")
      .single();

    if (runError || !run) {
      throw new Error(runError?.message || "Could not create ingestion run.");
    }

    runId = run.id as string;
    const storagePath = `${runId}/${sanitizeFileName(file.name)}`;
    const parsed = await parseUploadedFile(file);
    const arrayBuffer = await file.arrayBuffer();
    const upload = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, arrayBuffer, {
      contentType: parsed.contentType,
      upsert: true,
    });

    if (upload.error) {
      throw new Error(upload.error.message);
    }

    const { data: sourceDocument, error: sourceError } = await supabase
      .from("source_documents")
      .insert({
        ingestion_run_id: runId,
        file_name: file.name,
        content_type: parsed.contentType,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        file_size: file.size,
        extracted_text: parsed.text,
        metadata: {
          section_count: parsed.sections.length,
        },
      })
      .select("id")
      .single();

    if (sourceError || !sourceDocument) {
      throw new Error(sourceError?.message || "Could not save source document.");
    }

    const chunks = chunkParsedUpload(parsed);
    const chunkEmbeddings = await embedTexts(chunks.map((chunk) => chunk.content));
    const chunkRows = chunks.map((chunk, index) => ({
      source_document_id: sourceDocument.id,
      ingestion_run_id: runId,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: chunkEmbeddings[index],
    }));
    const { error: chunkError } = await supabase.from("document_chunks").insert(chunkRows);

    if (chunkError) {
      throw new Error(chunkError.message);
    }

    const knowledge = await extractProjectKnowledge({
      fileName: file.name,
      text: parsed.text,
    });
    const companies = normalizeCompanies(knowledge.companies, file.name, runId, sourceDocument.id as string);
    const companyEmbeddings = await embedTexts(companies.map(companyToEmbeddingText));
    const companyRows = companies.map((company, index) => ({
      ...company,
      embedding: companyEmbeddings[index],
    }));

    if (companyRows.length) {
      const { error: companyError } = await supabase.from("lead_companies").upsert(companyRows, { onConflict: "name" });
      if (companyError) {
        throw new Error(companyError.message);
      }
    }

    const { error: updateError } = await supabase
      .from("ingestion_runs")
      .update({
        status: "completed",
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        project_title: knowledge.project_title,
        project_summary: knowledge.project_summary,
        document_count: 1,
        chunk_count: chunks.length,
        company_count: companyRows.length,
        metadata: {
          source_document_id: sourceDocument.id,
        },
      })
      .eq("id", runId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return Response.json({
      run: {
        id: runId,
        status: "completed",
        fileName: file.name,
        chunks: chunks.length,
        companies: companyRows.length,
        projectTitle: knowledge.project_title,
      },
    });
  } catch (caught) {
    if (runId) {
      const supabase = getSupabaseAdmin();
      await supabase
        .from("ingestion_runs")
        .update({
          status: "failed",
          error_message: getErrorMessage(caught),
        })
        .eq("id", runId);
    }

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

function normalizeCompanies(
  companies: ExtractedCompany[],
  fileName: string,
  ingestionRunId: string,
  sourceDocumentId: string,
) {
  return companies
    .filter((company) => company.name?.trim() && company.description?.trim())
    .map((company) => ({
      name: company.name.trim(),
      website: cleanNullable(company.website),
      industry: cleanNullable(company.industry),
      region: cleanNullable(company.region),
      company_size: cleanNullable(company.company_size),
      revenue_range: cleanNullable(company.revenue_range),
      description: company.description.trim(),
      pain_points: trimArray(company.pain_points),
      buying_signals: trimArray(company.buying_signals),
      services_fit: trimArray(company.services_fit),
      contact_name: cleanNullable(company.contact_name),
      contact_title: cleanNullable(company.contact_title),
      contact_email: cleanNullable(company.contact_email),
      source: `Uploaded project document: ${fileName}`,
      metadata: {
        ingestion: "uploaded-project-document",
        ingestion_run_id: ingestionRunId,
        source_document_id: sourceDocumentId,
        confidence: company.confidence,
        evidence: trimArray(company.evidence),
      },
    }));
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

function cleanNullable(value: string | null | undefined) {
  return value?.trim() || null;
}

function trimArray(values: string[] | undefined) {
  return (values || []).map((value) => value.trim()).filter(Boolean).slice(0, 20);
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

function getErrorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : "Unexpected upload ingestion API error.";
}
