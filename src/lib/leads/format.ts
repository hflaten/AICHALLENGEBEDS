import type { LeadCompany, LeadMatch } from "./types";

export function splitList(value: unknown) {
  if (typeof value !== "string") return [];

  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function companyToEmbeddingText(company: Omit<LeadCompany, "id" | "created_at">) {
  return [
    `Company: ${company.name}`,
    company.website ? `Website: ${company.website}` : "",
    company.industry ? `Industry: ${company.industry}` : "",
    company.region ? `Region: ${company.region}` : "",
    company.company_size ? `Size: ${company.company_size}` : "",
    company.revenue_range ? `Revenue: ${company.revenue_range}` : "",
    `Description: ${company.description}`,
    company.pain_points.length ? `Pain points: ${company.pain_points.join("; ")}` : "",
    company.buying_signals.length ? `Buying signals: ${company.buying_signals.join("; ")}` : "",
    company.services_fit.length ? `KPMG service fit: ${company.services_fit.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function matchesToContext(matches: LeadMatch[]) {
  return matches
    .map((match, index) =>
      [
        `[${index + 1}] ${match.name}`,
        typeof match.dataset_score === "number" ? `Dataset lead score: ${match.dataset_score}` : "",
        typeof match.production_score === "number" ? `Production score: ${match.production_score}` : "",
        match.score_status ? `Score status: ${match.score_status}` : "",
        typeof match.score_rank === "number" ? `Dataset rank: ${match.score_rank}` : "",
        match.triggered_signals?.length ? `Triggered score signals: ${match.triggered_signals.join("; ")}` : "",
        `${Math.round(match.similarity * 100)}% semantic retrieval match`,
        match.website ? `Website: ${match.website}` : "",
        match.industry ? `Industry: ${match.industry}` : "",
        match.region ? `Region: ${match.region}` : "",
        match.company_size ? `Size: ${match.company_size}` : "",
        match.revenue_range ? `Revenue: ${match.revenue_range}` : "",
        `Description: ${match.description}`,
        match.pain_points.length ? `Pain points: ${match.pain_points.join("; ")}` : "",
        match.buying_signals.length ? `Buying signals: ${match.buying_signals.join("; ")}` : "",
        match.services_fit.length ? `KPMG service fit: ${match.services_fit.join("; ")}` : "",
        match.contact_name || match.contact_title || match.contact_email
          ? `Contact: ${[match.contact_name, match.contact_title, match.contact_email].filter(Boolean).join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}
