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

export type LeadSearchResult = {
  id?: string;
  request: string;
  answer: string;
  matches: LeadMatch[];
  model: string;
  embeddingModel: string;
};
