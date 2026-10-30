-- 余白。v6 作品の入れ子構造／目次／章立て（既存v5を前提）
-- 重要: バックアップ後、Supabase SQL Editorでこのファイル全体を一度だけ実行。
-- 本文上限20万文字、summary 10～1000文字は維持。目次グループのみ本文0文字を許容します。
begin;

alter table public.works add column if not exists node_kind text not null default 'work';
alter table public.works drop constraint if exists works_node_kind_check;
alter table public.works add constraint works_node_kind_check check (node_kind in ('work','collection'));
-- 通常作品の紹介は10〜1000字のまま。グループだけ説明0〜1000字にする。
alter table public.works drop constraint if exists works_summary_check;
alter table public.works add constraint works_summary_check check (
 (node_kind='collection' and char_length(btrim(summary)) between 0 and 1000) or
 (node_kind='work' and char_length(btrim(summary)) between 10 and 1000));
-- 原稿の上限20万字は変えず、純粋な目次グループは空本文も許可。
alter table public.works drop constraint if exists works_body_check;
alter table public.works add constraint works_body_check check (
 (node_kind='collection' and char_length(btrim(body)) between 0 and 200000) or
 (node_kind='work' and char_length(btrim(body)) between 10 and 200000));
alter table public.works
  add column if not exists parent_work_id uuid references public.works(id) on delete restrict;
alter table public.works
  add column if not exists order_index integer not null default 0;
alter table public.works drop constraint if exists works_order_index_check;
alter table public.works add constraint works_order_index_check check(order_index between 0 and 9999);
create index if not exists works_parent_order on public.works(parent_work_id,order_index,created_at,id);

-- 自分の作品にだけ入れ子化できる。循環・深すぎる階層・未公開親の下での公開を防ぐ。
-- SECURITY DEFINERはRLSを循環参照せずに親子関係を検査するため。
create or replace function private.validate_work_hierarchy()
returns trigger language plpgsql security definer set search_path='' as $$
declare p_author uuid; chain_has_cycle boolean; chain_has_unpublished boolean; max_depth int;
begin
  -- Prevent two simultaneous parent changes by the same author from creating a cycle.
  perform pg_advisory_xact_lock(hashtext(new.author_id::text));
  if new.parent_work_id is null then return new; end if;
  if new.parent_work_id = new.id then raise exception '作品を自身の下に配置できません'; end if;
  select author_id into p_author from public.works where id=new.parent_work_id;
  if p_author is null or p_author <> new.author_id then
    raise exception '親作品には、自分が管理する作品だけを指定できます';
  end if;
  with recursive chain as (
    select id,parent_work_id,status,1 as depth from public.works where id=new.parent_work_id
    union all
    select w.id,w.parent_work_id,w.status,c.depth+1
    from public.works w join chain c on w.id=c.parent_work_id where c.depth<12
  ) select coalesce(bool_or(id=new.id),false),
           coalesce(bool_or(status<>'published'),false),
           coalesce(max(depth),0)
    into chain_has_cycle,chain_has_unpublished,max_depth from chain;
  if chain_has_cycle then raise exception '親子関係が循環します'; end if;
  if max_depth>=12 then raise exception '階層は最大12段までです'; end if;
  if new.status='published' and chain_has_unpublished then
    raise exception '親作品を先に公開してください';
  end if;
  return new;
end;
$$;
drop trigger if exists works_validate_hierarchy on public.works;
create trigger works_validate_hierarchy before insert or update of parent_work_id,status,author_id
on public.works for each row execute function private.validate_work_hierarchy();
revoke all on function private.validate_work_hierarchy() from public,anon,authenticated;

