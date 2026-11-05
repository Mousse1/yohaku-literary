import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const metadata=JSON.parse(readFileSync(new URL('./review-schema.json',import.meta.url)));
const migration=readFileSync(new URL('../../supabase/migrations/20261105_free_to_review_v7_20.sql',import.meta.url),'utf8');
const bodyOnlyMigration=readFileSync(new URL('../../supabase/migrations/20261105_body_only_review_v7_21.sql',import.meta.url),'utf8');
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

export {setup,actor,save,owner,mod,stranger,migration,bodyOnlyMigration};
