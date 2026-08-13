export type LeadCompany = {
  id: string;
  created_at?: string;
  name: string;
  website: string | null;
  industry: string | null;
  region: string | null;
  company_size: string | null;
  revenue_range: string | null;
  description: string;
  pain_points: string[];
  buying_signals: string[];
  services_fit: string[];
  contact_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  source: string | null;
};

export type LeadMatch = LeadCompany & {
  similarity: number;
};

export type RagDocumentEvidence = {
  id: string;
  source_id: string;
  doc_type: string;
  company_name: string | null;
  org_id: string | null;
  sector: string | null;
  trigger_name: string | null;
  event_date: string | null;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

export type UploadedDocumentEvidence = {
  id: string;
  source_document_id: string;
  ingestion_run_id: string | null;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  file_name: string;
  storage_path: string;
  similarity: number;
};

export type LeadSearchResult = {
  id?: string;
  request: string;
  answer: string;
  matches: LeadMatch[];
  documents?: RagDocumentEvidence[];
  uploadedDocuments?: UploadedDocumentEvidence[];
  model: string;
  embeddingModel: string;
};
