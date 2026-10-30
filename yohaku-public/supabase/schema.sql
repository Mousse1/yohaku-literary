-- 余白。 Supabase PostgreSQL schema (run once in SQL Editor)
-- Default-deny row policies. Anonymous visitors can only read approved works / notes.
-- IMPORTANT: never put a service_role key in a browser environment variable.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  pen_name text not null check (char_length(btrim(pen_name)) between 1 and 80),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  genre text not null check (genre in ('純文学','実験文学','哲学小説','詩・散文','その他')),
  theme text not null default '' check (char_length(theme) <= 200),
  summary text not null check (char_length(btrim(summary)) between 10 and 1000),
  body text not null check (char_length(btrim(body)) between 10 and 200000),
  question text not null default '' check (char_length(question) <= 2000),
  inheritance text not null default '' check (char_length(inheritance) <= 2000),
  novelty text not null default '' check (char_length(novelty) <= 2000),
  status text not null default 'pending' check (status in ('draft','pending','published','rejected','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists works_published_date on public.works(created_at desc) where status='published';
create index if not exists works_author on public.works(author_id, created_at desc);
create index if not exists works_status_date on public.works(status, created_at desc);

create table if not exists public.work_references (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  relation text not null default '' check (char_length(relation) <= 200),
  url text check (url is null or (char_length(url) <= 1000 and url ~ '^https://[^[:space:]]+$')),
  created_at timestamptz not null default now()
);
create index if not exists references_work on public.work_references(work_id);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  pen_name text not null check (char_length(btrim(pen_name)) between 1 and 80),
  type text not null check (type in ('比較の補足','別の先行作品','批評・異論','読後の問い')),
  body text not null check (char_length(btrim(body)) between 5 and 2000),
  status text not null default 'pending' check (status in ('pending','published','hidden')),
  created_at timestamptz not null default now()
);
create index if not exists notes_work_status on public.notes(work_id,status,created_at desc);
create index if not exists notes_pending on public.notes(created_at desc) where status='pending';

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('著作権に関する問題','差別・嫌がらせ','個人情報の掲載','スパム・宣伝','その他')),
  detail text not null default '' check (char_length(detail) <= 1000),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (work_id,reporter_id)
);
create index if not exists reports_open on public.reports(created_at desc) where resolved=false;

create or replace function private.is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.moderators where user_id = (select auth.uid()));
$$;
revoke all on function private.is_moderator() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_moderator() to authenticated;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists works_updated_at on public.works;
create trigger works_updated_at before update on public.works
for each row execute function private.set_updated_at();

-- Mitigate rapid bursts of new work submissions from the same account.
-- This protects a small launch, but does NOT replace network-level anti-abuse controls.
create or replace function private.check_work_submission_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recent_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.author_id::text));
  select count(*) into recent_count from public.works
  where author_id = new.author_id and created_at > now() - interval '24 hours';
  if recent_count >= 8 then
    raise exception '1日あたりの新規投稿上限に達しました。';
  end if;
  return new;
end;
$$;
drop trigger if exists works_submission_limit on public.works;
create trigger works_submission_limit before insert on public.works
for each row execute function private.check_work_submission_limit();

alter table public.moderators enable row level security;
alter table public.works enable row level security;
alter table public.work_references enable row level security;
alter table public.notes enable row level security;
alter table public.reports enable row level security;

-- READ moderators: people can only discover their own moderator membership.
create policy "moderator can check self" on public.moderators for select to authenticated
using (user_id = (select auth.uid()));

create policy "public works visible" on public.works for select to anon, authenticated
using (status='published');
create policy "author can read own works" on public.works for select to authenticated
using (author_id = (select auth.uid()));
create policy "moderator can read works" on public.works for select to authenticated
using ((select private.is_moderator()));

create policy "author can submit own work" on public.works for insert to authenticated
with check (author_id=(select auth.uid()) and status in ('draft','pending'));
create policy "author can revise unapproved works" on public.works for update to authenticated
using (author_id=(select auth.uid()) and status in ('draft','pending','rejected'))
with check (author_id=(select auth.uid()) and status in ('draft','pending','rejected'));
create policy "author can delete unapproved works" on public.works for delete to authenticated
using (author_id=(select auth.uid()) and status in ('draft','pending','rejected'));
create policy "moderator can update works" on public.works for update to authenticated
using ((select private.is_moderator())) with check ((select private.is_moderator()));
create policy "moderator can delete works" on public.works for delete to authenticated
using ((select private.is_moderator()));

