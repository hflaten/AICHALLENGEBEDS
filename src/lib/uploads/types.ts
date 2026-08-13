import type { LeadCompany } from "@/lib/leads/types";

export type ParsedUpload = {
  contentType: string;
  fileName: string;
  sections: ParsedSection[];
  text: string;
};

export type ParsedSection = {
  label: string;
  text: string;
};

export type DocumentChunk = {
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
};

export type ExtractedCompany = Partial<Omit<LeadCompany, "id" | "created_at">> & {
  description: string;
  confidence: "low" | "medium" | "high";
  name: string;
  evidence?: string[];
};

export type ExtractedProjectKnowledge = {
  companies: ExtractedCompany[];
  project_title: string | null;
  project_summary: string;
};
