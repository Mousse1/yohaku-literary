-- 余白。v6.4：下位の公開作品に紐づく参考文献を親作品で参照する。
-- 前提：v6（階層作品）以降のマイグレーションを適用済み。
-- 本SQLは閲覧専用RPCの追加だけを行い、作品本文や既存文献を変更しない。
begin;

create or replace function public.list_descendant_references(p_work_id uuid)
returns table (
  source_work_id uuid,
  source_title text,
  source_path text,
  source_depth integer,
  reference_id uuid,
  reference_title text,
  reference_relation text,
  reference_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive visible_nodes as (
    -- 公開中の親作品が指定されたときだけ探索を開始。
    select w.id, w.title, w.parent_work_id, 0::integer as depth,
           array[w.id] as visited,
           array[]::text[] as title_path,
           array[]::text[] as sort_path
    from public.works w
    where w.id = p_work_id and w.status = 'published'
    union all
    -- 非公開・審査待ちの枝には入らず、その下層も含めて公開しない。
    select child.id, child.title, child.parent_work_id, parent.depth + 1,
           parent.visited || child.id,
           parent.title_path || child.title,
           parent.sort_path || (lpad(child.order_index::text, 6, '0') || ':' || child.id::text)
    from public.works child
    join visible_nodes parent on child.parent_work_id = parent.id
    where child.status = 'published'
      and parent.depth < 32
      and not child.id = any(parent.visited)
  )
  select n.id as source_work_id,
         n.title as source_title,
         array_to_string(n.title_path, ' › ') as source_path,
         n.depth as source_depth,
         r.id as reference_id,
         r.title as reference_title,
         r.relation as reference_relation,
         r.url as reference_url
  from visible_nodes n
  join public.work_references r on r.work_id = n.id
  where n.depth > 0
  order by n.sort_path, r.created_at, r.id;
$$;

-- SECURITY INVOKER は読み手のRLSに従う。
-- 公開作品の参考文献だけを匿名閲覧可能にし、未承認原稿は返さない。
revoke all on function public.list_descendant_references(uuid) from public;
grant execute on function public.list_descendant_references(uuid) to anon, authenticated;

-- APIスキーマキャッシュ更新
notify pgrst, 'reload schema';
commit;
