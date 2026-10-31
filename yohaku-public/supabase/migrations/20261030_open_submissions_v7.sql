-- 余白。v7：審査を待たない自由公開。既存の審査済み投稿・階層・参考文献を保持する。
-- 前提：v6.9までのマイグレーション適用済み。データベースをバックアップしてください。
-- 自由公開（open）は事前審査を受けていない。publishedは管理者の審査を経た作品。
BEGIN;

ALTER TABLE public.works DROP CONSTRAINT IF EXISTS works_status_check;
ALTER TABLE public.works ADD CONSTRAINT works_status_check
 CHECK (status IN ('draft','pending','open','published','rejected','hidden'));
CREATE INDEX IF NOT EXISTS works_public_both_date ON public.works(created_at DESC)
 WHERE status IN ('published','open');

-- 子作品の公開は、親も（審査済みか自由公開として）公開されている場合のみ。
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
           coalesce(bool_or(status not in ('published','open')),false),
           coalesce(max(depth),0)
    into chain_has_cycle,chain_has_unpublished,max_depth from chain;
  if chain_has_cycle then raise exception '親子関係が循環します'; end if;
  if max_depth>=12 then raise exception '階層は最大12段までです'; end if;
  if new.status in ('published','open') and chain_has_unpublished then
    raise exception '親作品を先に公開してください';
  end if;
  return new;
end;
$$;

create or replace function private.is_published_in_hierarchy(p_work_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  with recursive chain as (
    select id,parent_work_id,status,1 as depth from public.works where id=p_work_id
    union all
    select w.id,w.parent_work_id,w.status,c.depth+1
    from public.works w join chain c on w.id=c.parent_work_id where c.depth<13
  )
  select coalesce(count(*)>0 and bool_and(status in ('published','open'))
    and bool_or(parent_work_id is null) and max(depth)<=12,false) from chain;
$$;

-- 作品の匿名閲覧は階層全体で公開中のものだけ。
DROP POLICY IF EXISTS "public works visible" ON public.works;
CREATE POLICY "public works visible" ON public.works
 FOR SELECT TO anon, authenticated
 USING (status IN ('published','open') AND (SELECT private.is_published_in_hierarchy(id)));

-- 自由公開と審査申請を選べる。本人が published（審査済み）へ自己昇格することは不可。
DROP POLICY IF EXISTS "author can submit own work" ON public.works;
CREATE POLICY "author can submit own work" ON public.works FOR INSERT TO authenticated
 WITH CHECK (author_id = (SELECT auth.uid()) AND status IN ('draft','pending','open'));
DROP POLICY IF EXISTS "author can revise unapproved works" ON public.works;
CREATE POLICY "author can revise unapproved works" ON public.works FOR UPDATE TO authenticated
 USING (author_id = (SELECT auth.uid()) AND status IN ('draft','pending','rejected','open'))
 WITH CHECK (author_id = (SELECT auth.uid()) AND status IN ('draft','pending','rejected','open'));
DROP POLICY IF EXISTS "author can delete unapproved works" ON public.works;
CREATE POLICY "author can delete unapproved works" ON public.works FOR DELETE TO authenticated
 USING (author_id = (SELECT auth.uid()) AND status IN ('draft','pending','rejected','open'));

DROP POLICY IF EXISTS "public can read approved references" ON public.work_references;
CREATE POLICY "public can read approved references" ON public.work_references FOR SELECT TO anon,authenticated
 USING (EXISTS(SELECT 1 FROM public.works w WHERE w.id=work_id AND w.status IN ('published','open')));
DROP POLICY IF EXISTS "author can insert references" ON public.work_references;
CREATE POLICY "author can insert references" ON public.work_references FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.works w WHERE w.id=work_id AND w.author_id=(SELECT auth.uid()) AND w.status IN ('draft','pending','rejected','open')));
DROP POLICY IF EXISTS "author can change references" ON public.work_references;
CREATE POLICY "author can change references" ON public.work_references FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.works w WHERE w.id=work_id AND w.author_id=(SELECT auth.uid()) AND w.status IN ('draft','pending','rejected','open')))
 WITH CHECK (EXISTS(SELECT 1 FROM public.works w WHERE w.id=work_id AND w.author_id=(SELECT auth.uid()) AND w.status IN ('draft','pending','rejected','open')));