create policy "public can read approved references" on public.work_references for select to anon,authenticated
using (exists(select 1 from public.works w where w.id=work_id and w.status='published'));
create policy "author can read own references" on public.work_references for select to authenticated
using (exists(select 1 from public.works w where w.id=work_id and w.author_id=(select auth.uid())));
create policy "moderator can read all references" on public.work_references for select to authenticated
using ((select private.is_moderator()));
create policy "author can insert references" on public.work_references for insert to authenticated
with check (exists(select 1 from public.works w where w.id=work_id and w.author_id=(select auth.uid()) and w.status in ('draft','pending','rejected')));
create policy "author can change references" on public.work_references for update to authenticated
using (exists(select 1 from public.works w where w.id=work_id and w.author_id=(select auth.uid()) and w.status in ('draft','pending','rejected')))
with check (exists(select 1 from public.works w where w.id=work_id and w.author_id=(select auth.uid()) and w.status in ('draft','pending','rejected')));
create policy "author can delete references" on public.work_references for delete to authenticated
using (exists(select 1 from public.works w where w.id=work_id and w.author_id=(select auth.uid()) and w.status in ('draft','pending','rejected')));
create policy "moderator manages references" on public.work_references for all to authenticated
using ((select private.is_moderator())) with check ((select private.is_moderator()));

create policy "public can read approved notes" on public.notes for select to anon,authenticated
using (status='published' and exists(select 1 from public.works w where w.id=work_id and w.status='published'));
create policy "author can read own notes" on public.notes for select to authenticated
using (author_id=(select auth.uid()));
create policy "moderator can read all notes" on public.notes for select to authenticated
using ((select private.is_moderator()));
create policy "reader can suggest note" on public.notes for insert to authenticated
with check (author_id=(select auth.uid()) and status='pending'
  and exists(select 1 from public.works w where w.id=work_id and w.status='published'));
create policy "author can retract own pending note" on public.notes for delete to authenticated
using (author_id=(select auth.uid()) and status='pending');
create policy "moderator manages notes" on public.notes for all to authenticated
using ((select private.is_moderator())) with check ((select private.is_moderator()));

create policy "reader may report published work" on public.reports for insert to authenticated
with check (reporter_id=(select auth.uid()) and resolved=false
  and exists(select 1 from public.works w where w.id=work_id and w.status='published'));
create policy "moderator may read reports" on public.reports for select to authenticated
using ((select private.is_moderator()));
create policy "moderator may resolve reports" on public.reports for update to authenticated
using ((select private.is_moderator())) with check ((select private.is_moderator()));

-- Explicit API grants in addition to RLS; no write permissions for anonymous users.
revoke all on public.moderators, public.works, public.work_references, public.notes, public.reports from anon, authenticated;
grant select on public.works, public.work_references, public.notes to anon;
grant select, insert, update, delete on public.works, public.work_references, public.notes to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select on public.moderators to authenticated;

-- Trigger helpers are not client-callable APIs.
revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.check_work_submission_limit() from public, anon, authenticated;

-- PRIVILEGED SETUP after registering the first operator (run manually in SQL Editor):
-- insert into public.moderators(user_id) values ('YOUR_AUTH_USER_UUID');
-- Never provide an admin-setting form to ordinary users.

-- Single transaction: changes to the work and all its bibliography succeed or fail together.
create or replace function public.save_work(
  p_id uuid,
  p_pen_name text,
  p_title text,
  p_genre text,
  p_theme text,
  p_summary text,
  p_body text,
  p_question text,
  p_inheritance text,
  p_novelty text,
  p_status text,
  p_references jsonb
)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'ログインしてください';
  end if;
  if p_status not in ('draft','pending') then
    raise exception '指定できない投稿状態です';
  end if;
  if p_references is null or jsonb_typeof(p_references) <> 'array'
     or jsonb_array_length(p_references)>20 then
    raise exception '参考文献は配列で20件以内にしてください';
  end if;
  if p_id is null then
    insert into public.works(author_id,pen_name,title,genre,theme,summary,body,question,inheritance,novelty,status)
    values ((select auth.uid()),p_pen_name,p_title,p_genre,p_theme,p_summary,p_body,p_question,p_inheritance,p_novelty,p_status)
    returning id into v_id;
  else
    update public.works set pen_name=p_pen_name,title=p_title,genre=p_genre,theme=p_theme,summary=p_summary,
      body=p_body,question=p_question,inheritance=p_inheritance,novelty=p_novelty,status=p_status
    where id=p_id and author_id=(select auth.uid()) and status in ('draft','pending','rejected')
    returning id into v_id;
    if v_id is null then raise exception 'この作品は編集できません'; end if;
    delete from public.work_references where work_id=v_id;
  end if;
  insert into public.work_references(work_id,title,relation,url)
  select v_id, btrim(x->>'title'), coalesce(x->>'relation',''),nullif(btrim(x->>'url'),'')
  from jsonb_array_elements(p_references) as x;
  return v_id;
end;
$$;
revoke all on function public.save_work(uuid,text,text,text,text,text,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.save_work(uuid,text,text,text,text,text,text,text,text,text,text,jsonb) to authenticated;
