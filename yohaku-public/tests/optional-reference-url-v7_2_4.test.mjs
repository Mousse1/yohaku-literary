import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeReferenceUrl, validOptionalReferenceUrl } from '../src/referenceUrl.js'

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8')

test('printed sources may omit the link', () => {
  for (const value of ['', '  ', null, undefined]) {
    assert.equal(normalizeReferenceUrl(value), null)
    assert.equal(validOptionalReferenceUrl(value), true)
  }
})

test('provided URL must be a valid HTTPS URL', () => {
  assert.equal(validOptionalReferenceUrl(' https://example.org/pamphlet '), true)
  assert.equal(normalizeReferenceUrl(' https://example.org/pamphlet '), 'https://example.org/pamphlet')
  for (const value of ['http://example.org', 'ftp://example.org', 'https://', 'not-a-url', 'https://example.org/file name']) {
    assert.equal(validOptionalReferenceUrl(value), false, value)
  }
})

test('author and community forms explicitly mark URL as optional and store null', () => {
  const main = read('../src/main.jsx')
  const community = read('../src/CommunityContributions.jsx')
  for (const src of [main, community]) {
    assert.match(src, /参考URL（任意・空欄で登録できます）/)
    assert.match(src, /normalizeReferenceUrl\(|toWorkPayload\(/)
    assert.match(src, /validOptionalReferenceUrl\(/)
  }
})

test('database schema accepts null URLs for both forms', () => {
  const core = read('../supabase/schema.sql')
  const community = read('../supabase/migrations/20261030_community_references_v6_8.sql')
  for (const src of [core, community]) {
    assert.match(src, /url text check \(url is null/)
  }
})
