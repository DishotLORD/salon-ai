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
--   3. Verifies its own postcondition against the catalogs before committing.
--      CREATE UNIQUE INDEX IF NOT EXISTS only checks that an object with that
--      name exists — not that it is unique, valid, ready, non-partial,
--      column-based rather than expression-based, single-column, or actually on
--      businesses.user_id. Trusting the name is exactly the class of mistake
--      that produced the live issue this migration exists to fix, so step 3
--      re-reads pg_index/pg_attribute after the CREATE INDEX and aborts, rather
--      than silently completing, if what exists under that name does not
--      actually enforce the invariant. It never rewrites or drops
--      businesses_user_id_unique_idx to make it match — a human has to look at
--      why an index this migration is meant to own doesn't meet its own
--      definition.
--
-- Not using CREATE INDEX CONCURRENTLY: it runs as several internal transactions
-- and cannot be issued inside an explicit transaction block, which this
-- migration intentionally is (see BEGIN/COMMIT below — the duplicate check, the
-- index build and its postcondition check all need to succeed or fail as one
-- unit). A plain CREATE INDEX takes a SHARE lock on the table for its duration —
-- SHARE conflicts with the ROW EXCLUSIVE lock that INSERT/UPDATE/DELETE take, so
-- it already blocks concurrent writes while still allowing concurrent reads; it
-- is not an ACCESS EXCLUSIVE lock, and normal SELECTs are not blocked by it. The
-- explicit LOCK TABLE below takes that same SHARE lock slightly earlier, so the
-- duplicate-row check has the identical write-blocking protection CREATE INDEX
-- would otherwise only start providing once it runs — closing the gap where a
-- business could be inserted between the check and the index build.

begin;

lock table public.businesses in share mode;

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

-- Postcondition: CREATE UNIQUE INDEX IF NOT EXISTS above only guarantees that
-- *something* named businesses_user_id_unique_idx exists — including, on a
-- re-run against a database where an unrelated or damaged object already has
-- that name, something that enforces nothing at all. Confirm from the catalogs,
-- explicitly, that it actually enforces "one businesses row per user_id" before
-- this migration is allowed to succeed. Every failure raises its own exception
-- naming the exact postcondition that did not hold; none of them are repaired
-- automatically.
do $$
declare
  idx_oid oid;
  idx pg_index%rowtype;
  key_attnum int2;
  key_colname name;
begin
  select to_regclass('public.businesses_user_id_unique_idx') into idx_oid;
  if idx_oid is null then
    raise exception
      'Migration 025 postcondition failed: public.businesses_user_id_unique_idx '
      'does not exist after CREATE UNIQUE INDEX IF NOT EXISTS.';
  end if;

  select * into idx from pg_index where indexrelid = idx_oid;
  if not found then
    raise exception
      'Migration 025 postcondition failed: an object named '
      'public.businesses_user_id_unique_idx exists but is not an index '
      '(no matching pg_index row) — it cannot enforce uniqueness.';
  end if;

  if idx.indrelid <> 'public.businesses'::regclass then
    raise exception
      'Migration 025 postcondition failed: public.businesses_user_id_unique_idx '
      'is attached to % instead of public.businesses.', idx.indrelid::regclass;
  end if;

  if not idx.indisunique then
    raise exception
      'Migration 025 postcondition failed: public.businesses_user_id_unique_idx '
      'exists but is not unique (indisunique = false) — it does not enforce the '
      'invariant this migration exists to restore.';
  end if;

  if not idx.indisvalid then
    raise exception
      'Migration 025 postcondition failed: public.businesses_user_id_unique_idx '
      'is marked invalid (indisvalid = false) — typically the leftover of an '
      'index build that failed while running concurrently. It must be dropped '
      'and rebuilt by a human; this migration will not do that automatically.';
  end if;

  if not idx.indisready then
    raise exception
      'Migration 025 postcondition failed: public.businesses_user_id_unique_idx '
      'is not ready for inserts (indisready = false) and will not catch '
      'conflicting writes yet.';
  end if;

  if idx.indpred is not null then
    raise exception
      'Migration 025 postcondition failed: public.businesses_user_id_unique_idx '
      'is a partial index (has a WHERE predicate) and therefore does not '
      'enforce uniqueness across every businesses row.';
  end if;

  if idx.indexprs is not null then
    raise exception
      'Migration 025 postcondition failed: public.businesses_user_id_unique_idx '
      'is built on an expression, not a plain column, and cannot be confirmed '
      'to enforce uniqueness of the literal user_id value.';
  end if;

  if idx.indnkeyatts <> 1 then
    raise exception
      'Migration 025 postcondition failed: public.businesses_user_id_unique_idx '
      'has % key column(s); expected exactly 1.', idx.indnkeyatts;
  end if;

  key_attnum := idx.indkey[0];
  if key_attnum is null or key_attnum = 0 then
    raise exception
      'Migration 025 postcondition failed: public.businesses_user_id_unique_idx '
      'key entry is not a plain table column (attnum = %).', key_attnum;
  end if;

  select attname into key_colname
  from pg_attribute
  where attrelid = idx.indrelid and attnum = key_attnum;

  if key_colname is distinct from 'user_id' then
    raise exception
      'Migration 025 postcondition failed: public.businesses_user_id_unique_idx '
      'is built on column %, not user_id.', coalesce(key_colname::text, '(unknown)');
  end if;

  raise notice
    'Migration 025 postcondition verified: public.businesses_user_id_unique_idx '
    'uniquely, validly and readily enforces businesses(user_id).';
end $$;

comment on index public.businesses_user_id_unique_idx is
  'Enforces one businesses row per user_id. Added because businesses_user_id_idx '
  '(migration 001) was found, on a live database, not to enforce that — see '
  'migration 025 for the audit that found it, the postcondition check that '
  'verifies this index actually does, and why this index does not replace or '
  'drop that one.';

commit;
