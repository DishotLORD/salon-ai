-- Exact, server-only menu chunk retrieval for guest chat.
--
-- This is intentionally an exact cosine scan. A venue has hundreds of chunks,
-- not millions, so an approximate HNSW/IVFFlat index would add tuning and recall
-- trade-offs without useful speed. No similarity threshold is applied until
-- real query/menu pairs can calibrate one empirically.

begin;

create or replace function public.match_menu_chunks(
  p_business_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 8
)
returns table (
  chunk_id uuid,
  document_id uuid,
  ordinal integer,
  section text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    chunks.id as chunk_id,
    chunks.document_id,
    chunks.ordinal,
    chunks.section,
    chunks.content,
    1 - (chunks.embedding <=> p_query_embedding) as similarity
  from public.menu_chunks as chunks
  inner join public.menu_documents as documents
    on documents.id = chunks.document_id
   and documents.business_id = chunks.business_id
  where chunks.business_id = p_business_id
    and documents.business_id = p_business_id
    and documents.status = 'active'
    and chunks.embedding is not null
  order by chunks.embedding <=> p_query_embedding, chunks.ordinal
  limit least(greatest(coalesce(p_match_count, 8), 0), 50)
$$;

revoke all on function public.match_menu_chunks(uuid, extensions.vector, integer) from public;
revoke all on function public.match_menu_chunks(uuid, extensions.vector, integer) from anon;
revoke all on function public.match_menu_chunks(uuid, extensions.vector, integer) from authenticated;
grant execute on function public.match_menu_chunks(uuid, extensions.vector, integer) to service_role;

commit;
