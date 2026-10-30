import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const src=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const sql=fs.readFileSync(new URL('../supabase/migrations/20261031_free_publication_report_only_v7_5_6.sql',import.meta.url),'utf8')

test('free works no longer appear in an administrator approval/unpublish queue',()=>{
 assert.doesNotMatch(src,/adminData\.openWorks/)
 assert.doesNotMatch(src,/審査済みにする/)
 assert.doesNotMatch(src,/\.eq\('status','open'\)\.order\('created_at'/)
 assert.match(src,/自由公開の非公開化は、未処理の通報を確認した場合に限り/)
})

test('report based hides use a dedicated RPC with a written reason and single report ID',()=>{
 assert.match(src,/rpc\('hide_reported_open_work', \{p_report_id:report\.id,p_reason:reason\.trim\(\)\}\)/)
 assert.match(src,/hideReportedWork\(r\)/)
 assert.match(src,/!reason\.trim\(\)/)
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.hide_reported_open_work\(p_report_id uuid,p_reason text\)/)
 assert.match(sql,/NOT private\.is_moderator\(\)/)
 assert.match(sql,/v_report\.resolved/)
 assert.match(sql,/v_report\.reporter_id=v_actor/)
})

test('database tracks formerly free works and permanently prohibits approval',()=>{
 assert.match(sql,/ADD COLUMN IF NOT EXISTS freely_published_once boolean NOT NULL DEFAULT false/)
 assert.match(sql,/UPDATE public\.works SET freely_published_once=true WHERE status='open'/)
 assert.match(sql,/NEW\.freely_published_once := OLD\.freely_published_once OR NEW\.status='open'/)
 assert.match(sql,/OLD\.freely_published_once AND NEW\.status IN \('published','pending','rejected'\)/)
 assert.match(sql,/BEFORE INSERT OR UPDATE OR DELETE ON public\.works/)
 assert.match(sql,/RAISE EXCEPTION '自由公開作品を管理者が直接削除することはできません'/)
})

test('admin cannot directly alter free works or bypass the reported-work workflow',()=>{
 assert.match(sql,/private\.reported_open_hide_authorizations/)
 assert.match(sql,/JOIN public\.reports r ON r\.id=a\.report_id/)
 assert.match(sql,/r\.resolved=false/)
 assert.match(sql,/NEW\.status='hidden'/)
 assert.match(sql,/IS DISTINCT FROM \(to_jsonb\(OLD\) - 'status' - 'updated_at'\)/)
 assert.match(sql,/references_protect_freely_published/)
 assert.match(sql,/open_work_moderation_log/)
})

test('reviewed works and reader contributions continue to have their normal review flow',()=>{
 assert.match(src,/作品の審査/)
 assert.match(src,/改訂案の再審査/)
 assert.match(src,/読者の注釈/)
 assert.match(src,/第三者の参考文献・解説/)
 assert.match(src,/publishOperation\('works',w\.id,\{status:'published'\}\)/)
})
