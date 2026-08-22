-- Keep the original PDF a menu version was built from.
--
-- Until now a menu version recorded what was extracted and never what it was
-- extracted from. Once OCR had run, the file itself was gone: nobody could
-- check a disputed price against the page the owner actually uploaded, and
-- re-indexing a menu — with a better chunker, a different embedding model, any
-- reason at all — meant asking the restaurant to find and upload it again.
--
-- menu_documents already *is* the version record, so the original binds to it
-- rather than to a second table that would have to be kept in step with it.
--
-- Additive throughout. Existing rows keep null retention metadata and stay
-- valid; only uploads created from here on are required to carry an original.

begin;

-- ─── Retained-original metadata ──────────────────────────────────────────────
--
-- The bytes live in private Storage; these columns say which object, and carry
-- enough to prove it is the file that produced this version.
alter table public.menu_documents
  add column if not exists original_storage_bucket text,
  add column if not exists original_storage_path text,
  add column if not exists original_filename text,
  add column if not exists original_mime_type text,
  add column if not exists original_size_bytes bigint,
  add column if not exists original_sha256 text,
  add column if not exists original_attached_at timestamptz;

/*
 * Whether this version must have an original before it may go live.
 *
 * False for every row that already exists, because their files are genuinely
 * gone and a requirement they cannot satisfy would only make them impossible
 * to work with. begin_menu_indexing sets it true, so the rule applies from the
 * next upload onward without a backfill and without a moment where the old
 * data is invalid.
 */
alter table public.menu_documents
  add column if not exists original_retention_required boolean not null default false;

/*
 * Retention metadata is all of a piece.
 *
 * Half-attached metadata — a path with no digest, a digest with no size — is
 * worse than none: it looks like a retained original to every reader, and
 * nothing can tell which half is missing until someone tries to use it.
 */
alter table public.menu_documents
  drop constraint if exists menu_documents_original_all_or_none;
alter table public.menu_documents
  add constraint menu_documents_original_all_or_none check (
    (
      original_storage_bucket is null
      and original_storage_path is null
      and original_mime_type is null
      and original_size_bytes is null
      and original_sha256 is null
      and original_attached_at is null
    )
    or (
      original_storage_bucket is not null
      and original_storage_path is not null
      and original_mime_type is not null
      and original_size_bytes is not null
      and original_sha256 is not null
      and original_attached_at is not null
    )
  );

/*
 * And when it is present, it has to describe a real PDF.
 *
 * A zero-byte object, an uppercase or truncated digest, a mime type from some
 * other pipeline: each would pass unnoticed and each makes the record useless
 * for the one thing it exists for — proving this file is that version.
 */
alter table public.menu_documents
  drop constraint if exists menu_documents_original_shape;
alter table public.menu_documents
  add constraint menu_documents_original_shape check (
    original_storage_path is null
    or (
      original_storage_bucket = 'menu-pdfs'
      and original_mime_type = 'application/pdf'
      and original_size_bytes > 0
      and original_sha256 ~ '^[0-9a-f]{64}$'
      -- The path is derived from identity, never from a filename. Checking the
      -- shape here means a row cannot point at another tenant's object even if
      -- something upstream built the path wrongly.
      and original_storage_path = business_id::text || '/' || id::text || '/original.pdf'
    )
  );

/*
 * A version that was required to keep its original may not go live without one.
 *
 * Enforced in the table as well as in activate_menu_document, because this is
 * the invariant that decides whether history is trustworthy: one published
 * version with no original and the guarantee is no longer a guarantee.
 * 'indexing' and 'failed' are exempt — the first has not finished, the second
 * never will.
 */
alter table public.menu_documents
  drop constraint if exists menu_documents_retention_satisfied;
alter table public.menu_documents
  add constraint menu_documents_retention_satisfied check (
    original_retention_required = false
    or status in ('indexing', 'failed')
    or original_storage_path is not null
  );

-- One row per stored object, so a path cannot be claimed twice.
create unique index if not exists menu_documents_original_path_idx
  on public.menu_documents (original_storage_bucket, original_storage_path)
  where original_storage_path is not null;

