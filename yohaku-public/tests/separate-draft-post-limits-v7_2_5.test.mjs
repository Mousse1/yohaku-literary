import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL(path, import.meta.url),'utf8')
const migration = read('../supabase/migrations/20261030_separate_draft_and_submission_limits_v7_2_5.sql')
const main = read('../src/main.jsx')
const html = read('../index.html')
test('draft and submission quotas are independent and keep old 16-post ceiling',()=>{
  assert.match(migration,/v_event_type = 'draft_created' THEN 32 ELSE 16 END/)
  assert.match(migration,/event_type IN \('draft_created', 'submitted'\)/)
  assert.match(migration,/event_at > now\(\) - interval '24 hours'/)
  assert.match(migration,/新規投稿上限（16件）/)
  assert.match(migration,/新規下書き上限（32件）/)
})
test('new drafts counted once and draft publication counts against submission quota',()=>{
  assert.match(migration,/IF TG_OP = 'INSERT'/)
  assert.match(migration,/OLD.status = 'draft' AND NEW.status <> 'draft'/)
  assert.match(migration,/UPDATE OF status ON public\.works/)
  assert.match(migration,/CONSTRAINT work_limit_event_once UNIQUE \(work_id, event_type\)/)
  assert.match(migration,/work_limit_events_recent/)
  assert.match(migration,/pg_advisory_xact_lock/)
})
test('existing limits are migrated, and delete cannot reset event count',()=>{
  assert.match(migration,/INSERT INTO private\.work_limit_events\(work_id,author_id,event_type,event_at\)/)
  assert.match(migration,/FROM public\.works/)
  assert.doesNotMatch(migration, /work_id uuid[^\n]*REFERENCES public\.works/i)
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/)
  assert.match(migration,/REVOKE ALL ON private\.work_limit_events FROM PUBLIC, anon, authenticated/)
})
test('form shows new split limits and prior features remain',()=>{
  assert.match(main,/新規投稿：直近24時間で16件／新規下書き：直近24時間で32件/)
  assert.match(read('../src/editorDraft.js'),/p_status:status/)
  assert.match(main,/並べて読む/)
  assert.match(html,/v7\.(?:2\.5|3|4|5)/)
})
