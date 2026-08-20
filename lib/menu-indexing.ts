/**
 * Turn menu chunks into embeddings, in bounded work with bounded failure.
 *
 * Everything here is shaped by one rule: a menu is either fully indexed or the
 * venue keeps the menu it already had. There is no partial success to report,
 * because a menu missing its second half looks complete to a guest asking about
 * a dish that is no longer in it.
 */

import type { MenuChunk } from '@/lib/menu-chunking'

/** 1536 dimensions by default, 8192 input tokens per item (OpenAI, Embeddings). */
export const MENU_EMBEDDING_MODEL = 'text-embedding-3-small'
export const MENU_EMBEDDING_DIMENSIONS = 1536

/**
 * Chunks per embedding request.
 *
 * The API documents a per-input ceiling of 8192 tokens but not a per-request
 * array limit, so this is chosen from what is known rather than from a limit to
 * push against: a chunk is at most MENU_CHUNK_MAX_CHARS (1600) characters,
 * roughly 400 tokens, so 96 of them is about 38k tokens in one call — well
 * inside any plausible cap, and few enough requests that a large menu still
 * finishes inside the route's own budget.
 */
export const MENU_EMBEDDING_BATCH_SIZE = 96

/** Per attempt. Several attempts still have to fit the phase budget below. */
export const MENU_EMBEDDING_TIMEOUT_MS = 30_000

/**
 * The whole embedding phase, not one batch of it.
 *
 * Per-batch bounds alone do not bound the total: twenty batches that each
 * finish just inside their timeout still run far past the route's own
 * `maxDuration` of 120 seconds, and the platform kills the invocation
 * mid-flight — leaving a document stuck in `indexing` that nothing marked
 * failed, so the venue is locked out until the stale window expires.
 *
 * 70 seconds leaves ~50 for everything after: retiring the document, returning
 * a response the owner can act on, and the request overhead either side.
 */
export const MENU_EMBEDDING_TOTAL_BUDGET_MS = 70_000

/** Transient failures only, and a fixed number of them. */
export const MENU_EMBEDDING_MAX_RETRIES = 2

/**
 * Chunks one upload may index synchronously.
 *
 * Measured rather than guessed: a generated 100-page menu (71,843 characters,
 * 1,300 lines) chunks to roughly 100 chunks, and the whole parse costs about
 * half a second of the route's 120. 1500 is therefore ~15× the largest menu
 * anyone has actually put through this, which covers the 50–100+ page documents
 * the product must support while still refusing the pathological upload that
 * would spend a venue's budget and time on work no request can finish.
 */
export const MENU_MAX_CHUNKS_SYNC = 1500

/** Indexing attempts per venue per hour; mirrors the OCR budget's shape. */
export const MENU_INDEX_LIMIT_PER_HOUR = 12
export const MENU_INDEX_WINDOW_MS = 3_600_000

/**
 * Keyed on a business id that has already been loaded from the database, never
 * on request input — the same rule the chat limiter follows, and for the same
 * reason: a key built from an unverified string is a key space the caller owns.
 */
export function menuIndexRateLimitKey(verifiedBusinessId: string): string {
  return `menu-index:${verifiedBusinessId}`
}

/**
 * Deliberately does not suggest splitting the menu across uploads, for the same
 * reason PR #18's refusals do not: a venue has one `businesses.menu_pdf_text`,
 * so a second upload replaces the first rather than adding to it. Telling an
 * owner otherwise talks them into deleting their food menu with their drinks
 * list.
 */
export const MENU_TOO_LARGE_MESSAGE =
  'This menu is too large to index in one request. Nothing was saved and your current menu is ' +
  'unchanged. Get in touch and we will index it for you.'

export const MENU_INDEX_BUSY_MESSAGE =
  'This menu is still being processed. Nothing was saved and your current menu is unchanged. ' +
  'Give it a moment and try again.'

export const MENU_INDEX_FAILED_MESSAGE =
  'We could not finish reading this menu. Nothing was saved and your current menu is unchanged. ' +
  'Please try again in a few minutes.'

// ─── Batching ────────────────────────────────────────────────────────────────

