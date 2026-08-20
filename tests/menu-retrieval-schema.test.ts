import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  MENU_INDEX_BUSY_MESSAGE,
  MENU_TOO_LARGE_MESSAGE,
} from '../lib/menu-indexing.ts'

/**
 * The migration is the last line of defence for everything the application
 * promises about menu indexing, so it is read as text and checked here.
 *
 * These are not a substitute for running it — no local Supabase or Docker was
 * available in this environment, which is stated in the PR rather than papered
 * over — but they do pin the parts whose absence would only surface as a
 * cross-tenant read or a half-published menu in production.
 */
const SQL = readFileSync(
  new URL('../supabase/migrations/026_menu_retrieval.sql', import.meta.url),
  'utf8',
)

/**
 * The statements only. Assertions about what the schema does must not be
 * satisfied — or broken — by the prose explaining it, and this file's comments
 * necessarily discuss the very things it forbids.
 */
const CODE = SQL.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')

const normalized = CODE.replace(/\s+/g, ' ')

describe('the migration is additive', () => {
  it('creates the extension in its own schema', () => {
    assert.match(SQL, /create extension if not exists vector with schema extensions/)
  })

  it('runs as one transaction', () => {
    assert.match(SQL, /^\s*begin;/m)
    assert.match(SQL, /commit;\s*$/)
  })

  it('drops nothing and alters no existing table', () => {
    // businesses.menu_pdf_text and services must survive untouched: a
    // deployment that never calls the new functions behaves exactly as today.
    assert.doesNotMatch(CODE, /drop table/i)
    assert.doesNotMatch(CODE, /drop column/i)
    assert.doesNotMatch(CODE, /alter table public\.businesses/i)
    assert.doesNotMatch(CODE, /alter table public\.services/i)
  })

  it('adds no approximate vector index yet', () => {
    // Hundreds of chunks per venue; an exact scan is both correct and faster,
    // and HNSW would need tuning and rebuilding for no benefit.
    assert.doesNotMatch(CODE, /hnsw|ivfflat/i)
  })
})

describe('a chunk cannot belong to another venue', () => {
  it('menu_documents exposes the (id, business_id) pair to reference', () => {
    assert.match(normalized, /unique \(id, business_id\)/)
  })

  it('menu_chunks references that pair, not the document alone', () => {
    /*
     * The invariant that makes a cross-tenant chunk unrepresentable rather than
     * merely forbidden: there is no parent row for (document of A, business B),
     * so the insert fails in the database whatever the application does.
     */
    assert.match(
      normalized,
      /foreign key \(document_id, business_id\) references public\.menu_documents \(id, business_id\) on delete cascade/,
    )
  })

  it('cascades from the business, so deleting a venue takes its chunks', () => {
    assert.match(normalized, /business_id uuid not null references public\.businesses \(id\) on delete cascade/)
  })

  it('rejects an empty chunk', () => {
    assert.match(normalized, /content text not null check \(length\(btrim\(content\)\) > 0\)/)
  })

  it('keeps ordinals unique within a document', () => {
    assert.match(normalized, /unique \(document_id, ordinal\)/)
  })
})

