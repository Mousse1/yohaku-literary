-- 余白。v6.8：第三者からの参考文献・解説の投稿と審査
-- 前提: v6.7 までの既存スキーマ適用済み。
-- 作者自身の work_references (最大20件) とは完全に別のデータです。
-- データベースをバックアップしてから、SQL Editorで一度だけ実行してください。
begin;

create table if not exists public.community_references (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  pen_name text not null check (char_length(btrim(pen_name)) between 1 and 80),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  explanation text not null check (char_length(btrim(explanation)) between 5 and 4000),
  url text check (url is null or (char_length(url) <= 1000 and url ~ '^https://[^[:space:]]+$')),
  status text not null default 'pending' check (status in ('pending','published','hidden')),
  created_at timestamptz not null default now()
);
create index if not exists community_references_work_status
  on public.community_references(work_id,status,created_at desc);
create index if not exists community_references_pending
  on public.community_references(created_at) where status='pending';
create index if not exists community_references_author_date
  on public.community_references(author_id,created_at desc);

alter table public.community_references enable row level security;

-- Idempotent policy definitions for deployments that are retried.
drop policy if exists "community references visible when approved" on public.community_references;
drop policy if exists "reader reads own community reference proposals" on public.community_references;
drop policy if exists "moderators read community references" on public.community_references;
drop policy if exists "reader suggests community reference" on public.community_references;
drop policy if exists "reader retracts own pending community reference" on public.community_references;
drop policy if exists "moderators review community references" on public.community_references;

-- RLS: 匿名ユーザーは承認済みだけ。未承認提案は投稿者本人と管理者のみ。
create policy "community references visible when approved" on public.community_references
  for select to anon,authenticated
  using (status='published' and exists(
    select 1 from public.works w where w.id=work_id and w.status='published'
  ));
create policy "reader reads own community reference proposals" on public.community_references
  for select to authenticated using (author_id=(select auth.uid()));
create policy "moderators read community references" on public.community_references
  for select to authenticated using ((select private.is_moderator()));
create policy "reader suggests community reference" on public.community_references
  for insert to authenticated with check (
    author_id=(select auth.uid()) and status='pending'
    and exists(select 1 from public.works w where w.id=work_id and w.status='published')
  );
create policy "reader retracts own pending community reference" on public.community_references
  for delete to authenticated
  using (author_id=(select auth.uid()) and status='pending');
create policy "moderators review community references" on public.community_references
  for update to authenticated
  using ((select private.is_moderator())) with check ((select private.is_moderator()));

-- Basic spam cap: up to 20 active proposals per user per work,
-- and 20 total submissions per user per 24 hours. Additional network protection recommended.
create or replace function private.limit_community_reference_posts()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_work_count integer; v_daily_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.author_id::text));
  select count(*) into v_work_count from public.community_references r
   where r.work_id=new.work_id and r.author_id=new.author_id
     and r.status in ('pending','published');
  if v_work_count>=20 then raise exception 'この作品への文献提案は20件までです'; end if;
  select count(*) into v_daily_count from public.community_references r
   where r.author_id=new.author_id and r.created_at>now()-interval '24 hours';
  if v_daily_count>=20 then raise exception '24時間あたりの文献提案上限に達しました'; end if;
  return new;
end;
$$;
drop trigger if exists community_reference_submission_limit on public.community_references;
create trigger community_reference_submission_limit before insert on public.community_references
  for each row execute function private.limit_community_reference_posts();
revoke all on function private.limit_community_reference_posts() from public,anon,authenticated;

-- Authenticated users can insert their proposals but cannot approve themselves.
revoke all on public.community_references from public,anon,authenticated;
grant select on public.community_references to anon,authenticated;
grant insert,delete,update on public.community_references to authenticated;

-- Inherited reader contributions are discoverable from the parent group,
-- but remain separate from the author's references and retain source paths.
create or replace function public.list_descendant_community_references(p_work_id uuid)
returns table (
  source_work_id uuid,
  source_path text,
  reference_id uuid,
  reference_title text,
  reference_explanation text,
  reference_url text,
  contributor_pen_name text
)
language sql stable security invoker set search_path='' as $$
  with recursive visible_nodes as (
    select w.id, w.parent_work_id, 0::integer as depth,
      array[w.id] as visited, array[]::text[] as title_path
    from public.works w where w.id=p_work_id and w.status='published'
    union all
    select w.id,w.parent_work_id,n.depth+1,n.visited||w.id,n.title_path||w.title
    from public.works w join visible_nodes n on w.parent_work_id=n.id
    where w.status='published' and n.depth<32 and not (w.id=any(n.visited))
  )
  select n.id,array_to_string(n.title_path,' › '),r.id,r.title,r.explanation,r.url,r.pen_name
  from visible_nodes n join public.community_references r on r.work_id=n.id
  where n.depth>0 and r.status='published'
  order by n.title_path,r.created_at,r.id;
$$;
revoke all on function public.list_descendant_community_references(uuid) from public;
grant execute on function public.list_descendant_community_references(uuid) to anon,authenticated;

notify pgrst, 'reload schema';
commit;
