# KPMG Lead Generator

Next.js lead-generation workspace for a consultancy team. The app stores target companies in Supabase, embeds account context with OpenAI, and uses RAG to retrieve and rank prospects from the stored database.

## What It Does

- Adds company records with pain points, buying signals, contacts, and KPMG service-fit notes.
- Stores each company plus a 1536-dimension embedding in Supabase pgvector.
- Searches companies semantically from a natural-language lead request.
- Sends retrieved records to an OpenAI model to generate a ranked outreach brief.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example`.

3. In Supabase, run `supabase/migrations/0001_kpmg_lead_generator.sql`.

4. Start the app:

   ```bash
   npm run dev
   ```

## Vercel Setup

Use one Vercel project for the frontend and backend. The Next.js API routes in `src/app/api/**/route.ts` run as the backend.

Required Vercel environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (defaults to `gpt-5.6-sol`)
- `OPENAI_REASONING_EFFORT` (defaults to `low`)
- `OPENAI_EMBEDDING_MODEL` (defaults to `text-embedding-3-small`)

All API keys are used server-side only.

## GitHub

This local checkout has no remote configured yet. Add the repo remote once the exact GitHub owner/repo is known:

```bash
git remote add origin git@github.com:OWNER/aichallenge.git
```
