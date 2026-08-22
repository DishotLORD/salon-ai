import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  MENU_PDF_BUCKET,
  MENU_PDF_MIME_TYPE,
  MENU_RETENTION_FAILED_MESSAGE,
  menuOriginalStoragePath,
  removeOrphanedOriginal,
  retainOriginalPdf,
  safeOriginalFilename,
  sha256Hex,
  type MenuStorageClient,
} from '../lib/menu-pdf-retention.ts'

const ROUTE = readFileSync(new URL('../app/api/menu/pdf/route.ts', import.meta.url), 'utf8')
const HISTORY = readFileSync(
  new URL('../app/api/menu/pdf/history/route.ts', import.meta.url),
  'utf8',
)
const SQL = readFileSync(
  new URL('../supabase/migrations/028_menu_pdf_retention.sql', import.meta.url),
  'utf8',
)
/** Statements only: this file's own prose discusses the things it forbids. */
const CODE = SQL.split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n')
const FLAT = CODE.replace(/\s+/g, ' ')

const BIZ = '102ef6e9-0de5-47b3-bf6b-d69f687ca126'
const DOC = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

/** Records what Storage was asked to do, and answers as told. */
function fakeStorage(behaviour: { uploadError?: string; removeError?: string } = {}) {
  const uploads: { bucket: string; path: string; bytes: Buffer; contentType: string; upsert: boolean }[] = []
  const removals: { bucket: string; paths: string[] }[] = []
  const client: MenuStorageClient = {
    storage: {
      from: (bucket) => ({
        upload: async (path, body, options) => {
          uploads.push({ bucket, path, bytes: body, contentType: options.contentType, upsert: options.upsert })
          return { error: behaviour.uploadError ? { message: behaviour.uploadError } : null }
        },
        remove: async (paths) => {
          removals.push({ bucket, paths })
          return { error: behaviour.removeError ? { message: behaviour.removeError } : null }
        },
      }),
    },
  }
  return { client, uploads, removals }
}

const PDF_BYTES = Buffer.from('%PDF-1.7\nsome original menu bytes\n%%EOF\n', 'latin1')

// ─────────────────────────────────────────────────────────────────────────────

describe('the original is stored under an identity-derived path', () => {
  it('uses business and document ids, in that order', () => {
    assert.equal(menuOriginalStoragePath(BIZ, DOC), `${BIZ}/${DOC}/original.pdf`)
  })

  it('the uploaded filename never reaches the path', async () => {
    /*
     * A name comes from the client, and a client-controlled path is a
     * client-controlled place to write. Two venues uploading `menu.pdf` must
     * not collide, and neither must be able to address the other's object.
     */
    const { client, uploads } = fakeStorage()
    await retainOriginalPdf(client, PDF_BYTES, BIZ, DOC)
    assert.equal(uploads[0].path, `${BIZ}/${DOC}/original.pdf`)
    for (const nasty of ['../../etc/passwd', 'menu.pdf', 'a/b/c.pdf']) {
      assert.equal(menuOriginalStoragePath(BIZ, DOC).includes(nasty), false)
    }
  })

  it('the filename is kept as metadata, sanitised for display only', () => {
    assert.equal(safeOriginalFilename('Garage Menu.pdf'), 'Garage Menu.pdf')
    assert.equal(safeOriginalFilename('../../etc/passwd'), 'passwd', 'directories stripped')
    assert.equal(safeOriginalFilename('a\\b\\c.pdf'), 'c.pdf')
    assert.equal(safeOriginalFilename('.'), null)
    assert.equal(safeOriginalFilename('..'), null)
    assert.equal(safeOriginalFilename(''), null)
    assert.equal(safeOriginalFilename(undefined), null)
    assert.equal(safeOriginalFilename('x'.repeat(400))!.length, 255)
  })
})

