import { sampleShippingCompanies } from "@/lib/leads/sample-shipping-companies";
import { companyToEmbeddingText } from "@/lib/leads/format";
import { createEmbedding } from "@/lib/openai/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 120;

export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const seeded = [];

    for (const company of sampleShippingCompanies) {
      const embedding = await createEmbedding(companyToEmbeddingText(company));
      const { data, error } = await supabase
        .from("lead_companies")
        .upsert(
          {
            ...company,
            embedding,
            metadata: {
              ingestion: "mock-shipping-seed",
              seeded_at: new Date().toISOString(),
            },
          },
          { onConflict: "name" },
        )
        .select("id,name")
        .single();

      if (error) {
        return Response.json({ error: `Failed to seed ${company.name}: ${error.message}` }, { status: 500 });
      }

      seeded.push(data);
    }

    return Response.json({
      count: seeded.length,
      companies: seeded,
    });
  } catch (caught) {
    return Response.json({ error: getErrorMessage(caught) }, { status: 500 });
  }
}

function getErrorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : "Unexpected company seed API error.";
}
