type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
};

type ResponsesResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  error?: { message?: string };
};

type ExtractedProjectKnowledgeResponse = {
  companies: Array<{
    name: string;
    website?: string | null;
    industry?: string | null;
    region?: string | null;
    company_size?: string | null;
    revenue_range?: string | null;
    description: string;
    pain_points?: string[];
    buying_signals?: string[];
    services_fit?: string[];
    contact_name?: string | null;
    contact_title?: string | null;
    contact_email?: string | null;
    source?: string | null;
    confidence: "low" | "medium" | "high";
    evidence?: string[];
  }>;
  project_title: string | null;
  project_summary: string;
};

const OPENAI_API_BASE = "https://api.openai.com/v1";
const EMBEDDING_DIMENSIONS = 1536;

export function getOpenAISettings() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || "low",
  };
}

export async function createEmbedding(input: string) {
  const [embedding] = await createEmbeddings([input]);
  return embedding;
}

export async function createEmbeddings(inputs: string[]) {
  const settings = getOpenAISettings();

  if (!settings.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  if (inputs.length === 0) {
    return [];
  }

  const response = await fetch(`${OPENAI_API_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.embeddingModel,
      input: inputs,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    }),
  });

  const payload = (await response.json()) as EmbeddingResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI embedding request failed.");
  }

  const embeddings = payload.data?.map((item) => item.embedding);

  if (!embeddings || embeddings.length !== inputs.length) {
    throw new Error("OpenAI embedding response did not match the input count.");
  }

  const invalidEmbedding = embeddings.find((embedding) => !embedding || embedding.length !== EMBEDDING_DIMENSIONS);

  if (invalidEmbedding) {
    throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding.`);
  }

  return embeddings as number[][];
}

export async function createLeadBrief({
  context,
  request,
}: {
  context: string;
  request: string;
}) {
  const settings = getOpenAISettings();

  if (!settings.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch(`${OPENAI_API_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      reasoning: {
        effort: settings.reasoningEffort,
      },
      text: {
        verbosity: "medium",
      },
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text:
                [
                  "Role: You are KPMG's lead qualification assistant for shipping and logistics consultancy opportunities.",
                  "Goal: Rank retrieved RAG evidence against the user's lead request and create a practical outreach brief.",
                  "Evidence rules: Use only the retrieved records. Cite every company-specific claim with its record number, such as [1]. Do not invent companies, contacts, metrics, buying signals, needs, regions, dates, sources, or service fit.",
                  "Trust rules: Treat records labeled production data and verified as strongest evidence. You may use synthetic demo, unverified, no-signal, methodology, definition, governance, or guardrail records, but label them clearly and never present them as verified market facts.",
                  "Success criteria: Recommend only companies with retrieved support; explain why each fit matters to KPMG; state missing data or weak evidence; suggest one concrete next action per recommended company.",
                  "Output: Use sections named Top leads, Why these fit, Risks or missing evidence, and Next actions. If the records do not support a useful recommendation, say so directly and ask for more seed data instead of guessing.",
                ].join("\n"),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Lead request:\n${request}\n\nRetrieved company records, the only allowed evidence:\n${context}`,
            },
          ],
        },
      ],
    }),
  });

  const payload = (await response.json()) as ResponsesResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI response request failed.");
  }

  return extractResponseText(payload);
}

export async function extractProjectKnowledge({
  fileName,
  text,
}: {
  fileName: string;
  text: string;
}): Promise<ExtractedProjectKnowledgeResponse> {
  const settings = getOpenAISettings();

  if (!settings.apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch(`${OPENAI_API_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      reasoning: {
        effort: settings.reasoningEffort,
      },
      text: {
        format: {
          type: "json_schema",
          name: "project_knowledge_extraction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["companies", "project_title", "project_summary"],
            properties: {
              project_title: { type: ["string", "null"] },
              project_summary: { type: "string" },
              companies: {
                type: "array",
                maxItems: 12,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "name",
                    "website",
                    "industry",
                    "region",
                    "company_size",
                    "revenue_range",
                    "description",
                    "pain_points",
                    "buying_signals",
                    "services_fit",
                    "contact_name",
                    "contact_title",
                    "contact_email",
                    "source",
                    "confidence",
                    "evidence",
                  ],
                  properties: {
                    name: { type: "string" },
                    website: { type: ["string", "null"] },
                    industry: { type: ["string", "null"] },
                    region: { type: ["string", "null"] },
                    company_size: { type: ["string", "null"] },
                    revenue_range: { type: ["string", "null"] },
                    description: { type: "string" },
                    pain_points: { type: "array", items: { type: "string" }, maxItems: 12 },
                    buying_signals: { type: "array", items: { type: "string" }, maxItems: 12 },
                    services_fit: { type: "array", items: { type: "string" }, maxItems: 12 },
                    contact_name: { type: ["string", "null"] },
                    contact_title: { type: ["string", "null"] },
                    contact_email: { type: ["string", "null"] },
                    source: { type: ["string", "null"] },
                    confidence: { type: "string", enum: ["low", "medium", "high"] },
                    evidence: { type: "array", items: { type: "string" }, maxItems: 8 },
                  },
                },
              },
            },
          },
        },
        verbosity: "low",
      },
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: [
                "Extract reusable KPMG lead-generation knowledge from uploaded prior project material.",
                "Use only facts present in the document text.",
                "Create company summaries that match the lead_companies database shape.",
                "Buying signals should be concrete evidence from the project material, not generic sales claims.",
                "Services fit should name consultancy services KPMG could plausibly offer based on the text.",
                "If a field is not present, use null or an empty array. Do not invent contact details, revenue, size, website, or dates.",
              ].join("\n"),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `File name: ${fileName}\n\nDocument text:\n${text.slice(0, 80_000)}`,
            },
          ],
        },
      ],
    }),
  });

  const payload = (await response.json()) as ResponsesResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI project extraction request failed.");
  }

  const textOutput = extractResponseText(payload);

  try {
    return JSON.parse(textOutput) as ExtractedProjectKnowledgeResponse;
  } catch {
    throw new Error("OpenAI extraction did not return valid structured JSON.");
  }
}

function extractResponseText(payload: ResponsesResponse) {
  if (payload.output_text) return payload.output_text;

  const text = payload.output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("OpenAI response did not include text output.");
  }

  return text;
}
