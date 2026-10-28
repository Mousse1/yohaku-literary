-- 余白。公開中作品の改訂審査・履歴・公開停止/削除申請
-- 既存環境: schema.sql が実行済みであること。SQL Editor でこの migration のみを一度実行。
-- 本番実行前にデータベースのバックアップを取得してください。
begin;

alter table public.works
  add column if not exists current_version integer not null default 0
  check (current_version >= 0);

-- 改訂案と承認済み版は独立して保存。公開中の works は審査が終わるまで不変。
create table if not exists public.work_revisions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','pending','rejected','approved')),
  version_number integer check (version_number is null or version_number >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  refs jsonb not null default '[]'::jsonb check (jsonb_typeof(refs)='array'),
  change_note text not null default '' check (char_length(change_note)<=1000),
  review_note text not null default '' check (char_length(review_note)<=1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint revision_approved_number check ((status='approved')=(version_number is not null)),
  unique (work_id, version_number)
);
create unique index if not exists revisions_one_editable_per_work
  on public.work_revisions(work_id) where status in ('draft','pending','rejected');
create index if not exists revisions_work_history
  on public.work_revisions(work_id,version_number desc) where status='approved';
create index if not exists revisions_moderation_queue
  on public.work_revisions(created_at) where status='pending';

create table if not exists public.publication_requests (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('hide','delete')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','canceled')),
  reason text not null default '' check (char_length(reason)<=1000),
  review_note text not null default '' check (char_length(review_note)<=1000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists publication_requests_one_pending
  on public.publication_requests(work_id) where status='pending';
create index if not exists publication_requests_queue
  on public.publication_requests(created_at) where status='pending';

alter table public.work_revisions enable row level security;
alter table public.publication_requests enable row level security;

-- 承認前の改訂原稿は本人/管理者以外に一切公開しない。
create policy "read published version history" on public.work_revisions for select to anon,authenticated
using (status='approved' and exists(
  select 1 from public.works w where w.id=work_id and w.status='published'
));
create policy "author reads own revisions" on public.work_revisions for select to authenticated
using (author_id=(select auth.uid()));
create policy "moderators read revisions" on public.work_revisions for select to authenticated
using ((select private.is_moderator()));
create policy "author reads publication requests" on public.publication_requests for select to authenticated
using (author_id=(select auth.uid()));
create policy "moderators read publication requests" on public.publication_requests for select to authenticated
using ((select private.is_moderator()));

revoke all on public.work_revisions, public.publication_requests from public,anon,authenticated;
grant select on public.work_revisions to anon,authenticated;
grant select on public.publication_requests to authenticated;
-- 書き込み権限は認証済みの RPC のみに付与。表に直接書き込む経路は作らない。

-- 本文と参考文献を完全なスナップショットとして取得する。
create or replace function private.work_snapshot(p_work public.works)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'pen_name',p_work.pen_name,'title',p_work.title,'genre',p_work.genre,
    'theme',p_work.theme,'summary',p_work.summary,'body',p_work.body,
    'question',p_work.question,'inheritance',p_work.inheritance,'novelty',p_work.novelty
  );
$$;

create or replace function private.references_snapshot(p_work_id uuid)
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'title',r.title,'relation',r.relation,'url',r.url
  ) order by r.created_at,r.id),'[]'::jsonb)
  from public.work_references r where r.work_id=p_work_id;
$$;

create or replace function private.validate_revision_payload(p_data jsonb,p_refs jsonb)
returns void language plpgsql set search_path='' as $$
declare v_entry jsonb; v_key text;
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' then
    raise exception '改訂本文の形式が正しくありません';
  end if;
  if octet_length(p_data::text)>1000000 then raise exception '作品データが大きすぎます'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) as k(field_name)
            where k.field_name not in ('pen_name','title','genre','theme','summary',
              'body','question','inheritance','novelty')) then
    raise exception '想定外の作品項目が含まれています';
  end if;
  if char_length(btrim(coalesce(p_data->>'pen_name',''))) not between 1 and 80
     or char_length(btrim(coalesce(p_data->>'title',''))) not between 1 and 180
     or char_length(btrim(coalesce(p_data->>'summary',''))) not between 10 and 1000
     or char_length(btrim(coalesce(p_data->>'body',''))) not between 10 and 200000
     or coalesce(p_data->>'genre','') not in ('純文学','実験文学','哲学小説','詩・散文','その他') then
    raise exception '作品名・筆名・本文・紹介または分類を確認してください';
  end if;
  foreach v_key in array array['theme','question','inheritance','novelty'] loop
    if char_length(coalesce(p_data->>v_key,'')) >
       case v_key when 'theme' then 200 else 2000 end then
      raise exception '作品の補足項目が長すぎます';
    end if;
  end loop;
  if p_refs is null or jsonb_typeof(p_refs)<>'array' or jsonb_array_length(p_refs)>20 then
    raise exception '参考文献は配列で20件以内にしてください';
  end if;
  if octet_length(p_refs::text)>80000 then raise exception '参考文献データが大きすぎます'; end if;
  for v_entry in select value from jsonb_array_elements(p_refs) loop
    if jsonb_typeof(v_entry)<>'object'
       or char_length(btrim(coalesce(v_entry->>'title',''))) not between 1 and 300
       or char_length(coalesce(v_entry->>'relation',''))>200
       or char_length(coalesce(v_entry->>'url',''))>1000
       or (coalesce(btrim(v_entry->>'url'),'')<>'' and
           btrim(v_entry->>'url') !~ '^https://[^[:space:]]+$') then
      raise exception '参考文献の書名またはURLを確認してください';
    end if;
  end loop;