-- 匿名閲覧は、本人と全ての親作品が公開中の場合だけ許可する。
create or replace function private.is_published_in_hierarchy(p_work_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  with recursive chain as (
    select id,parent_work_id,status,1 as depth from public.works where id=p_work_id
    union all
    select w.id,w.parent_work_id,w.status,c.depth+1
    from public.works w join chain c on w.id=c.parent_work_id where c.depth<13
  )
  select coalesce(count(*)>0 and bool_and(status='published')
    and bool_or(parent_work_id is null) and max(depth)<=12,false) from chain;
$$;
revoke all on function private.is_published_in_hierarchy(uuid) from public;
grant usage on schema private to anon;
grant execute on function private.is_published_in_hierarchy(uuid) to anon,authenticated;
drop policy if exists "public works visible" on public.works;
create policy "public works visible" on public.works for select to anon,authenticated
using (status='published' and (select private.is_published_in_hierarchy(id)));

-- 初回公開と改訂履歴にその時点の親作品と順序を記録する。
create or replace function private.work_snapshot(p_work public.works)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'pen_name',p_work.pen_name,'contributor_credit',p_work.contributor_credit,
    'section',p_work.section,'title',p_work.title,'genre',p_work.genre,
    'theme',p_work.theme,'summary',p_work.summary,'body',p_work.body,
    'question',p_work.question,'inheritance',p_work.inheritance,'novelty',p_work.novelty,
    'parent_work_id',p_work.parent_work_id,'order_index',p_work.order_index,
    'node_kind',p_work.node_kind
  );
$$;

-- v5の文字数・分類等の検証を保持し、改訂案に親と並び順を追加する。
create or replace function private.validate_revision_payload(p_data jsonb,p_refs jsonb)
returns void language plpgsql set search_path='' as $$
declare v_entry jsonb; v_key text;
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' then
    raise exception '改訂本文の形式が正しくありません';
  end if;
  if octet_length(p_data::text)>1000000 then raise exception '作品データが大きすぎます'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) as k(field_name)
            where k.field_name not in ('pen_name','contributor_credit','section','title','genre','theme','summary',
              'body','question','inheritance','novelty','parent_work_id','order_index','node_kind')) then
    raise exception '想定外の作品項目が含まれています';
  end if;
  if char_length(btrim(coalesce(p_data->>'pen_name',''))) not between 1 and 80
     or char_length(coalesce(p_data->>'contributor_credit','')) > 120
     or char_length(btrim(coalesce(p_data->>'title',''))) not between 1 and 180
     or not ((coalesce(p_data->>'node_kind','work')='collection' and char_length(btrim(coalesce(p_data->>'summary',''))) between 0 and 1000) or
             (coalesce(p_data->>'node_kind','work')='work' and char_length(btrim(coalesce(p_data->>'summary',''))) between 10 and 1000))
     or not (
       (coalesce(p_data->>'node_kind','work')='collection' and char_length(btrim(coalesce(p_data->>'body',''))) between 0 and 200000) or
       (coalesce(p_data->>'node_kind','work')='work' and char_length(btrim(coalesce(p_data->>'body',''))) between 10 and 200000)
     )
     or coalesce(p_data->>'genre','') not in ('純文学','実験文学','哲学小説','詩・散文','文芸評論','映画','ノベルゲーム','科学','その他',
        '理論哲学','実践哲学','文芸','アニメ','ゲーム','数学','物理学','脳科学','心理学','精神医学') then
    raise exception '作品名・筆名・本文・紹介または分類を確認してください';
  end if;

  if coalesce(p_data->>'node_kind','work') not in ('work','collection') then
    raise exception '作品の種類が不正です';
  end if;
  if p_data ? 'parent_work_id' and p_data->>'parent_work_id' is not null then
    perform (p_data->>'parent_work_id')::uuid;
  end if;
  if p_data ? 'order_index' and (p_data->>'order_index')::integer not between 0 and 9999 then
    raise exception '並び順は0～9999の範囲です';
  end if;

  -- 旧版の改訂案には section / contributor_credit が存在しないため、
  -- 大分類がある時だけ整合性をチェックします。
  if p_data ? 'section' then
    if coalesce(p_data->>'section','') not in ('文学','哲学','評論','科学','その他') or not (
      (p_data->>'section'='文学' and p_data->>'genre' in ('純文学','実験文学','詩・散文','哲学小説')) or
      (p_data->>'section'='哲学' and p_data->>'genre' in ('理論哲学','実践哲学')) or
      (p_data->>'section'='評論' and p_data->>'genre' in ('文芸','映画','アニメ','ゲーム','文芸評論','ノベルゲーム')) or
      (p_data->>'section'='科学' and p_data->>'genre' in ('数学','物理学','脳科学','心理学','精神医学','科学')) or
      (p_data->>'section'='その他' and p_data->>'genre'='その他')
    ) then
      raise exception '分野と小分類の組み合わせが正しくありません';
    end if;
  end if;

  -- CASE式とIFのTHENを隣接させず、項目ごとに上限を判定する。
  foreach v_key in array array['theme','question','inheritance','novelty'] loop
    if v_key = 'theme' then
      if char_length(coalesce(p_data->>v_key,'')) > 200 then
        raise exception '作品の補足項目が長すぎます';
      end if;
    else
      if char_length(coalesce(p_data->>v_key,'')) > 2000 then
        raise exception '作品の補足項目が長すぎます';
      end if;
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