-- ─── Private bucket ──────────────────────────────────────────────────────────
--
-- Not public, and it must never become public: these are whole restaurant
-- menus belonging to paying customers, and a public bucket makes every one of
-- them enumerable by anyone who guesses a business id.
--
-- No storage.objects policies are created for anon or authenticated at all, so
-- the only key that can read or write here is the service role, from the
-- server. Downloads, when they exist, will go through a signed URL minted by an
-- endpoint that has already checked ownership.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-pdfs', 'menu-pdfs', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── The lease now requires an original ──────────────────────────────────────
--
-- Unchanged apart from the flag: the row is still created before extraction,
-- because it is the lease that stops a DELETE landing mid-upload.
create or replace function public.begin_menu_indexing(
  p_business_id uuid
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
    update public.menu_documents
       set status = 'failed'
     where id = v_existing.id;
  end if;

  -- Every upload from here on keeps its original.
  insert into public.menu_documents (business_id, status, original_retention_required)
  values (p_business_id, 'indexing', true)
  returning id into v_id;

  return v_id;
end;
$$;

-- ─── Attaching the original ──────────────────────────────────────────────────
--
-- Write-once, to the caller's own document, while it is still indexing.
--
-- Immutability is the whole value of the record. A version whose original can
-- be swapped afterwards proves nothing about what was uploaded — the digest
-- would simply describe whichever file was attached last, and the audit trail
-- would be an audit trail of the most recent edit.
create or replace function public.attach_menu_document_original(
  p_document_id uuid,
  p_business_id uuid,
  p_storage_path text,
  p_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text
)
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  v_status text;
  v_required boolean;
  v_existing text;
  v_updated integer;
begin
  if p_mime_type is distinct from 'application/pdf' then
    raise exception 'invalid_mime_type' using errcode = 'P0001';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'invalid_size' using errcode = 'P0001';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_sha256' using errcode = 'P0001';
  end if;
  -- Identity decides the path, so a caller cannot name someone else's object.
  if p_storage_path is distinct from (p_business_id::text || '/' || p_document_id::text || '/original.pdf') then
    raise exception 'invalid_storage_path' using errcode = 'P0001';
  end if;

  -- The tenant predicate is part of the lookup, not a check afterwards: a
  -- document id belonging to another venue simply does not exist here.
  select status, original_retention_required, original_storage_path
    into v_status, v_required, v_existing
    from public.menu_documents
   where id = p_document_id and business_id = p_business_id;

  if v_status is null then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'indexing' then
    raise exception 'document_not_indexing' using errcode = 'P0001';
  end if;
  if v_required is not true then
    raise exception 'retention_not_required' using errcode = 'P0001';
  end if;
  if v_existing is not null then
    raise exception 'original_already_attached' using errcode = 'P0001';
  end if;

  update public.menu_documents
     set original_storage_bucket = 'menu-pdfs',
         original_storage_path = p_storage_path,
         original_filename = nullif(btrim(coalesce(p_filename, '')), ''),
         original_mime_type = p_mime_type,
         original_size_bytes = p_size_bytes,
         original_sha256 = p_sha256,
         original_attached_at = now()
   where id = p_document_id
     and business_id = p_business_id
     and status = 'indexing'
     and original_storage_path is null;

  /*
   * The read above and this write are not one step, so two callers can both
   * see a null path and both believe they are first. The loser's guarded UPDATE
   * matches nothing and would otherwise report success for an attachment it did
   * not make. Only whoever actually changed the row may claim it.
   */
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'original_already_attached' using errcode = 'P0001';
  end if;
end;
$$;

-- ─── Activation also refuses a missing original ──────────────────────────────
--
-- Every existing invariant is kept exactly as it was; retention is one more
-- condition, not a replacement for any of them.
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
  v_source text;
  v_char_count integer;
  v_total integer;
  v_missing integer;
  v_required boolean;
  v_original text;
begin
  select id into v_lock from public.businesses where id = p_business_id for update;
  if v_lock is null then
    raise exception 'business_not_found' using errcode = 'P0002';
  end if;

  select status, source, char_count, original_retention_required, original_storage_path
    into v_status, v_source, v_char_count, v_required, v_original
    from public.menu_documents
   where id = p_document_id and business_id = p_business_id;

  if v_status is null then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'indexing' then
    raise exception 'document_not_indexing' using errcode = 'P0001';
  end if;

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

  if v_source is null then
    raise exception 'missing_source' using errcode = 'P0001';
  end if;
  if v_char_count is null then
    raise exception 'missing_char_count' using errcode = 'P0001';
  end if;

  -- New in 028: a version required to keep its original cannot go live without
  -- one, or the history it promises has a hole in it from day one.
  if v_required is true and v_original is null then
    raise exception 'missing_original' using errcode = 'P0001';
  end if;

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

-- ─── Version history, metadata only ──────────────────────────────────────────
--
-- Returns what a version *is*, never what it says. No chunk text, no menu text,
-- no embeddings, no object bytes and no URL of any kind — a listing that hands
-- back a link is a listing that grants access, and access belongs to a separate
-- endpoint that can decide it deliberately.
create or replace function public.menu_document_history(p_business_id uuid)
returns table (
  id uuid,
  status text,
  source text,
  char_count integer,
  created_at timestamptz,
  activated_at timestamptz,
  superseded_at timestamptz,
  original_filename text,
  original_size_bytes bigint,
  original_sha256 text,
  original_attached_at timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  select d.id,
         d.status,
         d.source,
         d.char_count,
         d.created_at,
         d.activated_at,
         d.superseded_at,
         d.original_filename,
         d.original_size_bytes,
         d.original_sha256,
         d.original_attached_at
    from public.menu_documents d
   where d.business_id = p_business_id
   order by d.created_at desc
$$;

-- ─── Privileges ──────────────────────────────────────────────────────────────
--
-- Same boundary as the rest of the lifecycle: these take a business id and are
-- reached only from the server, after ownership has been checked. Granting them
-- to `authenticated` would hand any signed-in user another venue's menu history
-- — or its retained originals — by changing one argument.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.begin_menu_indexing(uuid)',
    'public.activate_menu_document(uuid, uuid, integer, text)',
    'public.attach_menu_document_original(uuid, uuid, text, text, text, bigint, text)',
    'public.menu_document_history(uuid)'
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
