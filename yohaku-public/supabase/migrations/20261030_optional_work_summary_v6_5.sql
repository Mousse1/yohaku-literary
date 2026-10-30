-- 余白。v6.5：通常作品・グループ双方で作品紹介を任意入力にする。
-- v6.4のSQLを適用済みの環境用。実行前にデータベースのバックアップを取得してください。
-- 既存作品・改訂履歴・参考文献に変更を加えません。
BEGIN;

-- 従来は通常作品のみ紹介10～1000文字、グループ0～1000文字。
-- 両方とも空欄を許可し、入力がある場合も最大1000文字を維持。
ALTER TABLE public.works DROP CONSTRAINT IF EXISTS works_summary_check;
ALTER TABLE public.works ADD CONSTRAINT works_summary_check
CHECK (char_length(btrim(summary)) <= 1000);

-- 公開済み作品の改訂審査でも紹介0文字を許可。
-- v6.4までの最新バリデーターをもとに、紹介の文字数判定だけを変更。
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
     or char_length(btrim(coalesce(p_data->>'summary',''))) > 1000
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

COMMIT;
NOTIFY pgrst, 'reload schema';
