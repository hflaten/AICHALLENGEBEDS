import { z } from "zod";
import { matchesToContext } from "@/lib/leads/format";
import { ragDocumentsToContext, uploadedDocumentsToContext } from "@/lib/leads/rag-format";
import type { LeadMatch, RagDocumentEvidence, UploadedDocumentEvidence } from "@/lib/leads/types";
import { createEmbedding, createLeadBrief, getOpenAISettings } from "@/lib/openai/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 45;

const searchSchema = z.object({
  request: z.string().trim().min(8).max(2000),
  matchThreshold: z.number().min(0).max(1).default(0.35),
  matchCount: z.number().int().min(1).max(12).default(6),
});

export async function POST(request: Request) {
  const parsed = searchSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { error: "Search request is incomplete or invalid.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const queryEmbedding = await createEmbedding(parsed.data.request);
    const { data: documentsData, error: documentsError } = await supabase.rpc("match_rag_documents", {
      query_embedding: queryEmbedding,
      match_threshold: Math.min(parsed.data.matchThreshold, 0.2),
      match_count: Math.max(parsed.data.matchCount * 2, 12),
    });

    if (documentsError) {
      return Response.json({ error: documentsError.message }, { status: 500 });
    }

    const { data: uploadedDocumentsData, error: uploadedDocumentsError } = await supabase.rpc("match_document_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: Math.min(parsed.data.matchThreshold, 0.2),
      match_count: Math.max(parsed.data.matchCount * 2, 12),
    });

    if (uploadedDocumentsError) {
      return Response.json({ error: uploadedDocumentsError.message }, { status: 500 });
    }

    const { data, error } = await supabase.rpc("match_lead_companies", {
      query_embedding: queryEmbedding,
      match_threshold: parsed.data.matchThreshold,
      match_count: parsed.data.matchCount,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const matches = (data || []) as LeadMatch[];
    const documents = (documentsData || []) as RagDocumentEvidence[];
    const uploadedDocuments = (uploadedDocumentsData || []) as UploadedDocumentEvidence[];

    if (matches.length === 0 && documents.length === 0 && uploadedDocuments.length === 0) {
      return Response.json({
        result: {
          request: parsed.data.request,
          answer: "No company or document records passed the current semantic-match threshold. Import the KPMG RAG corpus or lower the threshold.",
          matches: [],
          documents: [],
          uploadedDocuments: [],
          model: getOpenAISettings().model,
          embeddingModel: getOpenAISettings().embeddingModel,
        },
      });
    }

    const settings = getOpenAISettings();
    const context = [
      uploadedDocuments.length ? "Uploaded project document evidence:\n" + uploadedDocumentsToContext(uploadedDocuments) : "",
      documents.length ? "Document evidence:\n" + ragDocumentsToContext(documents) : "",
      matches.length ? "Company summaries:\n" + matchesToContext(matches) : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const answer = await createLeadBrief({
      context,
      request: parsed.data.request,
    });

    const { data: savedSearch, error: insertError } = await supabase
      .from("lead_searches")
      .insert({
        request: parsed.data.request,
        answer,
        model: settings.model,
        embedding_model: settings.embeddingModel,
        matched_company_ids: matches.map((match) => match.id),
        metadata: {
          match_threshold: parsed.data.matchThreshold,
          match_count: parsed.data.matchCount,
          matched_document_ids: documents.map((document) => document.id),
          matched_uploaded_chunk_ids: uploadedDocuments.map((document) => document.id),
        },
      })
      .select("id")
      .single();

    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    return Response.json({
      result: {
        id: savedSearch?.id,
        request: parsed.data.request,
        answer,
        matches,
        documents,
        uploadedDocuments,
        model: settings.model,
        embeddingModel: settings.embeddingModel,
      },
    });
  } catch (caught) {
    return Response.json({ error: getErrorMessage(caught) }, { status: 500 });
  }
}

function getErrorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : "Unexpected lead search API error.";
}