describe('one active menu, one indexing job', () => {
  it('at most one active document per business', () => {
    assert.match(
      normalized,
      /create unique index if not exists menu_documents_one_active on public\.menu_documents \(business_id\) where status = 'active'/,
    )
  })

  it('at most one indexing document per business', () => {
    // Two concurrent uploads would otherwise race to activate, and the loser's
    // chunks would linger against a superseded row.
    assert.match(
      normalized,
      /create unique index if not exists menu_documents_one_indexing on public\.menu_documents \(business_id\) where status = 'indexing'/,
    )
  })

  it('lets a lease exist before its metadata is known', () => {
    /*
     * The row is created before extraction runs, because it is what stops a
     * DELETE landing mid-upload — and at that moment nobody knows whether the
     * text will come from the PDF's own layer or from OCR, nor how long it will
     * be. A document that failed before extraction keeps them null, which is
     * the honest record of what happened.
     */
    assert.match(normalized, /source text check \(source in \('pdf_text', 'pdf_ocr', 'legacy_backfill'\)\)/)
    assert.match(normalized, /char_count integer check \(char_count >= 0\)/)
    assert.doesNotMatch(normalized, /source text not null/)
    assert.doesNotMatch(normalized, /char_count integer not null/)
  })

  it('but a published document must know what it is', () => {
    assert.match(
      normalized,
      /constraint menu_documents_published_metadata check \( status in \('indexing', 'failed'\) or \(source is not null and char_count is not null\) \)/,
    )
  })

  it('constrains status and source to known values', () => {
    assert.match(normalized, /check \(status in \('indexing', 'active', 'failed', 'superseded'\)\)/)
    assert.match(normalized, /check \(source in \('pdf_text', 'pdf_ocr', 'legacy_backfill'\)\)/)
  })
})

describe('RLS mirrors the existing owner pattern', () => {
  it('is enabled on both tables', () => {
    assert.match(SQL, /alter table public\.menu_documents enable row level security/)
    assert.match(SQL, /alter table public\.menu_chunks enable row level security/)
  })

  it('grants authenticated SELECT only, scoped to accessible businesses', () => {
    for (const table of ['menu_documents', 'menu_chunks']) {
      const policy = new RegExp(
        `create policy "${table}_owner_select" on public\\.${table} for select to authenticated using \\(business_id in \\(select public\\.accessible_business_ids\\(\\)\\)\\)`,
      )
      assert.match(normalized, policy, `${table} select policy`)
    }
  })

  it('gives authenticated no write path to these tables at all', () => {
    /*
     * `for all to authenticated` would let an owner insert a chunk or flip a
     * document to 'active' directly — bypassing the row lock, the chunk count
     * and the embedding check that activation exists to perform. Owning a venue
     * is permission to see its index, not to publish a menu that was never
     * embedded.
     */
    assert.doesNotMatch(normalized, /for all to authenticated/)
    for (const verb of ['insert', 'update', 'delete']) {
      assert.doesNotMatch(
        normalized,
        new RegExp(`for ${verb} to authenticated`),
        `authenticated must have no ${verb} policy`,
      )
    }
    const policies = CODE.match(/create policy/g) ?? []
    assert.equal(policies.length, 2, 'exactly the two select policies')
  })

  it('every write therefore comes from the service role', () => {
    assert.match(normalized, /grant execute on function %s to service_role/)
  })

  it('grants nothing to anon and never uses using(true)', () => {
    // The two shapes migration 021 existed to remove.
    assert.doesNotMatch(CODE, /to anon/)
    assert.doesNotMatch(CODE, /using \(true\)/)
  })
})

describe('the lifecycle functions are server-only', () => {
  const FUNCTIONS = [
    'begin_menu_indexing',
    'activate_menu_document',
    'delete_active_menu',
    'fail_menu_document',
    'menu_indexing_stale_after',
  ]

  it('every function is revoked from public, anon and authenticated', () => {
    /*
     * Each takes a business_id argument and is reached only from the server
     * after ownership has been checked. Granting them to `authenticated` would
     * hand any signed-in user another venue's menu lifecycle by changing one
     * argument — the shape of hole migration 021 was written to close.
     */
    for (const role of ['public', 'anon', 'authenticated']) {
      assert.match(normalized, new RegExp(`revoke all on function %s from ${role}`))
    }
    assert.match(normalized, /grant execute on function %s to service_role/)
    for (const fn of FUNCTIONS) {
      assert.ok(normalized.includes(`public.${fn}(`), `${fn} missing from the grant list`)
    }
  })

  it('none of them is SECURITY DEFINER', () => {
    // service_role already bypasses RLS; DEFINER would only add a way for the
    // business_id parameter to become an escape if the grants were loosened.
    assert.doesNotMatch(CODE, /security definer/i)
  })

  it('each sets an explicit search_path', () => {
    const setters = CODE.match(/set search_path = public, extensions/g) ?? []
    assert.ok(setters.length >= FUNCTIONS.length, `expected one per function, saw ${setters.length}`)
  })
})

