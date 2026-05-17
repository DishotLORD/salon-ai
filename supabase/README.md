# Supabase (OceanCore)

## Apply migrations

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor.
2. Run `migrations/001_initial_schema.sql` (skip tables that already exist).
3. Run `migrations/002_rls_policies.sql`.
4. Enable Realtime for `messages`, `conversations`, `customers` if needed.

Or link the CLI: `supabase link` then `supabase db push`.

## Env

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
CHAT_PREVIEW_SECRET=   # optional; for gated landing preview only
```