-- 旧save_work_v5を残したまま新しいRPCを追加。
create or replace function public.save_work_v6(
  p_id uuid, p_pen_name text, p_title text, p_genre text,
  p_theme text, p_summary text, p_body text, p_question text,
  p_inheritance text, p_novelty text, p_status text, p_references jsonb,
  p_section text, p_contributor_credit text,
  p_parent_work_id uuid, p_order_index integer, p_node_kind text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'ログインしてください'; end if;
  if p_status not in ('draft','pending') then raise exception '投稿状態が不正です'; end if;
  if p_section is null or p_section not in ('文学','哲学','評論','科学','その他') then
    raise exception '分野が正しくありません';
  end if;
  if p_references is null or jsonb_typeof(p_references)<>'array'
     or jsonb_array_length(p_references)>20 then
    raise exception '参考文献は20件以内の配列にしてください';
  end if;
  if char_length(coalesce(p_contributor_credit,''))>120 then
    raise exception '入力／構成の名称は120文字以内にしてください';
  end if;
  if p_node_kind not in ('work','collection') or p_node_kind is null then
    raise exception '作品の種類が正しくありません';
  end if;
  if p_order_index is null or p_order_index not between 0 and 9999 then
    raise exception '並び順は0～9999の範囲で指定してください';
  end if;
  if p_id is null then
    insert into public.works(
      author_id,pen_name,contributor_credit,section,title,genre,theme,
      summary,body,question,inheritance,novelty,status,parent_work_id,order_index,node_kind)
    values ((select auth.uid()),p_pen_name,coalesce(p_contributor_credit,''),p_section,
      p_title,p_genre,p_theme,p_summary,p_body,p_question,p_inheritance,p_novelty,p_status,p_parent_work_id,p_order_index,p_node_kind)
    returning id into v_id;
  else
    update public.works set
      pen_name=p_pen_name,contributor_credit=coalesce(p_contributor_credit,''),section=p_section,
      title=p_title,genre=p_genre,theme=p_theme,summary=p_summary,body=p_body,
      parent_work_id=p_parent_work_id,order_index=p_order_index,node_kind=p_node_kind,
      question=p_question,inheritance=p_inheritance,novelty=p_novelty,status=p_status
    where id=p_id and author_id=(select auth.uid()) and status in ('draft','pending','rejected')
    returning id into v_id;
    if v_id is null then raise exception 'この作品は編集できません'; end if;
    delete from public.work_references where work_id=v_id;
  end if;
  insert into public.work_references(work_id,title,relation,url)
  select v_id,btrim(x->>'title'),coalesce(x->>'relation',''),nullif(btrim(x->>'url'),'')
  from jsonb_array_elements(p_references) as x;
  return v_id;
end;
$$;
revoke all on function public.save_work_v6(uuid,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.save_work_v6(uuid,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,uuid,integer,text) to authenticated;

-- 公開済み作品の移動は改訂審査後に反映する（旧公開位置を保持）。
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
    genre=v_revision.snapshot->>'genre',
    section=coalesce(v_revision.snapshot->>'section',v_work.section),
    contributor_credit=coalesce(v_revision.snapshot->>'contributor_credit',v_work.contributor_credit),
    parent_work_id=case when v_revision.snapshot ? 'parent_work_id'
      then nullif(v_revision.snapshot->>'parent_work_id','')::uuid else v_work.parent_work_id end,
    order_index=case when v_revision.snapshot ? 'order_index'
      then (v_revision.snapshot->>'order_index')::integer else v_work.order_index end,
    node_kind=coalesce(v_revision.snapshot->>'node_kind',v_work.node_kind),
    theme=coalesce(v_revision.snapshot->>'theme',''),
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

commit;
notify pgrst, 'reload schema';