export function batchChunks<T>(items: T[], size = MENU_EMBEDDING_BATCH_SIZE): T[][] {
  if (size < 1) throw new Error('batch size must be at least 1')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * The client shape this module needs — an OpenAI instance satisfies it.
 *
 * The second argument is the SDK's per-request options, and both fields it
 * carries here are load-bearing rather than decorative. See `embedMenuChunks`.
 */
export type EmbeddingRequestOptions = {
  signal?: AbortSignal
  maxRetries?: number
}

export type EmbeddingClient = {
  embeddings: {
    create: (
      args: { model: string; input: string[] },
      options?: EmbeddingRequestOptions,
    ) => Promise<{ data: { embedding: number[] }[] }>
  }
}

export type EmbedResult =
  | { ok: true; embeddings: number[][] }
  | { ok: false; reason: 'timeout' | 'failed' }

/**
 * Retry only what retrying can fix.
 *
 * A timeout or a dropped connection is worth another attempt; a 400 saying the
 * input is malformed will say the same thing three times, and the wait is
 * charged to the owner staring at a spinner.
 */
function isTransient(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const status = (err as { status?: number }).status
    if (typeof status === 'number') return status === 429 || status >= 500
    const name = (err as { name?: string }).name
    if (name === 'TimeoutError' || name === 'AbortError') return true
  }
  return err instanceof TypeError // fetch-level network failure
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Embed every chunk, or report why not.
 *
 * Batches run in sequence rather than in parallel: a menu is not urgent enough
 * to be worth several concurrent requests against a rate-limited API, and
 * sequential work fails in a place that is easy to reason about.
 */
export async function embedMenuChunks(
  client: EmbeddingClient,
  chunks: MenuChunk[],
  options: {
    batchSize?: number
    timeoutMs?: number
    maxRetries?: number
    totalBudgetMs?: number
    now?: () => number
    onBatch?: (index: number, total: number) => void
  } = {},
): Promise<EmbedResult> {
  const batchSize = options.batchSize ?? MENU_EMBEDDING_BATCH_SIZE
  const attemptTimeoutMs = options.timeoutMs ?? MENU_EMBEDDING_TIMEOUT_MS
  const maxRetries = options.maxRetries ?? MENU_EMBEDDING_MAX_RETRIES
  const totalBudgetMs = options.totalBudgetMs ?? MENU_EMBEDDING_TOTAL_BUDGET_MS
  const now = options.now ?? Date.now

  const batches = batchChunks(chunks, batchSize)
  const embeddings: number[][] = []
  const deadline = now() + totalBudgetMs

  for (let b = 0; b < batches.length; b++) {
    options.onBatch?.(b, batches.length)
    const input = batches[b].map((c) => c.content)
    let done = false

    for (let attempt = 0; attempt <= maxRetries && !done; attempt++) {
      const remaining = deadline - now()
      // The phase budget outranks the per-attempt one: starting a request that
      // cannot finish inside it only guarantees the invocation is killed with
      // work in flight.
      if (remaining <= 0) return { ok: false, reason: 'timeout' }
      const budget = Math.min(attemptTimeoutMs, remaining)

      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        // Cancels the request itself. A raced promise leaves the original in
        // flight, so a timed-out batch and its retry ran at once — two live
        // requests for the same work, and the first one still billable.
        controller.abort()
      }, budget)

      try {
        const res = await client.embeddings.create(
          { model: MENU_EMBEDDING_MODEL, input },
          {
            signal: controller.signal,
            // The SDK retries twice on its own by default, which would have
            // made "at most 2 retries" mean up to nine HTTP attempts per batch
            // and blown any deadline computed here. One retry loop, this one.
            maxRetries: 0,
          },
        )
        const vectors = res?.data?.map((d) => d.embedding)
        // A short or malformed reply is not a partial success to paper over —
        // activation would reject it anyway, and later is a worse place to fail.
        if (!Array.isArray(vectors) || vectors.length !== input.length) {
          return { ok: false, reason: 'failed' }
        }
        for (const v of vectors) {
          if (!Array.isArray(v) || v.length !== MENU_EMBEDDING_DIMENSIONS) {
            return { ok: false, reason: 'failed' }
          }
        }
        embeddings.push(...vectors)
        done = true
      } catch (err) {
        // Reached only once the aborted request has actually rejected, so no
        // abandoned call outlives this attempt.
        const isOurTimeout = timedOut
        if (isOurTimeout && now() >= deadline) return { ok: false, reason: 'timeout' }
        if (attempt === maxRetries || !(isOurTimeout || isTransient(err))) {
          // Never the message, the key, or the vectors — only that it failed.
          console.error('[menu-index] embedding batch failed after', attempt + 1, 'attempt(s)')
          return { ok: false, reason: isOurTimeout ? 'timeout' : 'failed' }
        }
        const backoff = Math.min(250 * (attempt + 1), Math.max(0, deadline - now()))
        if (backoff > 0) await sleep(backoff)
      } finally {
        clearTimeout(timer)
      }
    }
  }

  return embeddings.length === chunks.length
    ? { ok: true, embeddings }
    : { ok: false, reason: 'failed' }
}

/** Rows for `menu_chunks`, with the ownership fields fixed by the server. */
export function buildChunkRows(
  chunks: MenuChunk[],
  embeddings: number[][],
  verifiedBusinessId: string,
  documentId: string,
): {
  business_id: string
  document_id: string
  ordinal: number
  section: string | null
  content: string
  embedding: string
}[] {
  if (chunks.length !== embeddings.length) {
    throw new Error('chunk/embedding length mismatch')
  }
  return chunks.map((chunk, i) => ({
    // Both taken from the server's own values, never from anything a caller
    // sent — the composite foreign key then makes a mismatch unrepresentable.
    business_id: verifiedBusinessId,
    document_id: documentId,
    ordinal: chunk.ordinal,
    section: chunk.section,
    content: chunk.content,
    // pgvector accepts its own text form over PostgREST.
    embedding: `[${embeddings[i].join(',')}]`,
  }))
}

/** Rows per insert. Keeps one request from carrying megabytes of vectors. */
export const MENU_CHUNK_INSERT_BATCH = 100