describe('the retained bytes are the uploaded bytes', () => {
  it('uploads the buffer unchanged, and digests that same buffer', async () => {
    // A retained original that differs from what was uploaded is not evidence
    // of anything, and its digest would attest to our edit.
    const { client, uploads } = fakeStorage()
    const result = await retainOriginalPdf(client, PDF_BYTES, BIZ, DOC)
    assert.equal(result.ok, true)
    assert.ok(uploads[0].bytes.equals(PDF_BYTES), 'bytes are not rewritten')
    assert.equal(result.ok && result.sha256, createHash('sha256').update(PDF_BYTES).digest('hex'))
    assert.equal(result.ok && result.size, PDF_BYTES.length)
  })

  it('the digest is lowercase 64-char hex, as the column requires', () => {
    assert.match(sha256Hex(PDF_BYTES), /^[0-9a-f]{64}$/)
  })

  it('a single changed byte changes the digest', () => {
    const altered = Buffer.from(PDF_BYTES)
    altered[10] = altered[10] ^ 0x01
    assert.notEqual(sha256Hex(altered), sha256Hex(PDF_BYTES))
  })

  it('goes to the private bucket as application/pdf, never overwriting', async () => {
    /*
     * The path contains a document id created fresh for this upload, so an
     * object already being there means something is wrong — a replay, a reused
     * id — and overwriting would replace one version's evidence with another's.
     */
    const { client, uploads } = fakeStorage()
    await retainOriginalPdf(client, PDF_BYTES, BIZ, DOC)
    assert.equal(uploads[0].bucket, MENU_PDF_BUCKET)
    assert.equal(uploads[0].contentType, MENU_PDF_MIME_TYPE)
    assert.equal(uploads[0].upsert, false)
  })

  it('an upload failure is reported, not swallowed', async () => {
    const { client } = fakeStorage({ uploadError: 'network down' })
    assert.deepEqual(await retainOriginalPdf(client, PDF_BYTES, BIZ, DOC), {
      ok: false,
      reason: 'upload_failed',
    })
  })

  it('orphan cleanup removes exactly the one path it was given', async () => {
    const { client, removals } = fakeStorage()
    await removeOrphanedOriginal(client, `${BIZ}/${DOC}/original.pdf`)
    assert.deepEqual(removals, [{ bucket: MENU_PDF_BUCKET, paths: [`${BIZ}/${DOC}/original.pdf`] }])
  })

  it('a failed cleanup does not throw — the upload is already refused', async () => {
    const { client } = fakeStorage({ removeError: 'gone' })
    await removeOrphanedOriginal(client, 'x/y/original.pdf')
  })

  it('never logs the file contents', () => {
    const lib = readFileSync(new URL('../lib/menu-pdf-retention.ts', import.meta.url), 'utf8')
    for (const line of lib.split('\n').filter((l) => /console\./.test(l))) {
      assert.doesNotMatch(line, /bytes|buffer|body|sha256|token|key/i, line.trim())
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the route retains before it interprets, and after it validates', () => {
  const at = (p: RegExp) => ROUTE.search(p)

  it('nothing reaches Storage that the route already knows it will refuse', () => {
    const auth = at(/const check = await verifyOwner\(business_id\)/)
    const size = at(/file\.size > MENU_PDF_MAX_BYTES/)
    const signature = at(/does not look like a PDF/)
    const upload = at(/retainOriginalPdf\(supabaseAdmin, buffer, business_id, documentId\)/)
    for (const [name, i] of Object.entries({ auth, size, signature })) {
      assert.ok(i >= 0 && i < upload, `${name} must precede the upload`)
    }
  })

  it('retains before extraction and OCR, so a failed version keeps its file', () => {
    /*
     * The case where someone most wants the original is the one where the
     * pipeline could not read it.
     */
    const upload = at(/retainOriginalPdf\(supabaseAdmin/)
    for (const [name, p] of [
      ['extraction', /extractPdfTextLayer\(buffer\)/],
      ['OCR', /await ocrPdf\(buffer, ocrBudgetMs\)/],
      ['chunking', /chunkMenuText\(menuText/],
      ['embedding', /embedMenuChunks\(openai/],
      ['activation', /rpc\('activate_menu_document'/],
    ] as const) {
      assert.ok(upload < at(p), `retention must precede ${name}`)
    }
  })

  it('the lease exists first, so the path can name the document', () => {
    assert.ok(at(/rpc\('begin_menu_indexing'/) < at(/retainOriginalPdf\(supabaseAdmin/))
  })

  it('a storage failure releases the lease and changes nothing', () => {
    const block = ROUTE.slice(at(/if \(!retained\.ok\)/), at(/if \(!retained\.ok\)/) + 400)
    assert.match(block, /return release\(NextResponse\.json\(/)
    assert.match(block, /code: 'original_upload_failed'/)
    assert.match(block, /status: 502/)
  })

  it('an attach failure deletes the object it just wrote, then releases', () => {
    const block = ROUTE.slice(at(/if \(attachError\)/), at(/if \(attachError\)/) + 700)
    assert.match(block, /removeOrphanedOriginal\(supabaseAdmin, retained\.path\)/)
    assert.match(block, /return release\(NextResponse\.json\(/)
    assert.match(block, /code: 'original_attach_failed'/)
  })

  it('cleanup happens only for the orphan, never for an attached original', () => {
    // A document that failed later keeps its file; that is the record of what
    // was uploaded, and the failure does not make it untrue.
    const calls = ROUTE.match(/removeOrphanedOriginal\(/g) ?? []
    assert.equal(calls.length, 1, 'exactly one call site: the unrecorded object')
  })

  it('metadata is attached through the server-only RPC, with verified identity', () => {
    assert.match(ROUTE, /rpc\('attach_menu_document_original'/)
    assert.match(ROUTE, /p_business_id: business_id/)
    assert.match(ROUTE, /p_document_id: documentId/)
    assert.match(ROUTE, /p_storage_path: retained\.path/)
    assert.match(ROUTE, /p_sha256: retained\.sha256/)
    assert.match(ROUTE, /p_filename: safeOriginalFilename/)
  })

  it('every existing pipeline stage is still in place', () => {
    for (const p of [
      /verifyOwner\(business_id\)/,
      /menuIndexRateLimitKey\(business_id\)/,
      /rpc\('begin_menu_indexing'/,
      /decideOcrCoverage\(totalPages\)/,
      /checkRateLimit\(`menu-ocr:/,
      /rpc\('prepare_menu_document'/,
      /embedMenuChunks\(openai/,
      /rpc\('activate_menu_document'/,
      /REQUEST_WORK_BUDGET_MS/,
    ]) {
      assert.ok(at(p) >= 0, `missing pipeline stage: ${p}`)
    }
    assert.equal((ROUTE.match(/rpc\('begin_menu_indexing'/g) ?? []).length, 1, 'one lifecycle')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the migration keeps history honest', () => {
  it('is additive: existing rows keep null retention metadata', () => {
    assert.match(FLAT, /add column if not exists original_storage_path text/)
    assert.match(FLAT, /add column if not exists original_retention_required boolean not null default false/)
    assert.doesNotMatch(CODE, /drop table|drop column/i)
    assert.doesNotMatch(CODE, /create table public\.menu_versions/i)
  })

  it('does not invent a second versions table — menu_documents is the version', () => {
    assert.doesNotMatch(CODE, /menu_versions/i)
  })

  it('retention metadata is all-or-none', () => {
    // Half-attached metadata looks like a retained original to every reader and
    // nothing can tell which half is missing.
    assert.match(FLAT, /constraint menu_documents_original_all_or_none check \(/)
    assert.match(FLAT, /original_storage_bucket is null and original_storage_path is null/)
    assert.match(FLAT, /original_storage_bucket is not null and original_storage_path is not null/)
  })

  it('and when present it describes a real PDF in the canonical place', () => {
    assert.match(FLAT, /original_storage_bucket = 'menu-pdfs'/)
    assert.match(FLAT, /original_mime_type = 'application\/pdf'/)
    assert.match(FLAT, /original_size_bytes > 0/)
    assert.match(FLAT, /original_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/)
    assert.match(
      FLAT,
      /original_storage_path = business_id::text \|\| '\/' \|\| id::text \|\| '\/original\.pdf'/,
    )
  })

  it('a required original is enforced by the table, not only by the function', () => {
    // One published version with no original and the guarantee stops being one.
    assert.match(FLAT, /constraint menu_documents_retention_satisfied check \(/)
    assert.match(FLAT, /original_retention_required = false or status in \('indexing', 'failed'\) or original_storage_path is not null/)
  })

  it('legacy rows stay valid because the flag defaults to false', () => {
    assert.match(FLAT, /original_retention_required boolean not null default false/)
    assert.doesNotMatch(FLAT, /update public\.menu_documents set original_retention_required = true/)
  })

  it('new leases require an original from here on', () => {
    assert.match(
      FLAT,
      /insert into public\.menu_documents \(business_id, status, original_retention_required\) values \(p_business_id, 'indexing', true\)/,
    )
  })

  it('activation refuses a required original that is missing', () => {
    assert.match(FLAT, /if v_required is true and v_original is null then raise exception 'missing_original'/)
  })

  it('and keeps every activation invariant it already had', () => {
    for (const e of [
      'no_chunks',
      'chunk_count_mismatch',
      'chunk_missing_embedding',
      'missing_source',
      'missing_char_count',
      'empty_menu_text',
      'menu_text_length_mismatch',
    ]) {
      assert.ok(CODE.includes(`raise exception '${e}'`), `activation lost ${e}`)
    }
    assert.match(FLAT, /for update/)
  })

  it('one row may claim a given object', () => {
    assert.match(
      FLAT,
      /create unique index if not exists menu_documents_original_path_idx on public\.menu_documents \(original_storage_bucket, original_storage_path\)/,
    )
  })
})

describe('the bucket is private, and stays that way', () => {
  it('is created not public, PDF only', () => {
    assert.match(FLAT, /insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\)/)
    assert.match(FLAT, /values \('menu-pdfs', 'menu-pdfs', false,/)
    assert.match(FLAT, /array\['application\/pdf'\]/)
  })

  it('a re-run cannot flip it public', () => {
    assert.match(FLAT, /on conflict \(id\) do update set public = false/)
  })

  it('no storage policy is created for anon or authenticated', () => {
    /*
     * These are whole menus belonging to paying customers; a public bucket
     * makes every one of them enumerable by anyone who guesses a business id.
     * The service role is the only key that reaches them.
     */
    assert.doesNotMatch(CODE, /create policy[\s\S]*storage\.objects/i)
    assert.doesNotMatch(CODE, /to anon/)
    assert.doesNotMatch(CODE, /using \(true\)/)
    assert.doesNotMatch(CODE, /public = true/)
  })
})

describe('attaching an original is write-once and tenant-bound', () => {
  const fn = SQL.slice(
    SQL.indexOf('function public.attach_menu_document_original'),
    SQL.indexOf('-- ─── Activation also refuses'),
  )

  it('validates the shape before touching a row', () => {
    assert.match(fn, /raise exception 'invalid_mime_type'/)
    assert.match(fn, /raise exception 'invalid_size'/)
    assert.match(fn, /raise exception 'invalid_sha256'/)
  })

  it('derives the path from identity, so a caller cannot name another object', () => {
    assert.match(fn, /p_storage_path is distinct from \(p_business_id::text \|\| '\/' \|\| p_document_id::text \|\| '\/original\.pdf'\)/)
    assert.match(fn, /raise exception 'invalid_storage_path'/)
  })

  it('finds the document by tenant, so another venue’s simply does not exist', () => {
    assert.match(fn, /where id = p_document_id and business_id = p_business_id/)
    assert.match(fn, /raise exception 'document_not_found'/)
  })

  it('only an indexing document that was told to retain may be attached to', () => {
    assert.match(fn, /if v_status <> 'indexing' then/)
    assert.match(fn, /if v_required is not true then/)
    assert.match(fn, /raise exception 'retention_not_required'/)
  })

  it('refuses a second attachment, both by check and by row count', () => {
    /*
     * Immutability is the value: a version whose original can be swapped proves
     * nothing about what was uploaded. The pre-check and the write are not one
     * step, so two callers can both see null — only whoever changed the row may
     * claim it.
     */
    assert.match(fn, /if v_existing is not null then/)
    assert.match(fn, /and original_storage_path is null/)
    assert.match(fn, /get diagnostics v_updated = row_count/)
    assert.match(fn, /if v_updated <> 1 then/)
    assert.equal((fn.match(/raise exception 'original_already_attached'/g) ?? []).length, 2)
  })

  it('is SECURITY INVOKER with an explicit search_path', () => {
    assert.doesNotMatch(fn, /security definer/i)
    assert.match(fn, /set search_path = public, extensions/)
  })

  it('executes only as the service role', () => {
    assert.ok(FLAT.includes('public.attach_menu_document_original(uuid, uuid, text, text, text, bigint, text)'))
    for (const role of ['public', 'anon', 'authenticated']) {
      assert.match(FLAT, new RegExp(`revoke all on function %s from ${role}`))
    }
    assert.match(FLAT, /grant execute on function %s to service_role/)
  })
})

describe('deleting the live menu does not erase history', () => {
  it('028 leaves delete_active_menu alone', () => {
    // Superseding the active version and clearing the text is what DELETE is;
    // destroying the record of every previous upload is not.
    assert.doesNotMatch(CODE, /function public\.delete_active_menu/)
  })

  it('and adds no automatic object cleanup anywhere', () => {
    assert.doesNotMatch(CODE, /storage\.objects/i)
    assert.doesNotMatch(CODE, /delete from storage/i)
  })

  it('the route deletes an object only in the orphan case', () => {
    assert.equal((ROUTE.match(/\.remove\(/g) ?? []).length, 0, 'route never calls remove directly')
    // Call sites, not the import line.
    assert.equal((ROUTE.match(/await removeOrphanedOriginal\(/g) ?? []).length, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the history endpoint returns metadata and nothing else', () => {
  it('checks ownership with the same helper as the rest of Settings', () => {
    assert.match(HISTORY, /verifyBusinessOwner\(businessId\)/)
    const auth = HISTORY.search(/verifyBusinessOwner\(businessId\)/)
    const query = HISTORY.search(/rpc\('menu_document_history'/)
    assert.ok(auth >= 0 && auth < query, 'ownership before the query')
    assert.match(HISTORY, /status: 401/)
  })

  it('scopes the query to the id it just verified', () => {
    assert.match(HISTORY, /p_business_id: businessId/)
  })

  it('returns no content, no bytes and no URL of any kind', () => {
    /*
     * A listing that returns a link grants access to every object it mentions,
     * turning "show me my history" into "download all of it".
     */
    // Statements only: the file's own prose explains what it withholds.
    const code = HISTORY.split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.trim().startsWith('//'))
      .join('\n')
    for (const leak of ['signedUrl', 'createSignedUrl', 'publicUrl', 'getPublicUrl', 'menu_pdf_text', 'embedding', 'menu_chunks']) {
      assert.equal(code.includes(leak), false, `history leaks ${leak}`)
    }
  })

  it('the SQL function selects only version metadata', () => {
    const fn = SQL.slice(
      SQL.indexOf('function public.menu_document_history'),
      SQL.indexOf('-- ─── Privileges'),
    )
    for (const col of [
      'id', 'status', 'source', 'char_count', 'created_at', 'activated_at',
      'superseded_at', 'original_filename', 'original_size_bytes',
      'original_sha256', 'original_attached_at',
    ]) {
      assert.ok(fn.includes(col), `history missing ${col}`)
    }
    // The bucket and path are storage addresses; an owner has no use for them
    // and publishing them only maps our private layout.
    assert.doesNotMatch(fn, /d\.original_storage_path|d\.original_storage_bucket/)
    assert.doesNotMatch(fn, /menu_chunks|embedding|menu_pdf_text/)
  })

  it('is not cached — it is private and changes on every upload', () => {
    assert.match(HISTORY, /'Cache-Control': 'private, no-store, max-age=0'/)
  })
})

describe('owner-facing wording', () => {
  it('says nothing was saved and the current menu stands', () => {
    assert.match(MENU_RETENTION_FAILED_MESSAGE, /[Nn]othing was saved/)
    assert.match(MENU_RETENTION_FAILED_MESSAGE, /menu is unchanged/)
    assert.doesNotMatch(MENU_RETENTION_FAILED_MESSAGE, /storage|bucket|supabase|sha/i)
  })
})
