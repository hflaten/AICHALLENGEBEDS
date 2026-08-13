export function getServerConfigStatus() {
  const model = process.env.OPENAI_MODEL || "gpt-5.6-sol";
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseReady = Boolean(
    supabaseUrl &&
      supabasePublishableKey &&
      supabaseSecretKey,
  );
  const aiReady = Boolean(process.env.OPENAI_API_KEY);

  return {
    aiReady,
    embeddingModel,
    model,
    ragReady: aiReady && supabaseReady,
    supabaseReady,
    vercelReady: Boolean(process.env.VERCEL || process.env.VERCEL_URL),
  };
}
