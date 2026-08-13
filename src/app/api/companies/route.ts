import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { companyToEmbeddingText } from "@/lib/leads/format";
import { createEmbedding } from "@/lib/openai/client";

export const maxDuration = 30;

const companySchema = z.object({
  name: z.string().trim().min(1).max(160),
  website: z.string().trim().max(240).optional().nullable(),
  industry: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  company_size: z.string().trim().max(80).optional().nullable(),
  revenue_range: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().min(20).max(3000),
  pain_points: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  buying_signals: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  services_fit: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  contact_name: z.string().trim().max(160).optional().nullable(),
  contact_title: z.string().trim().max(160).optional().nullable(),
  contact_email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  source: z.string().trim().max(240).optional().nullable(),
});

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lead_companies")
      .select(
        "id,created_at,name,website,industry,region,company_size,revenue_range,description,pain_points,buying_signals,services_fit,contact_name,contact_title,contact_email,source",
      )
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ companies: data || [] });
  } catch (caught) {
    return Response.json({ error: getErrorMessage(caught) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = companySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { error: "Company data is incomplete or invalid.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const company = {
      ...parsed.data,
      website: cleanNullable(parsed.data.website),
      industry: cleanNullable(parsed.data.industry),
      region: cleanNullable(parsed.data.region),
      company_size: cleanNullable(parsed.data.company_size),
      revenue_range: cleanNullable(parsed.data.revenue_range),
      contact_name: cleanNullable(parsed.data.contact_name),
      contact_title: cleanNullable(parsed.data.contact_title),
      contact_email: cleanNullable(parsed.data.contact_email),
      source: cleanNullable(parsed.data.source),
    };
    const embedding = await createEmbedding(companyToEmbeddingText(company));
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lead_companies")
      .insert({
      ...company,
      embedding,
      metadata: {
        ingestion: "manual",
      },
    })
      .select(
        "id,created_at,name,website,industry,region,company_size,revenue_range,description,pain_points,buying_signals,services_fit,contact_name,contact_title,contact_email,source",
      )
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ company: data }, { status: 201 });
  } catch (caught) {
    return Response.json({ error: getErrorMessage(caught) }, { status: 500 });
  }
}

function cleanNullable(value: string | null | undefined) {
  return value?.trim() || null;
}

function getErrorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : "Unexpected lead company API error.";
}
