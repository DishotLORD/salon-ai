import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { isDuplicateBusinessError, UNIQUE_VIOLATION } from '../lib/duplicate-business.ts'

describe('isDuplicateBusinessError', () => {
  it('recognizes PostgreSQL unique_violation (23505) on user_id', () => {
    assert.equal(
      isDuplicateBusinessError({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "businesses_user_id_unique_idx"',
        details: 'Key (user_id)=(11111111-1111-1111-1111-111111111111) already exists.',
      }),
      true,
    )
  })

  it('recognizes a bare 23505 with no message as ours', () => {
    // The only unique column this insert touches is user_id, so an empty
    // message with the right code still means "a business already exists".
    assert.equal(isDuplicateBusinessError({ code: '23505', message: '', details: '' }), true)
    assert.equal(isDuplicateBusinessError({ code: '23505' }), true)
  })

  it('does not treat a unique violation on a different column as ours', () => {
    assert.equal(
      isDuplicateBusinessError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "dining_zones_business_id_slug_key"',
        details: 'Key (business_id, slug)=(..., main-dining) already exists.',
      }),
      false,
    )
  })

  it('does not treat an unrelated database error as a duplicate', () => {
    assert.equal(
      isDuplicateBusinessError({
        code: '23502',
        message: 'null value in column "name" violates not-null constraint',
      }),
      false,
    )
    assert.equal(
      isDuplicateBusinessError({ code: '42501', message: 'permission denied for table businesses' }),
      false,
    )
    assert.equal(isDuplicateBusinessError({ code: '08006', message: 'connection failure' }), false)
  })

  it('does not treat a missing or codeless error as a duplicate', () => {
    assert.equal(isDuplicateBusinessError({ message: 'fetch failed' }), false)
    assert.equal(isDuplicateBusinessError(null), false)
    assert.equal(isDuplicateBusinessError(undefined), false)
  })

  it('checks the exact SQLSTATE for unique_violation', () => {
    assert.equal(UNIQUE_VIOLATION, '23505')
  })
})

describe('onboarding is wired to reload, not fail, on a duplicate business', () => {
  const source = readFileSync(new URL('../app/onboarding/page.tsx', import.meta.url), 'utf8')

  it('imports isDuplicateBusinessError from the shared helper', () => {
    assert.match(source, /import \{ isDuplicateBusinessError \} from '@\/lib\/duplicate-business'/)
  })

  it('checks the insert error with isDuplicateBusinessError before treating it as fatal', () => {
    assert.match(source, /if \(insertError && isDuplicateBusinessError\(insertError\)\)/)
  })

  it('on a duplicate, re-selects the existing business by user_id instead of inserting again', () => {
    const dupBlock = source.split('isDuplicateBusinessError(insertError)')[1]?.slice(0, 400) ?? ''
    assert.match(dupBlock, /\.from\('businesses'\)/)
    assert.match(dupBlock, /\.eq\('user_id', user\.id\)/)
    const beforeAdopt = dupBlock.slice(0, dupBlock.indexOf('setBusinessId'))
    assert.doesNotMatch(beforeAdopt, /\.insert\(/)
  })

  it('on a duplicate, adopts the existing row and clears the pending draft instead of erroring', () => {
    const dupBlock = source.split('isDuplicateBusinessError(insertError)')[1]?.slice(0, 400) ?? ''
    assert.match(dupBlock, /setBusinessId\(raced\.id\)/)
    assert.match(dupBlock, /clearPendingVenueDraft\(\)/)
    assert.match(dupBlock, /return raced\.id/)
  })

  it('a genuinely different insert error still surfaces to the owner', () => {
    // isDuplicateBusinessError only short-circuits the duplicate path; anything
    // it returns false for must still fall through to the generic error branch.
    const fallthrough = source.split('if (insertError || !created?.id)')[1]?.slice(0, 200) ?? ''
    assert.match(fallthrough, /setError\(/)
  })
})

describe('migration 025 repairs the businesses.user_id invariant', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/025_business_user_unique.sql', import.meta.url),
    'utf8',
  ).toLowerCase()
  // Comments explain, in prose, why CONCURRENTLY is deliberately not used — so
  // executable-statement checks below strip `--` comment lines first, or the
  // explanation itself would trip a naive "the word never appears" assertion.
  const executable = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  it('guards against duplicate user_id rows and aborts instead of silently proceeding', () => {
    assert.match(sql, /group by user_id/)
    assert.match(sql, /having count\(\*\) > 1/)
    assert.match(sql, /raise exception/)
  })

  it('never deletes, updates, or merges existing business rows', () => {
    assert.doesNotMatch(sql, /\bdelete\s+from\b/)
    assert.doesNotMatch(sql, /\bupdate\s+public\.businesses\b/)
    assert.doesNotMatch(sql, /\bmerge\b/)
  })

  it('does not drop the pre-existing businesses_user_id_idx', () => {
    assert.doesNotMatch(sql, /drop\s+index[^;]*businesses_user_id_idx/)
  })

  it('enforces a new, differently-named unique index on businesses(user_id)', () => {
    assert.match(sql, /create unique index if not exists businesses_user_id_unique_idx/)
    assert.match(sql, /on public\.businesses \(user_id\)/)
  })

  it('is idempotent — safe to run more than once', () => {
    assert.match(sql, /create unique index if not exists/)
  })

  it('never uses CREATE INDEX CONCURRENTLY inside this transactional migration', () => {
    // "concurrently" is allowed to appear in a RAISE EXCEPTION message body
    // (explaining what an invalid index typically means) — only the actual
    // CREATE [UNIQUE] INDEX ... CONCURRENTLY clause is disallowed.
    assert.doesNotMatch(executable, /create\s+(unique\s+)?index\s+concurrently/)
  })

  it('runs the guard and the index creation in one transaction', () => {
    assert.match(sql, /^begin;/m)
    assert.match(sql, /^commit;/m)
  })
})

