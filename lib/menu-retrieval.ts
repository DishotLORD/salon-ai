/**
 * Retrieve a small, tenant-scoped view of the active indexed menu for chat.
 *
 * Retrieval is deliberately fail-open to the legacy menu text at the call site:
 * an unavailable embedding API or database function must not take a venue's
 * menu away from guests. The database RPC remains the tenant boundary; this
 * module makes that boundary explicit in every callback argument.
 */

export const MENU_QUERY_EMBEDDING_MODEL = 'text-embedding-3-small'
export const MENU_QUERY_EMBEDDING_DIMENSIONS = 1536
export const MENU_QUERY_EMBEDDING_TIMEOUT_MS = 10_000
export const MENU_RETRIEVAL_TOP_K = 8
export const MENU_CONTEXT_MAX_CHARS = 6_000

export type MenuQueryEmbeddingClient = {
  embeddings: {
    create: (
      args: {
        model: string
        input: string
        dimensions: number
        encoding_format: 'float'
      },
      options?: { signal?: AbortSignal; maxRetries?: number },
    ) => Promise<{ data: { embedding: number[] }[] }>
  }
}

export type RetrievedMenuChunk = {
  id: string
  document_id: string
  ordinal: number
  section: string | null
  content: string
  similarity: number
}

export type MenuRetrievalFallbackReason =
  | 'no_active_document'
  | 'active_document_lookup_failed'
  | 'embedding_failed'
  | 'embedding_timeout'
  | 'rpc_failed'
  | 'empty_retrieval'

export type MenuRetrievalResult =
  | {
      kind: 'retrieved'
      context: string
      chunks: RetrievedMenuChunk[]
    }
  | {
      kind: 'legacy'
      reason: MenuRetrievalFallbackReason
    }

type QueryEmbeddingResult =
  | { ok: true; embedding: number[] }
  | { ok: false; reason: 'failed' | 'timeout' }

export type FindActiveMenuDocument = (
  verifiedBusinessId: string,
) => Promise<{ id: string } | null>

export type MatchActiveMenuChunks = (params: {
  verifiedBusinessId: string
  queryEmbedding: number[]
  matchCount: number
}) => Promise<RetrievedMenuChunk[]>