describe('activation is all-or-nothing', () => {
  const fn = SQL.slice(
    SQL.indexOf('function public.activate_menu_document'),
    SQL.indexOf('-- Remove the uploaded menu'),
  )

  it('takes the business row lock first', () => {
    assert.match(fn, /select id into v_lock from public\.businesses where id = p_business_id for update/)
  })

  it('refuses a document that is not its own venue’s, or not indexing', () => {
    assert.match(fn, /where id = p_document_id and business_id = p_business_id/)
    assert.match(fn, /if v_status <> 'indexing' then/)
  })

  it('counts the chunks itself rather than trusting a stored number', () => {
    // A chunk_count column is a number the application maintains; the thing
    // worth checking is whether the rows are actually there.
    assert.match(fn, /select count\(\*\), count\(\*\) filter \(where embedding is null\)/)
    // No stored column — the only `chunk_count` in the file is the name of the
    // exception raised when the caller's expectation and reality disagree.
    assert.doesNotMatch(CODE, /chunk_count (integer|int|bigint)/)
    assert.doesNotMatch(CODE, /set chunk_count/)
    assert.match(CODE, /raise exception 'chunk_count_mismatch'/)
  })

  it('rejects zero chunks, a miscount, or any missing embedding', () => {
    assert.match(fn, /if v_total = 0 then/)
    assert.match(fn, /if v_total <> p_expected_chunks then/)
    assert.match(fn, /if v_missing > 0 then/)
  })

  it('refuses to publish a document that never got past extraction', () => {
    assert.match(fn, /if v_source is null then/)
    assert.match(fn, /raise exception 'missing_source'/)
    assert.match(fn, /if v_char_count is null then/)
    assert.match(fn, /raise exception 'missing_char_count'/)
  })

  it('proves the legacy text is the same version the document describes', () => {
    /*
     * Without this a caller could activate document A while writing the text of
     * upload B, and the indexed menu and the stored menu would disagree from the
     * moment they went live — the exact split this design exists to prevent.
     */
    assert.match(fn, /if p_menu_text is null or length\(btrim\(p_menu_text\)\) = 0 then/)
    assert.match(fn, /raise exception 'empty_menu_text'/)
    assert.match(fn, /if char_length\(p_menu_text\) <> v_char_count then/)
    assert.match(fn, /raise exception 'menu_text_length_mismatch'/)
  })

  it('supersedes the old document, activates the new one and moves the legacy text together', () => {
    const supersede = fn.search(/set status = 'superseded'/)
    const activate = fn.search(/set status = 'active', activated_at = now\(\)/)
    const legacy = fn.search(/set menu_pdf_text = p_menu_text/)
    assert.ok(supersede >= 0 && activate > supersede && legacy > activate)
  })
})

describe('deletion cannot be undone by an upload that was already running', () => {
  const fn = SQL.slice(
    SQL.indexOf('function public.delete_active_menu'),
    SQL.indexOf('-- Abandon an indexing job'),
  )

  it('locks the business row', () => {
    assert.match(fn, /for update/)
  })

  it('refuses while a live indexing job exists', () => {
    /*
     * Otherwise: DELETE clears the text, the in-flight upload finishes and
     * activates, and the menu the owner just deleted is back.
     */
    assert.match(fn, /if v_indexing is not null and v_indexing > now\(\) - public\.menu_indexing_stale_after\(\)/)
    assert.match(fn, /raise exception 'menu_processing'/)
  })

  it('clears the text and deactivates the document in the same transaction', () => {
    assert.match(fn, /set status = 'superseded', superseded_at = now\(\)/)
    assert.match(fn, /set menu_pdf_text = null/)
  })
})