describe('migration 025 validates its own postcondition against the catalogs', () => {
  const raw = readFileSync(
    new URL('../supabase/migrations/025_business_user_unique.sql', import.meta.url),
    'utf8',
  )
  const sql = raw.toLowerCase()
  const executable = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  // CREATE UNIQUE INDEX IF NOT EXISTS only checks the object name — it says
  // nothing about whether that object actually enforces anything. The
  // postcondition block is everything after the CREATE INDEX statement, which
  // is where that gets checked for real, against pg_index/pg_attribute.
  const postconditionBlock = raw.slice(
    raw.indexOf('create unique index if not exists businesses_user_id_unique_idx'),
  )
  const postconditionSql = postconditionBlock.toLowerCase()

  it('reads the actual index definition from pg_index, not just its name', () => {
    assert.match(postconditionSql, /pg_index/)
    assert.match(postconditionSql, /to_regclass\('public\.businesses_user_id_unique_idx'\)/)
  })

  it('requires indisunique', () => {
    assert.match(postconditionSql, /not idx\.indisunique/)
  })

  it('requires indisvalid', () => {
    assert.match(postconditionSql, /not idx\.indisvalid/)
  })

  it('requires indisready', () => {
    assert.match(postconditionSql, /not idx\.indisready/)
  })

  it('rejects a partial index', () => {
    assert.match(postconditionSql, /idx\.indpred is not null/)
  })

  it('rejects an expression index', () => {
    assert.match(postconditionSql, /idx\.indexprs is not null/)
  })

  it('verifies exactly one key column', () => {
    assert.match(postconditionSql, /idx\.indnkeyatts <> 1/)
  })

  it('resolves the key column and verifies it is businesses.user_id, via pg_attribute', () => {
    assert.match(postconditionSql, /pg_attribute/)
    assert.match(postconditionSql, /attnum = key_attnum/)
    assert.match(postconditionSql, /key_colname is distinct from 'user_id'/)
  })

  it('confirms the index belongs to public.businesses, not another table', () => {
    assert.match(postconditionSql, /idx\.indrelid <> 'public\.businesses'::regclass/)
  })

  it('aborts on every failed check instead of continuing', () => {
    const raises = postconditionSql.match(/raise exception/g) ?? []
    // One raise per postcondition: exists, is-an-index, right-table, unique,
    // valid, ready, non-partial, non-expression, single-column, right-column.
    assert.ok(raises.length >= 9, `expected at least 9 raise exception branches, found ${raises.length}`)
  })

  it('never rewrites or drops businesses_user_id_unique_idx to force it to pass', () => {
    assert.doesNotMatch(executable, /\balter\s+index\b/)
    assert.doesNotMatch(executable, /\bdrop\s+index\b[^;]*businesses_user_id_unique_idx/)
  })

  it('the postcondition still runs inside the same guarded, locked transaction', () => {
    // The postcondition block must sit between BEGIN and COMMIT, after the
    // duplicate-data guard — not as a separate, later, unguarded migration.
    // The header comment reproduces the guard's own SQL as an audit query for
    // a DBA to run by hand, so searches must start after `begin;` or they find
    // that prose copy instead of the executable guard.
    const beginAt = sql.indexOf('\nbegin;\n')
    const commitAt = sql.lastIndexOf('\ncommit;')
    assert.ok(beginAt >= 0 && commitAt > beginAt, 'no single begin/commit transaction found')
    const guardAt = sql.indexOf('having count(*) > 1', beginAt)
    const postconditionAt = sql.indexOf('to_regclass(', beginAt)
    assert.ok(guardAt > beginAt && guardAt < commitAt, 'duplicate guard is outside the transaction')
    assert.ok(
      postconditionAt > guardAt && postconditionAt < commitAt,
      'postcondition check does not run after the guard, inside the same transaction',
    )
  })
})
