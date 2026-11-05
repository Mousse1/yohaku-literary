import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setup,actor,save,owner,mod,stranger,migration,bodyOnlyMigration} from './fixtures/review-database.mjs';
const keepFree=readFileSync(new URL('../supabase/migrations/20261105_keep_free_during_review_v7_22.sql',import.meta.url),'utf8');
test('free publication remains visible during review and after rejection',async t=>{
 const db=await setup();t.after(()=>db.close());
 await actor(db,owner);
 // Existing private work must never be published just by applying a migration.
 const legacy=await save(db,null,'pending');
 await db.exec('RESET ROLE');await db.exec(migration);await db.exec(bodyOnlyMigration);await db.exec(keepFree);await db.exec(keepFree);
 await actor(db,'','anon');assert.equal((await db.query('SELECT id FROM works WHERE id=$1',[legacy])).rows.length,0);
 let id,parent;
 await t.test('submit edited free work without changing its public URL or hiding parent/child',async()=>{
  await actor(db,owner);parent=await save(db);id=await save(db,null,'open','自由公開の子作品の本文です。',parent);
  const payload='編集中の本文です。\n\n[資料1] https://example.org/link';
  assert.deepEqual(await Promise.all([save(db,id,'pending',payload,parent),save(db,id,'pending',payload,parent)]),[id,id]);
  const row=(await db.query('SELECT * FROM works WHERE id=$1',[id])).rows[0];
  assert.equal(row.status,'open');assert.equal(row.review_state,'pending');assert.equal(row.body,payload);assert.equal(row.current_version,0);
  await actor(db,'','anon');assert.equal((await db.query('SELECT id FROM works WHERE id=$1 OR id=$2',[id,parent])).rows.length,2);
  const refs=(await db.query('SELECT title,url FROM work_references WHERE work_id=$1',[id])).rows;
  assert.equal(refs.length,1);assert.equal(refs[0].url,'https://example.org/source#section-1');
 });
 await t.test('rejection and ordinary editing keep free publication and review result',async()=>{
  await actor(db,mod);await db.query("UPDATE works SET status='rejected' WHERE id=$1",[id]);
  assert.deepEqual((await db.query('SELECT status,review_state FROM works WHERE id=$1',[id])).rows[0],{status:'open',review_state:'rejected'});
  await actor(db,'','anon');assert.equal((await db.query('SELECT id FROM works WHERE id=$1',[id])).rows.length,1);
  await actor(db,owner);await save(db,id,'open','差し戻し後の本文を編集できます。',parent);
  assert.equal((await db.query('SELECT review_state FROM works WHERE id=$1',[id])).rows[0].review_state,'rejected');
 });
 await t.test('only moderator can approve pending work; content cannot be smuggled into approval',async()=>{
  await actor(db,stranger);await assert.rejects(save(db,id,'pending'),/編集できません/);
  await actor(db,owner);await save(db,id,'pending','再申請した最新の本文です。',parent);
  await assert.rejects(db.query("UPDATE works SET status='published' WHERE id=$1",[id]));
  await assert.rejects(db.query("UPDATE works SET review_state='approved' WHERE id=$1",[id]));
  await actor(db,mod);
  await assert.rejects(db.query("UPDATE works SET status='published',body='管理者が差し替える本文です' WHERE id=$1",[id]),/本文や所有者/);
  await db.query("UPDATE works SET status='published' WHERE id=$1",[id]);
  const row=(await db.query('SELECT * FROM works WHERE id=$1',[id])).rows[0];
  assert.equal(row.status,'published');assert.equal(row.review_state,null);assert.equal(row.current_version,1);
  assert.equal((await db.query('SELECT snapshot FROM work_revisions WHERE work_id=$1',[id])).rows[0].snapshot.body,row.body);
  await actor(db,'','anon');assert.equal((await db.query('SELECT id FROM works WHERE id=$1',[id])).rows.length,1);
 });
 await t.test('legacy private pending/rejected works become public only on owner action, without losing review status',async()=>{
  await actor(db,owner);await save(db,legacy,'open');
  assert.deepEqual((await db.query('SELECT status,review_state FROM works WHERE id=$1',[legacy])).rows[0],{status:'open',review_state:'pending'});
  await actor(db,mod);await db.query("UPDATE works SET status='rejected' WHERE id=$1",[legacy]);
  await actor(db,'','anon');assert.equal((await db.query('SELECT id FROM works WHERE id=$1',[legacy])).rows.length,1);
 });
 await t.test('private drafts and moderator-hidden works remain private; hidden review is not an approval route',async()=>{
  await actor(db,owner);const draft=await save(db,null,'draft');
  await actor(db,mod);await assert.rejects(db.query("UPDATE works SET status='published' WHERE id=$1",[legacy]),/審査申請/);
  await actor(db,owner);await db.query("UPDATE works SET status='draft' WHERE id=$1",[legacy]);
  assert.equal((await db.query('SELECT review_state FROM works WHERE id=$1',[legacy])).rows[0].review_state,null);
  await actor(db,'','anon');assert.equal((await db.query('SELECT id FROM works WHERE id=$1 OR id=$2',[draft,legacy])).rows.length,0);
  await actor(db,owner);const hidden=await save(db,null,'pending');
  await db.exec('RESET ROLE');
  const report='90000000-0000-4000-8000-000000000001';
  await db.query('INSERT INTO reports(id,work_id,resolved) VALUES($1,$2,false)',[report,hidden]);
  await db.query('INSERT INTO private.reported_open_hide_authorizations(report_id,work_id,moderator_id) VALUES($1,$2,$3)',[report,hidden,mod]);
  await actor(db,mod);await db.query("UPDATE works SET status='hidden' WHERE id=$1",[hidden]);
  await assert.rejects(db.query("UPDATE works SET status='published' WHERE id=$1",[hidden]));
  await actor(db,owner);await assert.rejects(save(db,hidden,'open'),/編集できません/);
  await actor(db,'','anon');assert.equal((await db.query('SELECT id FROM works WHERE id=$1',[hidden])).rows.length,0);
 });
 await t.test('bodyless groups still cannot request review',async()=>{
  await actor(db,owner);
  await assert.rejects(db.query("SELECT save_work_v6(NULL,'作者','グループ','純文学','','概要','','','','','pending','[]'::jsonb,'文学','',NULL,0,'collection')"),/本文のない/);
 });
});
