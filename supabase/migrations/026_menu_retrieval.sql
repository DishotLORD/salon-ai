-- Menu retrieval foundation: versioned menu documents and their embedded chunks.
--
-- Nothing reads these yet. The chat route keeps using businesses.menu_pdf_text
-- exactly as before; this migration only creates the representation a later
-- change will read from, so the schema can land and be verified on its own.
--
-- Additive throughout. businesses.menu_pdf_text and services are untouched, and
-- a deployment that never calls the new functions behaves as it does today.

begin;

create extension if not exists vector with schema extensions;

-- ─── Documents ───────────────────────────────────────────────────────────────
--
-- One row per uploaded menu version. `status` is the whole point: a menu being
-- indexed must be invisible until every chunk of it exists and carries an
-- embedding, because a half-indexed menu answering guest questions is worse
-- than no menu at all.
create table if not exists public.menu_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  status text not null check (status in ('indexing', 'active', 'failed', 'superseded')),
  source text not null check (source in ('pdf_text', 'pdf_ocr', 'legacy_backfill')),
  char_count integer not null check (char_count >= 0),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  superseded_at timestamptz,
  -- Target for the composite foreign key below. It lets a chunk name the
  -- (document, business) pair rather than the document alone.
  unique (id, business_id)
);

create index if not exists menu_documents_business_status_idx
  on public.menu_documents (business_id, status);

-- A venue has one live menu. Enforced here rather than in the application,
-- because "two active menus" is the state from which no correct answer exists.
create unique index if not exists menu_documents_one_active
  on public.menu_documents (business_id)
  where status = 'active';

-- And one indexing job at a time. Two concurrent uploads would otherwise race
-- to activate, and the loser's chunks would linger against a superseded row.
create unique index if not exists menu_documents_one_indexing
  on public.menu_documents (business_id)
  where status = 'indexing';

-- ─── Chunks ──────────────────────────────────────────────────────────────────
--
-- business_id is duplicated here on purpose: retrieval filters on it and RLS
-- reads it, and neither should have to join to find out who a chunk belongs to.
-- The composite foreign key is what stops that duplication from ever
-- disagreeing with the document — a chunk cannot claim a business other than
-- its document's, because no such parent row exists to reference.
create table if not exists public.menu_chunks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  document_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  section text,
  content text not null check (length(btrim(content)) > 0),
  embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  unique (document_id, ordinal),
  foreign key (document_id, business_id)
    references public.menu_documents (id, business_id)
    on delete cascade
);

create index if not exists menu_chunks_document_ordinal_idx
  on public.menu_chunks (document_id, ordinal);
create index if not exists menu_chunks_business_idx
  on public.menu_chunks (business_id);

-- No vector index yet. A restaurant has hundreds of chunks, not millions, so an
-- exact scan is both faster and exactly right; HNSW would trade correctness for
-- a speed-up that is not needed and would have to be tuned and rebuilt.

-- ─── RLS ─────────────────────────────────────────────────────────────────────
--
-- Read-only for the dashboard, and read-only on purpose.
--
-- `for all to authenticated` would let an owner write these tables directly:
-- insert a chunk, or flip a document's status to 'active' — bypassing
-- begin_menu_indexing, the row lock, the chunk count and the embedding check
-- that activation exists to perform. Owning a venue is permission to see its
-- index, not to publish a menu that was never embedded. Every write comes from
-- the server through the functions below.
--
-- No anon policy, and no `using (true)`: the widget reads menu data through the
-- server, and migration 021 removed the last such policies for exactly this
-- reason.
alter table public.menu_documents enable row level security;
alter table public.menu_chunks enable row level security;

drop policy if exists "menu_documents_owner_all" on public.menu_documents;
drop policy if exists "menu_documents_owner_select" on public.menu_documents;
create policy "menu_documents_owner_select" on public.menu_documents
  for select to authenticated
  using (business_id in (select public.accessible_business_ids()));

drop policy if exists "menu_chunks_owner_all" on public.menu_chunks;
drop policy if exists "menu_chunks_owner_select" on public.menu_chunks;
create policy "menu_chunks_owner_select" on public.menu_chunks
  for select to authenticated
  using (business_id in (select public.accessible_business_ids()));

-- ─── Lifecycle functions ─────────────────────────────────────────────────────
--
-- Server-only. Each is called with the service role after the application has
-- already verified that the caller owns the business, so none of them needs
-- SECURITY DEFINER — the service role bypasses RLS on its own, and DEFINER here
-- would only add a way for a business_id parameter to become a tenant escape if
-- the grants were ever loosened. They are SECURITY INVOKER (the default), and
-- the grants at the bottom of this file are the actual boundary.

-- How long an indexing document may sit before a new upload may replace it.
-- The upload route's own ceiling is 120 seconds (maxDuration), so anything
-- older than this cannot still be running; ten minutes is deliberately far
-- above that, because reclaiming a job that is still working would let two
-- indexers write chunks for one venue.
create or replace function public.menu_indexing_stale_after()
returns interval
language sql
immutable
set search_path = public, extensions
as $$ select interval '10 minutes' $$;

-- Open an indexing job, or refuse because one is already open.
--
-- Returns the new document id. Raises 'menu_processing' when a live job exists,
-- which the route turns into a 409 rather than a generic failure.
create or replace function public.begin_menu_indexing(
  p_business_id uuid,
  p_source text,
  p_char_count integer
)
returns uuid
language plpgsql
set search_path = public, extensions
as $$
declare
  v_lock uuid;
  v_existing public.menu_documents%rowtype;
  v_id uuid;