describe('the lease is taken before the work, not after it', () => {
  const fn = SQL.slice(
    SQL.indexOf('function public.begin_menu_indexing'),
    SQL.indexOf('-- Record what the upload turned out to be'),
  )

  it('begin takes only the business id, because nothing else is known yet', () => {
    assert.match(normalized, /function public\.begin_menu_indexing\( p_business_id uuid \)/)
    assert.match(fn, /insert into public\.menu_documents \(business_id, status\)/)
  })

  it('metadata arrives later, exactly once, into a document still indexing', () => {
    const prepare = SQL.slice(
      SQL.indexOf('function public.prepare_menu_document'),
      SQL.indexOf('-- Publish an indexed document'),
    )
    assert.match(prepare, /if v_status <> 'indexing' then/)
    assert.match(prepare, /where id = p_document_id and business_id = p_business_id/)
    assert.match(prepare, /raise exception 'invalid_source'/)
    assert.match(prepare, /raise exception 'invalid_char_count'/)
    assert.match(prepare, /set source = p_source, char_count = p_char_count/)
  })

  it('prepare is server-only like the rest', () => {
    assert.ok(normalized.includes('public.prepare_menu_document('))
  })
})

describe('DELETE moves each document to the state it actually reached', () => {
  /*
   * Modelled from the SQL rather than executed — no local Supabase was
   * available — but these transitions are exactly where the lifecycle went
   * wrong, so the statements are read individually.
   *
   * The bug this pins: DELETE used to sweep `indexing` into `superseded`
   * alongside the active document. A lease is created before extraction, so a
   * crashed request leaves status='indexing' with source and char_count null,
   * and menu_documents_published_metadata requires both for a superseded row.
   * The whole transaction failed the constraint and the venue could never
   * delete its menu again. The constraint is right; the transition was wrong.
   */
  const del = SQL.slice(
    SQL.indexOf('function public.delete_active_menu'),
    SQL.indexOf('-- Abandon an indexing job'),
  )
  const code = del
    .split('\n')
    .filter((l) => !l.trim().startsWith('--') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n')

  it('CASE 1 — an active document becomes superseded, and the text is cleared', () => {
    assert.match(
      code.replace(/\s+/g, ' '),
      /set status = 'superseded', superseded_at = now\(\) where business_id = p_business_id and status = 'active'/,
    )
    assert.match(code, /set menu_pdf_text = null/)
  })

  it('CASE 2 — a live lease refuses the delete outright', () => {
    assert.match(code, /where business_id = p_business_id and status = 'indexing'/)
    assert.match(code, /v_indexing > now\(\) - public\.menu_indexing_stale_after\(\)/)
    assert.match(code, /raise exception 'menu_processing'/)
    // The refusal happens before any update, so nothing is touched.
    const refuse = code.indexOf("raise exception 'menu_processing'")
    const firstUpdate = code.indexOf('update public.menu_documents')
    assert.ok(refuse < firstUpdate, 'refuse before mutating anything')
  })

  it('CASE 3/4 — a stale lease becomes failed, prepared or not', () => {
    /*
     * Failed, because a stale unfinished upload was never a published menu.
     * `failed` is the one published-state exemption the CHECK allows, so this
     * is also the only transition that works for an unprepared lease.
     */
    assert.match(
      code.replace(/\s+/g, ' '),
      /set status = 'failed' where business_id = p_business_id and status = 'indexing'/,
    )
    // No metadata predicate: prepared and unprepared leases take the same path.
    assert.doesNotMatch(code, /status = 'failed'[\s\S]{0,120}source is/)
  })

  it('DELETE never turns an indexing document into superseded', () => {
    const supersede = code.slice(code.indexOf("set status = 'superseded'"))
    const clause = supersede.slice(0, supersede.indexOf(';'))
    assert.equal(clause.includes("'indexing'"), false, 'superseded is for active documents only')
    assert.doesNotMatch(code.replace(/\s+/g, ' '), /status in \('active', 'indexing'\)/)
  })

  it('CASE 5 — a failed document is left alone', () => {
    // Neither update names it, so an earlier failure keeps its record.
    for (const stmt of code.split('update public.menu_documents').slice(1)) {
      const where = stmt.slice(0, stmt.indexOf(';'))
      assert.equal(where.includes("'failed'") && where.includes('where'), where.includes("set status = 'failed'"))
    }
  })

  it('the stale lease is retired before the active one is superseded', () => {
    // Order matters only for legibility here, but a reader should see the
    // unfinished job dealt with first.
    const fail = code.indexOf("set status = 'failed'")
    const supersede = code.indexOf("set status = 'superseded'")
    assert.ok(fail >= 0 && supersede > fail)
  })

  it('all of it happens under the business row lock, in one transaction', () => {
    assert.match(code, /for update/)
    const lock = code.indexOf('for update')
    assert.ok(lock < code.indexOf('update public.menu_documents'))
  })

  it('a retired lease lets a later DELETE through', () => {
    // fail_menu_document moves 'indexing' → 'failed', which the live-lease
    // check no longer sees.
    const fail = SQL.slice(SQL.indexOf('function public.fail_menu_document'))
    assert.match(fail, /set status = 'failed'/)
    assert.match(fail, /and status = 'indexing'/)
  })
})

describe('write-once survives two callers, not just one', () => {
  const prepare = SQL.slice(
    SQL.indexOf('function public.prepare_menu_document'),
    SQL.indexOf('-- Publish an indexed document'),
  )

  it('claims the row only if it actually changed it', () => {
    /*
     * The pre-check reads and the UPDATE writes; between them another caller
     * can win. Both would have seen null and both would think they were first,
     * and the loser's guarded UPDATE matches nothing — returning success for
     * metadata it did not write.
     */
    assert.match(prepare, /get diagnostics v_updated = row_count/)
    assert.match(prepare, /if v_updated <> 1 then/)
    assert.match(prepare, /raise exception 'metadata_already_prepared'/)
  })

  it('keeps the explicit pre-check as well', () => {
    assert.match(prepare, /if v_source is not null or v_char_count is not null then/)
  })

  it('the UPDATE itself still guards on unwritten metadata and ownership', () => {
    const flat = prepare.replace(/\s+/g, ' ')
    assert.match(
      flat,
      /where id = p_document_id and business_id = p_business_id and status = 'indexing' and source is null and char_count is null/,
    )
  })
})

describe('a stale indexing job does not lock a venue out forever', () => {
  it('the threshold is far above the route’s own ceiling', () => {
    // maxDuration is 120s, so anything older than this cannot still be running;
    // reclaiming a job that *is* still working would let two indexers write.
    assert.match(SQL, /select interval '10 minutes'/)
    assert.match(SQL, /maxDuration|120 seconds/)
  })

  it('a live job is refused, an expired one is retired', () => {
    const fn = SQL.slice(
      SQL.indexOf('function public.begin_menu_indexing'),
      SQL.indexOf('-- Publish an indexed document'),
    )
    assert.match(fn, /if v_existing\.created_at > now\(\) - public\.menu_indexing_stale_after\(\) then/)
    assert.match(fn, /raise exception 'menu_processing'/)
    assert.match(fn, /set status = 'failed'/)
  })

  it('the threshold lives in one place', () => {
    const literals = CODE.match(/interval '10 minutes'/g) ?? []
    assert.equal(literals.length, 1, 'centralised in menu_indexing_stale_after')
  })
})

describe('owner-facing messages never advise destroying a menu', () => {
  it('does not suggest splitting the menu across uploads', () => {
    // Each upload replaces businesses.menu_pdf_text, so that advice would
    // delete a venue's food menu with its drinks list — the same reasoning
    // PR #18 applied to the OCR refusals.
    for (const message of [MENU_TOO_LARGE_MESSAGE, MENU_INDEX_BUSY_MESSAGE]) {
      assert.doesNotMatch(message, /separate documents|separately|split/i)
    }
  })
})
