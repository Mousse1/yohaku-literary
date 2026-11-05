import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const metadata=JSON.parse(readFileSync(new URL('./fixtures/review-schema.json',import.meta.url)));
const migration=readFileSync(new URL('../supabase/migrations/20261105_free_to_review_v7_20.sql',import.meta.url),'utf8');
const bodyOnlyMigration=readFileSync(new URL('../supabase/migrations/20261105_body_only_review_v7_21.sql',import.meta.url),'utf8');
const owner='10000000-0000-4000-8000-000000000001', mod='10000000-0000-4000-8000-000000000002', stranger='10000000-0000-4000-8000-000000000003';
const tables=['works','work_references','work_revisions','publication_requests'];
const q=s=>'"'+s.replaceAll('"','""')+'"';
async function setup(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA private;
 CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${owner}'),('${mod}'),('${stranger}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE public.moderators(user_id uuid); INSERT INTO public.moderators VALUES('${mod}');
 CREATE TABLE public.reports(id uuid,work_id uuid,resolved boolean DEFAULT false);
 CREATE TABLE private.reported_open_hide_authorizations(work_id uuid,moderator_id uuid,report_id uuid);
 CREATE TABLE public.work_classifications(section text,name text); INSERT INTO public.work_classifications VALUES('文学','純文学');
 CREATE TABLE private.work_daily_events(work_id uuid,author_id uuid,event_type text,event_at timestamptz,UNIQUE(work_id,event_type));
 SET check_function_bodies=off;`);
 for(const table of tables){
  const columns=metadata.columns.filter(c=>c.table_name===table).sort((a,b)=>a.ordinal_position-b.ordinal_position);
  await db.exec(`CREATE TABLE public.${q(table)} (${columns.map(c=>`${q(c.column_name)} ${c.data_type}${c.column_default?' DEFAULT '+c.column_default:''}${c.is_nullable==='NO'?' NOT NULL':''}`).join(',')})`);
 }
 for(const fn of metadata.functions) await db.exec(fn.definition);
 for(const c of metadata.constraints.filter(c=>tables.includes(c.table)&&c.definition.startsWith('PRIMARY KEY'))) await db.exec(`ALTER TABLE public.${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
 for(const c of metadata.constraints.filter(c=>tables.includes(c.table)&&!c.definition.startsWith('PRIMARY KEY'))) await db.exec(`ALTER TABLE public.${q(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
 for(const t of metadata.triggers.filter(t=>tables.includes(t.table))) await db.exec(t.definition);
 for(const p of metadata.policies.filter(p=>tables.includes(p.tablename))) await db.exec(`CREATE POLICY ${q(p.policyname)} ON public.${q(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(q).join(',')}${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''}`);
 await db.exec(`GRANT USAGE ON SCHEMA auth,private,public TO authenticated,anon; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public,private,auth TO authenticated,anon; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated; GRANT SELECT ON public.works,public.work_references TO anon;`);
 for(const table of tables) await db.exec(`ALTER TABLE public.${q(table)} ENABLE ROW LEVEL SECURITY`);
 return db;
}
async function actor(db,id,role='authenticated'){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`SET ROLE ${role}`)}
const refs=[{title:'[資料1] 参考資料',relation:'引用元\n注釈・補足',url:'https://example.org/source#section-1'}];
async function save(db,id=null,status='open',body='本文を保持します。\n\n[資料1] https://example.org/link',parent=null){
 return (await db.query(`SELECT public.save_work_v6($1,'作者','第一章','純文学','主題','概要',$2,'問い','継承','試み',$3,$4::jsonb,'文学','入力者',$5,0,'work') AS id`,[id,body,status,JSON.stringify(refs),parent])).rows[0].id;
}
test('production metadata: free publication can enter existing moderation lifecycle without cloning',async t=>{
 const db=await setup();t.after(()=>db.close());await actor(db,owner);
 const id=await save(db);
 await assert.rejects(save(db,id,'pending'),/自由公開した作品/);
 await db.exec('RESET ROLE');await db.exec(migration);await db.exec(migration);await db.exec(bodyOnlyMigration);await db.exec(bodyOnlyMigration);
 await actor(db,owner);
 await t.test('submit and repeated submit retain ID, content, references, history flag and quota',async()=>{
  const edited='編集中の本文を保存。\n\n[資料1] https://example.org/link';
  assert.deepEqual(await Promise.all([save(db,id,'pending',edited),save(db,id,'pending',edited)]),[id,id]);
  const w=(await db.query('SELECT * FROM works WHERE id=$1',[id])).rows[0];
  assert.equal(w.body,edited);assert.equal(w.status,'pending');assert.equal(w.freely_published_once,true);
  const r=(await db.query('SELECT title,relation,url FROM work_references WHERE work_id=$1',[id])).rows;
  assert.deepEqual(r,refs);assert.equal((await db.query('SELECT count(*)::int AS n FROM works')).rows[0].n,1);
  await db.exec('RESET ROLE');assert.equal((await db.query("SELECT count(*)::int AS n FROM private.work_daily_events WHERE work_id=$1 AND event_type='submitted'",[id])).rows[0].n,1);
 });
 await t.test('pending is invisible anonymously; owner cannot approve or forge version',async()=>{
  await actor(db,'','anon');assert.equal((await db.query('SELECT * FROM works WHERE id=$1',[id])).rows.length,0);
  assert.equal((await db.query('SELECT * FROM work_references WHERE work_id=$1',[id])).rows.length,0);
  await actor(db,owner);await assert.rejects(db.query("UPDATE works SET status='published' WHERE id=$1",[id]));
  await assert.rejects(db.query('UPDATE works SET current_version=1 WHERE id=$1',[id]));
  await actor(db,stranger);await assert.rejects(save(db,id,'pending'),/編集できません/);
 });
 await t.test('reject, resubmit, approve and archive the submitted content',async()=>{
  await actor(db,mod);await db.query("UPDATE works SET status='rejected' WHERE id=$1",[id]);
  await actor(db,owner);assert.equal((await db.query('SELECT status FROM works WHERE id=$1',[id])).rows[0].status,'rejected');
  await save(db,id,'pending');await actor(db,mod);await db.query("UPDATE works SET status='published' WHERE id=$1",[id]);
  const w=(await db.query('SELECT * FROM works WHERE id=$1',[id])).rows[0];assert.equal(w.current_version,1);assert.equal(w.freely_published_once,true);
  const history=(await db.query('SELECT * FROM work_revisions WHERE work_id=$1',[id])).rows;
  assert.equal(history.length,1);assert.equal(history[0].snapshot.body,w.body);assert.deepEqual(history[0].refs,refs);
  await actor(db,'','anon');assert.equal((await db.query('SELECT * FROM works WHERE id=$1',[id])).rows.length,1);
 });
 await t.test('reviewed work uses existing revision approval and hide/delete request rules',async()=>{
  await actor(db,owner);await assert.rejects(save(db,id,'open'),/編集できません/);
  const w=(await db.query('SELECT * FROM works WHERE id=$1',[id])).rows[0];
  const snapshot={...(await db.query('SELECT private.work_snapshot(w) AS snapshot FROM works w WHERE id=$1',[id])).rows[0].snapshot,summary:'改訂内容の紹介を十分な長さで記述します。',body:'承認する改訂版の本文です。'};
  const rev=(await db.query("SELECT save_revision($1,$2::jsonb,$3::jsonb,'pending','改訂') AS id",[id,JSON.stringify(snapshot),JSON.stringify(refs)])).rows[0].id;
  await actor(db,stranger);await assert.rejects(db.query("SELECT review_revision($1,'approve','')",[rev]),/管理者/);
  await actor(db,mod);await db.query("SELECT review_revision($1,'approve','')",[rev]);
  assert.equal((await db.query('SELECT current_version FROM works WHERE id=$1',[id])).rows[0].current_version,2);
  await actor(db,owner);const req=(await db.query("SELECT request_publication_action($1,'hide','') AS id",[id])).rows[0].id;
  await actor(db,mod);await db.query("SELECT review_publication_request($1,'approve','')",[req]);
  await actor(db,owner);assert.equal((await db.query('DELETE FROM works WHERE id=$1 RETURNING id',[id])).rows.length,0);
 });
 await t.test('moderator cannot opt in for owner, edit open content or approve it directly',async()=>{
  await actor(db,owner);const free=await save(db);
  await actor(db,mod);
  for(const status of ['pending','published','rejected','hidden'])await assert.rejects(db.query('UPDATE works SET status=$1 WHERE id=$2',[status,free]));
  await assert.rejects(db.query("UPDATE works SET body='管理者による本文の変更です' WHERE id=$1",[free]));
  await assert.rejects(db.query('DELETE FROM works WHERE id=$1',[free]));
 });
 await t.test('submitting a parent hides descendants until approval, keeping hierarchy intact',async()=>{
  await actor(db,owner);const parent=await save(db);const child=await save(db,null,'open','下位本文を保持します。',parent);
  await save(db,parent,'pending');await actor(db,'','anon');assert.equal((await db.query('SELECT * FROM works WHERE id=$1',[child])).rows.length,0);
  await actor(db,mod);await db.query("UPDATE works SET status='published' WHERE id=$1",[parent]);
  await actor(db,'','anon');assert.equal((await db.query('SELECT parent_work_id FROM works WHERE id=$1',[child])).rows[0].parent_work_id,parent);
 });
});
test('empty groups publish without review; database blocks empty applications and approvals',async t=>{
 const db=await setup();t.after(()=>db.close());
 await actor(db,owner);
 const args=[null,'作者','グループ','純文学','','概要','','','','','pending','[]','文学','',null,0,'collection'];
 const sql='SELECT public.save_work_v6('+args.map((_,i)=>'$'+(i+1)).join(',')+') AS id';
 const legacy=(await db.query(sql,args)).rows[0].id;
 await db.exec('RESET ROLE');await db.exec(migration);await db.exec(bodyOnlyMigration);await db.exec(bodyOnlyMigration);
 await actor(db,mod);await assert.rejects(db.query("UPDATE works SET status='published' WHERE id=$1",[legacy]),/本文のない/);
 await actor(db,owner);args[0]=legacy;args[10]='open';
 assert.equal((await db.query(sql,args)).rows[0].id,legacy);
 await actor(db,'','anon');assert.equal((await db.query('SELECT body FROM works WHERE id=$1',[legacy])).rows[0].body,'');
 await actor(db,owner);
 for(const blank of ['', ' \t\n　', '\u00a0\ufeff']){
  args[0]=null;args[6]=blank;args[10]='pending';await assert.rejects(db.query(sql,args),/本文のない/);
  args[10]='open';const group=(await db.query(sql,args)).rows[0].id;
  args[0]=group;args[10]='pending';await assert.rejects(db.query(sql,args),/本文のない/);
 }
 // The criterion is body text, including legacy collections that retain text.
 args[0]=null;args[6]='既存のグループに残っている本文です。';args[10]='pending';
 const withBody=(await db.query(sql,args)).rows[0].id;
 await actor(db,mod);await db.query("UPDATE works SET status='published' WHERE id=$1",[withBody]);
 await assert.rejects(db.query("UPDATE works SET body='' WHERE id=$1",[withBody]),/本文のない/);
 await actor(db,owner);const child=await save(db,null,'pending','審査する子作品の本文です。',legacy);
 await actor(db,'','anon');
 assert.equal((await db.query('SELECT id FROM works WHERE id=$1',[legacy])).rows.length,1);
 assert.equal((await db.query('SELECT id FROM works WHERE id=$1',[child])).rows.length,0);
});