/** One real HTTP attempt. The chat rate limits are the admission policy. */
export async function embedMenuQuery(
  client: MenuQueryEmbeddingClient,
  query: string,
  timeoutMs = MENU_QUERY_EMBEDDING_TIMEOUT_MS,
): Promise<QueryEmbeddingResult> {
  const input = query.trim()
  if (!input) return { ok: false, reason: 'failed' }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await client.embeddings.create(
      {
        model: MENU_QUERY_EMBEDDING_MODEL,
        input,
        dimensions: MENU_QUERY_EMBEDDING_DIMENSIONS,
        encoding_format: 'float',
      },
      {
        signal: controller.signal,
        // The SDK retries by default. Retrieval has no second, hidden spending
        // loop: a failure returns the route to businesses.menu_pdf_text.
        maxRetries: 0,
      },
    )
    const embedding = response?.data?.[0]?.embedding
    if (
      !Array.isArray(embedding) ||
      embedding.length !== MENU_QUERY_EMBEDDING_DIMENSIONS
    ) {
      return { ok: false, reason: 'failed' }
    }
    return { ok: true, embedding }
  } catch {
    return { ok: false, reason: timedOut ? 'timeout' : 'failed' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Format only the RPC's first Top-K rows, preserving each included section and
 * content in full. If the next whole block would cross the budget, stop there;
 * do not truncate it and do not fetch a lower-ranked replacement to fill space.
 */
export function buildRetrievedMenuContext(
  chunks: RetrievedMenuChunk[],
  options: { topK?: number; maxChars?: number } = {},
): { context: string; chunks: RetrievedMenuChunk[] } {
  const topK = options.topK ?? MENU_RETRIEVAL_TOP_K
  const maxChars = options.maxChars ?? MENU_CONTEXT_MAX_CHARS
  const blocks: string[] = []
  const included: RetrievedMenuChunk[] = []
  const ids = new Set<string>()
  const ordinals = new Set<string>()
  let length = 0

  for (const chunk of chunks.slice(0, Math.max(0, topK))) {
    if (!chunk || typeof chunk.content !== 'string' || !chunk.content.trim()) {
      continue
    }
    const idKey = chunk.id.trim()
    const ordinalKey = `${chunk.document_id}:${chunk.ordinal}`
    if ((idKey && ids.has(idKey)) || ordinals.has(ordinalKey)) continue

    const header = chunk.section
      ? `MENU EXCERPT — SECTION: ${chunk.section}`
      : 'MENU EXCERPT — SECTION: Unspecified'
    const block = `${header}\n${chunk.content}`
    const separatorLength = blocks.length > 0 ? 2 : 0
    if (length + separatorLength + block.length > Math.max(0, maxChars)) break

    blocks.push(block)
    included.push(chunk)
    length += separatorLength + block.length
    if (idKey) ids.add(idKey)
    ordinals.add(ordinalKey)
  }

  return { context: blocks.join('\n\n'), chunks: included }
}

/**
 * Active-document lookup happens first so a venue without migration/backfill
 * does not pay for an embedding it cannot use.
 */
export async function retrieveMenuContext(params: {
  client: MenuQueryEmbeddingClient
  verifiedBusinessId: string
  query: string
  findActiveDocument: FindActiveMenuDocument
  matchChunks: MatchActiveMenuChunks
  timeoutMs?: number
}): Promise<MenuRetrievalResult> {
  let active: { id: string } | null
  try {
    active = await params.findActiveDocument(params.verifiedBusinessId)
  } catch {
    return { kind: 'legacy', reason: 'active_document_lookup_failed' }
  }
  if (!active?.id) return { kind: 'legacy', reason: 'no_active_document' }

  const embedded = await embedMenuQuery(
    params.client,
    params.query,
    params.timeoutMs,
  )
  if (!embedded.ok) {
    return {
      kind: 'legacy',
      reason:
        embedded.reason === 'timeout'
          ? 'embedding_timeout'
          : 'embedding_failed',
    }
  }

  let chunks: RetrievedMenuChunk[]
  try {
    chunks = await params.matchChunks({
      verifiedBusinessId: params.verifiedBusinessId,
      queryEmbedding: embedded.embedding,
      matchCount: MENU_RETRIEVAL_TOP_K,
    })
  } catch {
    return { kind: 'legacy', reason: 'rpc_failed' }
  }

  const bounded = buildRetrievedMenuContext(chunks)
  if (!bounded.context || bounded.chunks.length === 0) {
    return { kind: 'legacy', reason: 'empty_retrieval' }
  }
  return { kind: 'retrieved', ...bounded }
}

/** The prompt gets exactly one unstructured menu source. */
export function selectMenuPromptSources(
  legacyMenuText: string | null | undefined,
  retrieval: MenuRetrievalResult,
): { legacyMenuText: string | null; retrievedMenuContext: string | null } {
  if (retrieval.kind === 'retrieved') {
    return {
      legacyMenuText: null,
      retrievedMenuContext: retrieval.context,
    }
  }
  return {
    legacyMenuText: legacyMenuText?.trim() ? legacyMenuText : null,
    retrievedMenuContext: null,
  }
}

/** Rules shared by structured services, the legacy menu and retrieved excerpts. */
export function menuEvidenceSafetyRules(usingRetrievedContext: boolean): string {
  const partial = usingRetrievedContext
    ? `\n- RETRIEVED MENU EXCERPTS are a partial Top-K view of the active menu, not the whole menu. Absence from these excerpts is NEVER proof that a dish, ingredient, allergen, option, or claim is absent from the full menu.`
    : ''
  return `MENU EVIDENCE SAFETY (mandatory):${partial}
- For a question like "Do you have X?", say you could not confirm it when the menu evidence does not explicitly answer. Never answer "No" merely because X is missing from the supplied menu context.
- Never call a dish safe, allergen-free, allergy-friendly, or suitable for a person with an allergy unless the supplied menu text explicitly confirms that safety claim. A missing allergen name is not confirmation.
- When safety is not explicitly confirmed, say the menu does not confirm it and the guest must check with restaurant staff. Never invent ingredients, preparation practices, substitutions, or cross-contamination controls.`
}