end;
$$;

-- すでに公開中の作品の第1版を移行時点のスナップショットとして保存。
insert into public.work_revisions(work_id,author_id,status,version_number,snapshot,refs,change_note,reviewed_at)
select w.id,w.author_id,'approved',1,
  private.work_snapshot(w),private.references_snapshot(w.id),'移行時の公開版',now()
from public.works w
where w.status in ('published','hidden')
  and not exists(select 1 from public.work_revisions v where v.work_id=w.id and v.status='approved')
on conflict (work_id,version_number) do nothing;
update public.works w set current_version = coalesce((
 select max(v.version_number) from public.work_revisions v where v.work_id=w.id and v.status='approved'
),0) where w.status in ('published','hidden') and w.current_version=0;

-- 既存の管理画面から初めて承認された作品も「第1版」に記録される。
create or replace function private.archive_first_publication()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and old.status is distinct from 'published' then
    if not exists(select 1 from public.work_revisions v where v.work_id=new.id and v.status='approved') then
      insert into public.work_revisions(work_id,author_id,status,version_number,snapshot,refs,change_note,reviewed_at)
      values(new.id,new.author_id,'approved',1,private.work_snapshot(new),
        private.references_snapshot(new.id),'初回公開版',now());
    end if;
    if new.current_version=0 then
      update public.works set current_version=1 where id=new.id;
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists works_archive_first_publication on public.works;
create trigger works_archive_first_publication after update of status on public.works
for each row execute function private.archive_first_publication();

