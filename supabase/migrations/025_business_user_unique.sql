-- Repair: enforce one businesses row per user_id.
--
-- Migration 001 declared:
--   create unique index if not exists businesses_user_id_idx
--     on public.businesses (user_id);
-- and application code (lib/duplicate-business.ts, app/onboarding/page.tsx) has
-- relied on that index ever since to catch the race between two SELECT-then-
-- INSERT onboarding requests: whichever insert loses is expected to hit a
-- unique_violation (SQLSTATE 23505) and reload the row the other one created.
--
-- A verification pass against a live database proved that expectation false: a
-- second businesses row for a user_id that already had one was inserted with no
-- error. Without direct catalog access (no Postgres connection string or Supabase
-- management/access token was available to run the check) it was not possible
-- from application tooling alone to determine *why* businesses_user_id_idx is
-- ineffective there — missing, non-unique, partial, invalid, or built on
-- different columns are all consistent with what was observed. A database
-- administrator with SQL Editor / catalog access should still run:
--
--   select indexname, indexdef
--   from pg_indexes
--   where schemaname = 'public' and tablename = 'businesses';
--
--   select c.relname as index_name, i.indisunique, i.indisvalid, i.indisready,
--          i.indpred is not null as is_partial,
--          pg_get_indexdef(i.indexrelid) as definition
--   from pg_index i
--   join pg_class c on c.oid = i.indexrelid
--   join pg_class t on t.oid = i.indrelid
--   where t.relname = 'businesses' and t.relnamespace = 'public'::regnamespace;
--
--   select conname, contype, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.businesses'::regclass;
--
--   select user_id, count(*) as business_count
--   from public.businesses
--   group by user_id
--   having count(*) > 1;
--
-- This migration does not guess at or repair *why* businesses_user_id_idx is
-- ineffective, and it does not drop it: a same-named index that turns out to be
-- fine, or that something else depends on, must not be destroyed on the
-- assumption its name means what it says. Instead it:
--   1. Aborts loudly if any user_id already has more than one businesses row.
--      Silently deleting, merging, or picking a "winner" among real owner data
--      is not this migration's decision to make — that needs a human.
--   2. Creates a new, unambiguously-named unique index that actually enforces
--      the invariant, independent of whatever state businesses_user_id_idx is
--      in. A unique index is what Postgres raises 23505 for on a conflicting
--      insert, which is exactly what isDuplicateBusinessError() already matches
--      on — no application change is needed for it to start being caught.
--
-- Not using CREATE INDEX CONCURRENTLY: that cannot run inside a transaction, and
-- this repair intentionally runs as one. The LOCK below has to share that
-- transaction with the duplicate check and the index creation, or a business
-- inserted between the check and the index finishing would slip through
-- uncaught. A plain CREATE INDEX takes a brief ACCESS EXCLUSIVE lock on its own
-- regardless; the explicit LOCK TABLE just closes that gap for the check too.

begin;

lock table public.businesses in share row exclusive mode;

do $$
declare
  dup_count integer;
begin
  select count(*) into dup_count
  from (
    select user_id
    from public.businesses
    group by user_id
    having count(*) > 1
  ) duplicated;

  if dup_count > 0 then
    raise exception
      'Migration 025 aborted: % user_id value(s) already have more than one businesses row. '
      'This migration never deletes, merges, or chooses between them — resolve the duplicates '
      'by hand first, then re-run it. Find them with: '
      'select user_id, count(*) as business_count from public.businesses group by user_id having count(*) > 1;',
      dup_count;
  end if;
end $$;

-- New, deliberately different name — see the header. businesses_user_id_idx
-- (migration 001) is left completely alone.
create unique index if not exists businesses_user_id_unique_idx
  on public.businesses (user_id);

comment on index public.businesses_user_id_unique_idx is
  'Enforces one businesses row per user_id. Added because businesses_user_id_idx '
  '(migration 001) was found, on a live database, not to enforce that — see '
  'migration 025 for the audit that found it and why this index does not replace '
  'or drop that one.';

commit;
