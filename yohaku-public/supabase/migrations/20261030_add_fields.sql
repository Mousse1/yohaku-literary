-- 余白。 v4: 既存の作品と改訂履歴を維持しながらジャンルを追加する
-- 既存の v2 改訂管理SQLが適用済みのDBで、一度だけ実行してください。
-- 事前にデータベースをバックアップしてください。
begin;

-- 既存 works テーブルの分類制限だけを拡張。作品レコードは変更しません。
alter table public.works drop constraint if exists works_genre_check;
alter table public.works add constraint works_genre_check
  check (genre in ('純文学','実験文学','哲学小説','詩・散文','文芸評論','映画','ノベルゲーム','科学','その他'));

-- 改訂案のサーバー側バリデーションでも同じ分類を認める。
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
     or coalesce(p_data->>'genre','') not in ('純文学','実験文学','哲学小説','詩・散文','文芸評論','映画','ノベルゲーム','科学','その他') then
    raise exception '作品名・筆名・本文・紹介または分類を確認してください';
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

commit;
-- 任意：Supabase RESTのスキーマキャッシュを更新
notify pgrst, 'reload schema';
