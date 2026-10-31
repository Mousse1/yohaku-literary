-- 余白。v7.5.7: 作者本人だけが、同じ親に属する作品の表示順を変更できる。
-- 作品本文・公開状態・作品ID・作者IDは変更しない。
-- 先に v7.5.6 までのマイグレーションを適用してください。
BEGIN;

CREATE OR REPLACE FUNCTION public.reorder_my_group_children(
  p_parent_id uuid,
  p_ordered_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_parent_owner uuid;
  v_count integer;
  v_distinct_count integer;
  v_rows integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'ログインしてください';
  END IF;
  IF p_parent_id IS NULL OR p_ordered_ids IS NULL THEN
    RAISE EXCEPTION '対象グループと作品の順序を指定してください';
  END IF;

  -- 親をロックすることで、同時の子作品作成・移動との競合を防ぐ。
  SELECT w.author_id INTO v_parent_owner
    FROM public.works AS w WHERE w.id=p_parent_id FOR UPDATE;
  IF v_parent_owner IS NULL OR v_parent_owner <> v_actor THEN
    RAISE EXCEPTION 'このグループの並び順を変更する権限がありません';
  END IF;

  SELECT COUNT(*)::integer,COUNT(DISTINCT ids.id)::integer
    INTO v_count,v_distinct_count
    FROM unnest(p_ordered_ids) AS ids(id);
  IF v_count < 1 OR v_count > 10000 OR v_distinct_count <> v_count THEN
    RAISE EXCEPTION '順序には重複のない1～10000件の作品IDを指定してください';
  END IF;

  -- リクエスト中の全作品が、当該親の直下にある投稿者本人の作品であること。
  IF EXISTS (
    SELECT 1 FROM unnest(p_ordered_ids) AS ids(id)
    LEFT JOIN public.works AS w ON w.id=ids.id
    WHERE w.id IS NULL OR w.parent_work_id IS DISTINCT FROM p_parent_id
      OR w.author_id IS DISTINCT FROM v_actor
  ) OR (SELECT COUNT(*) FROM public.works w WHERE w.parent_work_id=p_parent_id) <> v_count THEN
    RAISE EXCEPTION '下位作品の一覧が変更されました。画面を再読み込みしてからやり直してください';
  END IF;

  -- updateはorder_indexだけ。既存の公開済み本文を改訂扱いにはしない。
  -- SECURITY DEFINER で、審査済み作品に対する通常のUPDATE禁止を回避する。
  -- 作者本人がこの作品群を所有することは上で検証済み。
  UPDATE public.works AS w
     SET order_index=(seq.position-1)::integer
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS seq(work_id,position)
   WHERE w.id=seq.work_id AND w.parent_work_id=p_parent_id AND w.author_id=v_actor;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> v_count THEN
    RAISE EXCEPTION '並び順の保存に失敗しました。再度お試しください';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_my_group_children(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_my_group_children(uuid,uuid[]) TO authenticated;
COMMENT ON FUNCTION public.reorder_my_group_children(uuid,uuid[]) IS
  '作者本人が直下の全作品を指定した順に並び替える。公開状態と本文は変更しない。';
COMMIT;