DROP POLICY IF EXISTS "author can delete references" ON public.work_references;
CREATE POLICY "author can delete references" ON public.work_references FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.works w WHERE w.id=work_id AND w.author_id=(SELECT auth.uid()) AND w.status IN ('draft','pending','rejected','open')));

-- 参考文献の「１作品20件」を直接のテーブル操作でも守る。
CREATE OR REPLACE FUNCTION private.limit_work_reference_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(NEW.work_id::text));
  IF (SELECT count(*) FROM public.work_references WHERE work_id=NEW.work_id) >= 20 THEN
    RAISE EXCEPTION '参考文献は作品ごとに20件までです';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS work_reference_count_cap ON public.work_references;
CREATE TRIGGER work_reference_count_cap BEFORE INSERT ON public.work_references
 FOR EACH ROW EXECUTE FUNCTION private.limit_work_reference_count();
REVOKE ALL ON FUNCTION private.limit_work_reference_count() FROM PUBLIC,anon,authenticated;

-- 注釈や第三者の文献提案は従来どおり管理者承認制のまま。
DROP POLICY IF EXISTS "public can read approved notes" ON public.notes;
CREATE POLICY "public can read approved notes" ON public.notes FOR SELECT TO anon,authenticated
 USING (status='published' AND EXISTS(SELECT 1 FROM public.works w WHERE w.id=work_id AND w.status IN ('published','open')));
DROP POLICY IF EXISTS "reader can suggest note" ON public.notes;
CREATE POLICY "reader can suggest note" ON public.notes FOR INSERT TO authenticated
 WITH CHECK (author_id=(SELECT auth.uid()) AND status='pending' AND EXISTS(SELECT 1 FROM public.works w WHERE w.id=work_id AND w.status IN ('published','open')));
DROP POLICY IF EXISTS "community references visible when approved" ON public.community_references;
CREATE POLICY "community references visible when approved" ON public.community_references FOR SELECT TO anon,authenticated
 USING (status='published' AND EXISTS(SELECT 1 FROM public.works w WHERE w.id=work_id AND w.status IN ('published','open')));
DROP POLICY IF EXISTS "reader suggests community reference" ON public.community_references;
CREATE POLICY "reader suggests community reference" ON public.community_references FOR INSERT TO authenticated
 WITH CHECK (author_id=(SELECT auth.uid()) AND status='pending' AND EXISTS(SELECT 1 FROM public.works w WHERE w.id=work_id AND w.status IN ('published','open')));
DROP POLICY IF EXISTS "reader may report published work" ON public.reports;
CREATE POLICY "reader may report published work" ON public.reports FOR INSERT TO authenticated
 WITH CHECK (reporter_id=(SELECT auth.uid()) AND resolved=false AND EXISTS(SELECT 1 FROM public.works w WHERE w.id=work_id AND w.status IN ('published','open')));

-- 旧RPCと同じ署名で更新。必ず投稿者自身の権限(RLS)で実行される。
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
  if p_status not in ('draft','pending','open') then raise exception '投稿状態が不正です'; end if;
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
    where id=p_id and author_id=(select auth.uid()) and status in ('draft','pending','rejected','open')
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
    where w.id = p_work_id and w.status in ('published','open')
    union all
    -- 非公開・審査待ちの枝には入らず、その下層も含めて公開しない。
    select child.id, child.title, child.parent_work_id, parent.depth + 1,
           parent.visited || child.id,
           parent.title_path || child.title,
           parent.sort_path || (lpad(child.order_index::text, 6, '0') || ':' || child.id::text)
    from public.works child
    join visible_nodes parent on child.parent_work_id = parent.id
    where child.status in ('published','open')
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
    from public.works w where w.id=p_work_id and w.status in ('published','open')
    union all
    select w.id,w.parent_work_id,n.depth+1,n.visited||w.id,n.title_path||w.title
    from public.works w join visible_nodes n on w.parent_work_id=n.id
    where w.status in ('published','open') and n.depth<32 and not (w.id=any(n.visited))
  )
  select n.id,array_to_string(n.title_path,' › '),r.id,r.title,r.explanation,r.url,r.pen_name
  from visible_nodes n join public.community_references r on r.work_id=n.id
  where n.depth>0 and r.status='published'
  order by n.title_path,r.created_at,r.id;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