begin
  -- Serialize every lifecycle operation for this venue on its own row. Two
  -- uploads arriving together queue here instead of racing to activate.
  select id into v_lock from public.businesses where id = p_business_id for update;
  if v_lock is null then
    raise exception 'business_not_found' using errcode = 'P0002';
  end if;

  select * into v_existing
    from public.menu_documents
   where business_id = p_business_id and status = 'indexing'
   limit 1;

  if found then
    if v_existing.created_at > now() - public.menu_indexing_stale_after() then
      raise exception 'menu_processing' using errcode = 'P0001';
    end if;
    -- Older than any request could still be running: the process died. Retire
    -- it so this upload can proceed, rather than blocking the venue forever.
    update public.menu_documents
       set status = 'failed'
     where id = v_existing.id;
  end if;

  insert into public.menu_documents (business_id, status, source, char_count)
  values (p_business_id, 'indexing', p_source, p_char_count)
  returning id into v_id;

  return v_id;
end;
$$;

-- Publish an indexed document, and move the legacy text with it.
--
-- Both halves in one transaction on purpose. Writing businesses.menu_pdf_text
-- separately is how a venue ends up with two current menus: the owner sees the
-- new text in Settings while retrieval still serves the old document, or the
-- reverse. Either way somebody is reading a menu nobody uploaded.
create or replace function public.activate_menu_document(
  p_document_id uuid,
  p_business_id uuid,
  p_expected_chunks integer,
  p_menu_text text
)
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  v_lock uuid;
  v_status text;
  v_char_count integer;
  v_total integer;
  v_missing integer;
begin
  select id into v_lock from public.businesses where id = p_business_id for update;
  if v_lock is null then
    raise exception 'business_not_found' using errcode = 'P0002';
  end if;

  select status, char_count into v_status, v_char_count
    from public.menu_documents
   where id = p_document_id and business_id = p_business_id;

  if v_status is null then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'indexing' then
    raise exception 'document_not_indexing' using errcode = 'P0001';
  end if;

  -- Counted here rather than trusted from the caller. A stored chunk_count is a
  -- number the application maintains, and the one thing worth checking is
  -- whether the rows are actually there.
  select count(*), count(*) filter (where embedding is null)
    into v_total, v_missing
    from public.menu_chunks
   where document_id = p_document_id and business_id = p_business_id;

  if v_total = 0 then
    raise exception 'no_chunks' using errcode = 'P0001';
  end if;
  if v_total <> p_expected_chunks then
    raise exception 'chunk_count_mismatch' using errcode = 'P0001';
  end if;
  if v_missing > 0 then
    raise exception 'chunk_missing_embedding' using errcode = 'P0001';
  end if;

  -- One more proof that the legacy text being published is the same upload the
  -- document describes. Without it, a caller could activate document A while
  -- writing the text of upload B, and the two representations would disagree
  -- from the moment they went live.
  if p_menu_text is null or length(btrim(p_menu_text)) = 0 then
    raise exception 'empty_menu_text' using errcode = 'P0001';
  end if;
  if char_length(p_menu_text) <> v_char_count then
    raise exception 'menu_text_length_mismatch' using errcode = 'P0001';
  end if;

  update public.menu_documents
     set status = 'superseded', superseded_at = now()
   where business_id = p_business_id and status = 'active';

  update public.menu_documents
     set status = 'active', activated_at = now()
   where id = p_document_id;

  update public.businesses
     set menu_pdf_text = p_menu_text
   where id = p_business_id;
end;
$$;

-- Remove the uploaded menu.
--
-- Refuses while a live indexing job exists. Otherwise: DELETE clears the text,
-- the in-flight upload finishes and activates, and the menu the owner just
-- deleted is back — with no one having asked for it.
create or replace function public.delete_active_menu(p_business_id uuid)
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  v_lock uuid;
  v_indexing timestamptz;
begin
  select id into v_lock from public.businesses where id = p_business_id for update;
  if v_lock is null then
    raise exception 'business_not_found' using errcode = 'P0002';
  end if;

  select created_at into v_indexing
    from public.menu_documents
   where business_id = p_business_id and status = 'indexing'
   limit 1;

  if v_indexing is not null and v_indexing > now() - public.menu_indexing_stale_after() then
    raise exception 'menu_processing' using errcode = 'P0001';
  end if;

  update public.menu_documents
     set status = 'superseded', superseded_at = now()
   where business_id = p_business_id and status in ('active', 'indexing');

  update public.businesses
     set menu_pdf_text = null
   where id = p_business_id;
end;
$$;

-- Abandon an indexing job whose upload failed, so the venue is not locked out
-- for the stale window. Never touches the active document.
create or replace function public.fail_menu_document(
  p_document_id uuid,
  p_business_id uuid
)
returns void
language plpgsql
set search_path = public, extensions
as $$
begin
  update public.menu_documents
     set status = 'failed'
   where id = p_document_id
     and business_id = p_business_id
     and status = 'indexing';
end;
$$;

-- ─── Privileges ──────────────────────────────────────────────────────────────
--
-- These take a business_id parameter and are reached only from the server,
-- after ownership has been checked. Granting them to `authenticated` would hand
-- any signed-in user another venue's menu lifecycle by changing one argument —
-- the shape of hole migration 021 was written to close.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.begin_menu_indexing(uuid, text, integer)',
    'public.activate_menu_document(uuid, uuid, integer, text)',
    'public.delete_active_menu(uuid)',
    'public.fail_menu_document(uuid, uuid)',
    'public.menu_indexing_stale_after()'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon', fn);
    execute format('revoke all on function %s from authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

commit;
