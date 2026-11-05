-- Yohaku v7.20. Apply before deploying the new UI. Transactional and repeatable.
-- No work, reference, ID, URL or historical flag is rewritten by this migration.
BEGIN;
CREATE OR REPLACE FUNCTION private.protect_freely_published_works()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_owner boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.freely_published_once := (NEW.status='open');
    NEW.current_version := 0;
    RETURN NEW;
  END IF;

  v_is_owner := (v_actor IS NOT NULL AND OLD.author_id=v_actor);
  IF TG_OP = 'DELETE' THEN
    IF OLD.freely_published_once AND OLD.current_version=0 AND OLD.status IN ('draft','open','hidden') AND NOT v_is_owner THEN
      RAISE EXCEPTION '自由公開作品を管理者が直接削除することはできません';
    END IF;
    RETURN OLD;
  END IF;

  -- 設定値を任意の管理者更新で false に戻さない。
  NEW.freely_published_once := OLD.freely_published_once OR NEW.status='open';

  -- Historical free-publication flag is retained. Only the owner can opt in.
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION '作品の所有者は変更できません';
  END IF;
  IF NEW.current_version IS DISTINCT FROM OLD.current_version AND NOT private.is_moderator() THEN
    RAISE EXCEPTION '版番号は審査処理でのみ変更できます';
  END IF;
  IF OLD.status='open' AND NEW.status='pending' AND v_is_owner THEN
    RETURN NEW;
  END IF;
  IF OLD.freely_published_once AND OLD.current_version=0
     AND OLD.status IN ('draft','open','hidden') AND NEW.status IN ('published','rejected') THEN
    RAISE EXCEPTION '投稿者による審査申請が必要です';
  END IF;

  -- 審査済みの親グループを隠すことで、報告のない自由公開の下位本文まで
  -- 間接的に読めなくすることも防ぐ（投稿者本人の操作は除く）。
  IF NOT v_is_owner AND OLD.status IN ('published','open')
     AND (NEW.status NOT IN ('published','open')
          OR NEW.parent_work_id IS DISTINCT FROM OLD.parent_work_id) THEN
    IF EXISTS (
      WITH RECURSIVE children AS (
        SELECT id,parent_work_id,status,freely_published_once,1 AS depth
          FROM public.works WHERE parent_work_id=OLD.id
        UNION ALL
        SELECT w.id,w.parent_work_id,w.status,w.freely_published_once,c.depth+1
          FROM public.works w JOIN children c ON w.parent_work_id=c.id
         WHERE c.depth<12
      ) SELECT 1 FROM children WHERE freely_published_once AND status='open'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.reports r WHERE r.work_id=OLD.id AND r.resolved=false
    ) THEN
      RAISE EXCEPTION '自由公開の下位作品を含むグループは、通報なしに非公開化・移動できません';
    END IF;
  END IF;

  -- 自由公開の掲載・本文は投稿者だけが変更できる。
  IF NOT v_is_owner AND ((OLD.freely_published_once AND OLD.current_version=0 AND OLD.status IN ('draft','open','hidden')) OR NEW.status='open') THEN
    IF OLD.status='open' AND NEW.status='hidden' THEN
      IF NOT private.is_moderator() OR NOT EXISTS (
        SELECT 1
          FROM private.reported_open_hide_authorizations a
          JOIN public.reports r ON r.id=a.report_id
         WHERE a.work_id=OLD.id AND a.moderator_id=v_actor
           AND r.work_id=OLD.id AND r.resolved=false
      ) THEN
        RAISE EXCEPTION '自由公開作品は未処理の通報に基づく専用操作でのみ非公開にできます';
      END IF;
      IF (to_jsonb(NEW) - 'status' - 'updated_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at') THEN
        RAISE EXCEPTION '通報による非公開化では作品本文・所有者・その他の項目を変更できません';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION '自由公開作品の掲載内容・公開状態を管理者が任意に変更することはできません';
  END IF;

  RETURN NEW;
END;
$function$
;

-- A previously free work that has since passed review follows reviewed deletion rules.
DROP POLICY IF EXISTS "author can delete unapproved works" ON public.works;
CREATE POLICY "author can delete unapproved works" ON public.works
FOR DELETE TO authenticated USING (
  author_id=(SELECT auth.uid()) AND (
    status IN ('draft','pending','rejected','open')
    OR (status='hidden' AND freely_published_once AND current_version=0)
  )
);

COMMIT;

