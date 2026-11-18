import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {jstDateInput,scheduledInstant} from '../src/publicationSchedule.js'
test('Japanese time and a year ahead are preserved',()=>{
 const date=new Date(Date.now()+366*86400000)
 const input=jstDateInput(date)
 assert.equal(jstDateInput(scheduledInstant(input)),input)
 assert.throws(()=>scheduledInstant('2020-01-01T00:00'))
 assert.throws(()=>scheduledInstant('2030-02-30T12:00'))
})
test('reservations, ownership, cancellation, approval and parent visibility',async()=>{
 const db=new PGlite()
 try {
 await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table works(id uuid primary key,author_id uuid,parent_work_id uuid,status text,owner_private boolean default false);
 create function public.save_work_v6(p_id uuid,p_pen_name text,p_title text,p_genre text,p_theme text,p_summary text,p_body text,p_question text,p_inheritance text,p_novelty text,p_status text,p_references jsonb,p_section text,p_contributor_credit text,p_parent_work_id uuid,p_order_index integer,p_node_kind text) returns uuid language plpgsql as $$begin update works set status=p_status where id=p_id;return p_id;end$$;`)
 await db.exec(await readFile(new URL('../supabase/migrations/20261109_owner_visibility.sql',import.meta.url),'utf8'))
 const sql=await readFile(new URL('../supabase/migrations/20261118_scheduled_publication.sql',import.meta.url),'utf8')
 await db.exec(sql.split('-- Supabase Cron executes')[0])
 const owner='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',parent='11111111-1111-4111-8111-111111111111',child='22222222-2222-4222-8222-222222222222'
 await db.query('select set_config($1,$2,false)',['request.jwt.claim.sub',owner])
 await db.query("insert into works(id,author_id,status) values($1,$2,'open')",[parent,owner])
 await db.query("insert into works(id,author_id,status,parent_work_id) values($1,$2,'pending',$3)",[child,owner,parent])
 await db.exec(`create or replace function private.test_owner_guard() returns trigger language plpgsql as $$begin if auth.uid() is distinct from old.author_id then raise exception 'owner only';end if;return new;end$$;
 drop trigger if exists test_owner_guard on works;
 create trigger test_owner_guard before update on works for each row execute function private.test_owner_guard();`)
 await db.query("select public.schedule_my_work($1,now()+interval '1 year')",[parent])
 assert.equal((await db.query('select private.publish_due_works() n')).rows[0].n,0)
 assert.equal((await db.query('select private.is_published_in_hierarchy($1) visible',[parent])).rows[0].visible,false)
 await db.query('select set_config($1,$2,false)',['request.jwt.claim.sub',other])
 await assert.rejects(db.query("select public.schedule_my_work($1,now()+interval '2 years')",[parent]))
 await db.query('select set_config($1,$2,false)',['request.jwt.claim.sub',owner])
 await assert.rejects(db.query("select public.schedule_my_work($1,now()-interval '1 minute')",[parent]))
 await db.query("select public.schedule_my_work($1,now()+interval '1 year')",[child])
 await db.exec("update works set scheduled_publish_at=now()-interval '1 minute'")
 assert.equal((await db.query('select private.publish_due_works() n')).rows[0].n,1)
 assert.equal((await db.query('select auth.uid() actor')).rows[0].actor,owner)
 assert.equal((await db.query('select private.publish_due_works() n')).rows[0].n,0)
 await db.query("update works set status='published' where id=$1",[child])
 assert.equal((await db.query('select private.publish_due_works() n')).rows[0].n,1)
 assert.equal((await db.query('select private.publish_due_works() n')).rows[0].n,0)
 await db.query("select public.schedule_my_work($1,now()+interval '1 year')",[parent])
 await db.query('select public.schedule_my_work($1,null)',[parent])
 const canceled=(await db.query('select owner_private,scheduled_publish_at from works where id=$1',[parent])).rows[0]
 assert.deepEqual(canceled,{owner_private:true,scheduled_publish_at:null})
 await db.query("select public.schedule_my_work($1,now()+interval '1 year')",[child])
 await db.exec("update works set scheduled_publish_at=now()-interval '1 minute' where scheduled_publish_at is not null")
 assert.equal((await db.query('select private.publish_due_works() n')).rows[0].n,0)
 await db.query('select public.set_my_work_visibility($1,true)',[parent])
 assert.equal((await db.query('select private.publish_due_works() n')).rows[0].n,1)
 const before=(await db.query('select status from works where id=$1',[child])).rows[0].status
 await assert.rejects(db.query("select public.save_scheduled_work($1,now()-interval '1 day')",[JSON.stringify({p_id:child,p_status:'open'})]))
 assert.equal((await db.query('select status from works where id=$1',[child])).rows[0].status,before)
 await db.exec('set role authenticated')
 await assert.rejects(db.query('select private.publish_due_works()'))
 await db.exec('reset role')
 } finally {await db.close()}
})