-- 著者は公開中の作品について「別テーブルの改訂案」のみを変更できる。
create or replace function public.save_revision(
  p_work_id uuid,p_snapshot jsonb,p_references jsonb,p_status text,p_change_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_work public.works%rowtype; v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'ログインしてください'; end if;
  if p_status not in ('draft','pending') then raise exception '不正な改訂状態です'; end if;
  if char_length(coalesce(p_change_note,''))>1000 then raise exception '変更説明が長すぎます'; end if;
  perform private.validate_revision_payload(p_snapshot,p_references);
  select * into v_work from public.works where id=p_work_id for update;
  if not found or v_work.author_id<>(select auth.uid()) or v_work.status<>'published' then
    raise exception 'この作品の改訂は申請できません';
  end if;
  select id into v_id from public.work_revisions
    where work_id=p_work_id and status in ('draft','pending','rejected') for update;
  if v_id is null then
    insert into public.work_revisions(work_id,author_id,status,snapshot,refs,change_note)
    values(p_work_id,(select auth.uid()),p_status,p_snapshot,p_references,coalesce(p_change_note,''))
    returning id into v_id;
  else
    update public.work_revisions set snapshot=p_snapshot,refs=p_references,status=p_status,
      change_note=coalesce(p_change_note,''),review_note='',updated_at=now(),reviewed_at=null
    where id=v_id;
  end if;
  return v_id;
end;
$$;

-- 管理者の承認を単一トランザクションで処理。承認されるまで旧版を維持。
create or replace function public.review_revision(
  p_revision_id uuid,p_action text,p_review_note text default ''
) returns void language plpgsql security definer set search_path='' as $$
declare v_revision public.work_revisions%rowtype; v_work public.works%rowtype; v_next integer;
begin
  if not private.is_moderator() then raise exception '管理者のみ操作できます'; end if;
  if p_action not in ('approve','reject') then raise exception '不正な操作です'; end if;
  if char_length(coalesce(p_review_note,''))>1000 then raise exception '審査コメントが長すぎます'; end if;
  -- ロック順を統一するため work_id を取得して works -> revisions の順にロック。
  select work_id into v_revision.work_id from public.work_revisions where id=p_revision_id;
  if v_revision.work_id is null then raise exception '改訂案が見つかりません'; end if;
  select * into v_work from public.works where id=v_revision.work_id for update;
  select * into v_revision from public.work_revisions where id=p_revision_id for update;
  if v_revision.status<>'pending' then raise exception '審査待ちではありません'; end if;
  if p_action='reject' then
    update public.work_revisions set status='rejected',review_note=coalesce(p_review_note,''),
      reviewed_at=now(),updated_at=now() where id=p_revision_id;
    return;
  end if;
  if v_work.status<>'published' then raise exception '現在公開中の作品だけ承認できます'; end if;
  perform private.validate_revision_payload(v_revision.snapshot,v_revision.refs);
  v_next:=greatest(v_work.current_version,1)+1;
  update public.works set
    pen_name=v_revision.snapshot->>'pen_name',title=v_revision.snapshot->>'title',
    genre=v_revision.snapshot->>'genre',theme=coalesce(v_revision.snapshot->>'theme',''),
    summary=v_revision.snapshot->>'summary',body=v_revision.snapshot->>'body',
    question=coalesce(v_revision.snapshot->>'question',''),
    inheritance=coalesce(v_revision.snapshot->>'inheritance',''),
    novelty=coalesce(v_revision.snapshot->>'novelty',''),current_version=v_next
  where id=v_work.id;
  delete from public.work_references where work_id=v_work.id;
  insert into public.work_references(work_id,title,relation,url)
  select v_work.id,btrim(x->>'title'),coalesce(x->>'relation',''),nullif(btrim(x->>'url'),'')
  from jsonb_array_elements(v_revision.refs) as x;
  update public.work_revisions set status='approved',version_number=v_next,
    review_note='',reviewed_at=now(),updated_at=now()
  where id=p_revision_id;
end;
$$;

-- 著者は停止・削除を「申請」できる。承認までは公開状態は変わらない。
create or replace function public.request_publication_action(
  p_work_id uuid,p_action text,p_reason text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_work public.works%rowtype; v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'ログインしてください'; end if;
  if p_action not in ('hide','delete') then raise exception '不正な申請です'; end if;
  if char_length(coalesce(p_reason,''))>1000 then raise exception '申請理由が長すぎます'; end if;
  select * into v_work from public.works where id=p_work_id for update;
  if not found or v_work.author_id<>(select auth.uid())
     or (v_work.status<>'published' and not (p_action='delete' and v_work.status='hidden')) then
    raise exception 'この作品について申請できません';
  end if;
  if exists(select 1 from public.publication_requests where work_id=p_work_id and status='pending') then
    raise exception 'すでに対応待ちの申請があります';
  end if;
  insert into public.publication_requests(work_id,author_id,action,reason)
  values(p_work_id,(select auth.uid()),p_action,coalesce(p_reason,'')) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_publication_request(p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.publication_requests%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'ログインしてください'; end if;
  select * into v_request from public.publication_requests where id=p_request_id for update;
  if not found or v_request.author_id<>(select auth.uid()) or v_request.status<>'pending' then
    raise exception 'この申請は取り消せません';
  end if;
  update public.publication_requests set status='canceled' where id=p_request_id;
end;
$$;

create or replace function public.review_publication_request(
  p_request_id uuid,p_action text,p_review_note text default ''
) returns void language plpgsql security definer set search_path='' as $$
declare v_request public.publication_requests%rowtype; v_work public.works%rowtype;
begin
  if not private.is_moderator() then raise exception '管理者のみ操作できます'; end if;
  if p_action not in ('approve','reject') then raise exception '不正な操作です'; end if;
  if char_length(coalesce(p_review_note,''))>1000 then raise exception '審査コメントが長すぎます'; end if;
  select work_id into v_request.work_id from public.publication_requests where id=p_request_id;
  if v_request.work_id is null then raise exception '申請が見つかりません'; end if;
  select * into v_work from public.works where id=v_request.work_id for update;
  select * into v_request from public.publication_requests where id=p_request_id for update;
  if v_request.status<>'pending' then raise exception '処理待ちではありません'; end if;
  if p_action='reject' then
    update public.publication_requests set status='rejected',review_note=coalesce(p_review_note,''),
      reviewed_at=now() where id=p_request_id;
    return;
  end if;
  if v_request.action='hide' then
    if v_work.status<>'published' then raise exception '現在の作品は公開中ではありません'; end if;
    update public.works set status='hidden' where id=v_work.id;
    update public.publication_requests set status='approved',review_note=coalesce(p_review_note,''),
      reviewed_at=now() where id=p_request_id;
  elsif v_request.action='delete' then
    -- 作品・注釈・改訂履歴・文献・申請は外部キーによりすべて削除。
    delete from public.works where id=v_work.id;
  end if;
end;
$$;

revoke all on function private.work_snapshot(public.works) from public,anon,authenticated;
revoke all on function private.references_snapshot(uuid) from public,anon,authenticated;
revoke all on function private.validate_revision_payload(jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.archive_first_publication() from public,anon,authenticated;
revoke all on function public.save_revision(uuid,jsonb,jsonb,text,text) from public,anon;
revoke all on function public.review_revision(uuid,text,text) from public,anon;
revoke all on function public.request_publication_action(uuid,text,text) from public,anon;
revoke all on function public.cancel_publication_request(uuid) from public,anon;
revoke all on function public.review_publication_request(uuid,text,text) from public,anon;
grant execute on function public.save_revision(uuid,jsonb,jsonb,text,text) to authenticated;
grant execute on function public.review_revision(uuid,text,text) to authenticated;
grant execute on function public.request_publication_action(uuid,text,text) to authenticated;
grant execute on function public.cancel_publication_request(uuid) to authenticated;
grant execute on function public.review_publication_request(uuid,text,text) to authenticated;

commit;
