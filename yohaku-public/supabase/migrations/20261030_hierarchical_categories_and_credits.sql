-- 余白。 v5: 二階層分類と「作者／入力・構成」クレジットを追加
-- 既存 works、投稿者ID、参考文献、承認済み改訂履歴、公開URLを維持します。
-- 適用順: schema.sql -> v2 migrations -> v4 20261030_add_fields.sql -> このv5 migration
-- 実行前に必ずSupabaseプロジェクトのバックアップを取ってください。
begin;

-- section は新しい大分類。古いクライアントとの互換性のためNULLを許容します。
-- NULLだったレコードは画面側でも以前のgenreから大分類を推定できます。
alter table public.works add column if not exists section text;
alter table public.works add column if not exists contributor_credit text not null default '';
alter table public.works drop constraint if exists works_contributor_credit_check;
alter table public.works add constraint works_contributor_credit_check
  check (char_length(contributor_credit)<=120);
alter table public.works drop constraint if exists works_section_check;
alter table public.works add constraint works_section_check
  check (section is null or section in ('文学','哲学','評論','科学','その他'));

-- 既存データは一度だけ大分類を埋め、元の小分類（genre）は一切変更しません。
update public.works set section = case
  when genre in ('純文学','実験文学','詩・散文','哲学小説') then '文学'
  when genre in ('文芸評論','映画','ノベルゲーム') then '評論'
  when genre = '科学' then '科学'
  else 'その他'
end where section is null;

-- 旧分類も許可し、公開中の古いアプリからの投稿が急に失敗しないようにします。
alter table public.works drop constraint if exists works_genre_check;
alter table public.works add constraint works_genre_check
 check (genre in ('純文学','実験文学','詩・散文','哲学小説',
                  '理論哲学','実践哲学',
                  '文芸','映画','アニメ','ゲーム','文芸評論','ノベルゲーム',
                  '数学','物理学','脳科学','心理学','精神医学','科学','その他'));

-- クライアントからの新規投稿と改稿は、正しい大分類と小分類の組だけ保存します。
-- 古い作品は独立した歴史的ジャンルのまま残せます。
alter table public.works drop constraint if exists works_section_genre_check;
alter table public.works add constraint works_section_genre_check
  check (section is null or
   (section='文学' and genre in ('純文学','実験文学','詩・散文','哲学小説')) or
   (section='哲学' and genre in ('理論哲学','実践哲学')) or
   (section='評論' and genre in ('文芸','映画','アニメ','ゲーム','文芸評論','ノベルゲーム')) or
   (section='科学' and genre in ('数学','物理学','脳科学','心理学','精神医学','科学')) or
   (section='その他' and genre='その他'));

-- 以後の初回公開と改訂履歴に、作者と入力／構成を別々に記録します。
create or replace function private.work_snapshot(p_work public.works)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'pen_name',p_work.pen_name,
    'contributor_credit',p_work.contributor_credit,
    'section',p_work.section,
    'title',p_work.title,'genre',p_work.genre,
    'theme',p_work.theme,'summary',p_work.summary,'body',p_work.body,
    'question',p_work.question,'inheritance',p_work.inheritance,'novelty',p_work.novelty
  );
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
            where k.field_name not in ('pen_name','contributor_credit','section','title','genre','theme','summary',
              'body','question','inheritance','novelty')) then
    raise exception '想定外の作品項目が含まれています';
  end if;
  if char_length(btrim(coalesce(p_data->>'pen_name',''))) not between 1 and 80
     or char_length(coalesce(p_data->>'contributor_credit','')) > 120
     or char_length(btrim(coalesce(p_data->>'title',''))) not between 1 and 180
     or char_length(btrim(coalesce(p_data->>'summary',''))) not between 10 and 1000
     or char_length(btrim(coalesce(p_data->>'body',''))) not between 10 and 200000
     or coalesce(p_data->>'genre','') not in ('純文学','実験文学','哲学小説','詩・散文','文芸評論','映画','ノベルゲーム','科学','その他',
        '理論哲学','実践哲学','文芸','アニメ','ゲーム','数学','物理学','脳科学','心理学','精神医学') then
    raise exception '作品名・筆名・本文・紹介または分類を確認してください';
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


-- 新しい投稿用API（旧save_workを壊さず共存させます）。
-- DBのRLSを用いて、本人の未承認作品だけを変更できます。
create or replace function public.save_work_v5(
  p_id uuid, p_pen_name text, p_title text, p_genre text,
  p_theme text, p_summary text, p_body text, p_question text,
  p_inheritance text, p_novelty text, p_status text, p_references jsonb,
  p_section text, p_contributor_credit text
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
  if p_id is null then
    insert into public.works(
      author_id,pen_name,contributor_credit,section,title,genre,theme,
      summary,body,question,inheritance,novelty,status)
    values ((select auth.uid()),p_pen_name,coalesce(p_contributor_credit,''),p_section,
      p_title,p_genre,p_theme,p_summary,p_body,p_question,p_inheritance,p_novelty,p_status)
    returning id into v_id;
  else
    update public.works set
      pen_name=p_pen_name,contributor_credit=coalesce(p_contributor_credit,''),section=p_section,
      title=p_title,genre=p_genre,theme=p_theme,summary=p_summary,body=p_body,
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
revoke all on function public.save_work_v5(uuid,text,text,text,text,text,text,text,text,text,text,jsonb,text,text)
  from public,anon,authenticated;
grant execute on function public.save_work_v5(uuid,text,text,text,text,text,text,text,text,text,text,jsonb,text,text)
  to authenticated;

-- 既存の改訂承認APIを更新。新版承認時に分類と入力／構成も原子的に切り替えます。
-- 旧版の改訂案が持たない新項目については、現行値を維持します。
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
-- PostgREST schema cache refresh
notify pgrst, 'reload schema';
