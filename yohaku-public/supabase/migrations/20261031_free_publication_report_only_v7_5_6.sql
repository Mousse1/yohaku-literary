-- 余白。v7.5.6: 自由公開の審査への昇格を禁止し、管理者による非公開を通報対応のみに限定する。
-- 必ず DB のバックアップを取得してから Supabase SQL Editor で実行する。
-- 前提: v7.5.5までのSQL適用済み。変更は既存作品ID/本文/投稿件数には影響しない。
BEGIN;

-- 過去に自由公開された作品は、後から status が変わっても審査済み扱いにならない。
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS freely_published_once boolean NOT NULL DEFAULT false;
-- 単なる保護フラグのバックフィルで『最近編集した順』を変えない。
ALTER TABLE public.works DISABLE TRIGGER works_updated_at;
UPDATE public.works SET freely_published_once=true WHERE status='open';
ALTER TABLE public.works ENABLE TRIGGER works_updated_at;
-- 過去に非公開化された自由公開を完全には識別できないため、既存の hidden 行の判定は変更しない。

-- 通報を指定した RPC の短いトランザクション内だけ使用する許可表。
-- 管理者が works を直接 UPDATE するだけでは自由公開を非公開にできない。
CREATE TABLE IF NOT EXISTS private.reported_open_hide_authorizations (
  work_id uuid NOT NULL,
  report_id uuid NOT NULL,
  moderator_id uuid NOT NULL,
  PRIMARY KEY (work_id, report_id)
);
REVOKE ALL ON private.reported_open_hide_authorizations FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.open_work_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  work_id uuid NOT NULL,
  moderator_id uuid NOT NULL,
  action text NOT NULL CHECK (action='hide'),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS open_work_moderation_by_work ON public.open_work_moderation_log(work_id,created_at DESC);
REVOKE ALL ON public.open_work_moderation_log FROM PUBLIC, anon, authenticated;
ALTER TABLE public.open_work_moderation_log ENABLE ROW LEVEL SECURITY;
-- 監査ログは RPC 経由で記録し、SQL Editor の管理者のみ確認できる。

CREATE OR REPLACE FUNCTION private.protect_freely_published_works()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_is_owner boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.freely_published_once := (NEW.status='open');
    RETURN NEW;
  END IF;

  v_is_owner := (v_actor IS NOT NULL AND OLD.author_id=v_actor);
  IF TG_OP = 'DELETE' THEN
    IF OLD.freely_published_once AND NOT v_is_owner THEN
      RAISE EXCEPTION '自由公開作品を管理者が直接削除することはできません';
    END IF;
    RETURN OLD;
  END IF;

  -- 設定値を任意の管理者更新で false に戻さない。
  NEW.freely_published_once := OLD.freely_published_once OR NEW.status='open';

  IF OLD.freely_published_once AND NEW.status IN ('published','pending','rejected') THEN
    RAISE EXCEPTION '自由公開した作品は審査済み・審査待ちへ変更できません。審査付き作品は新規作成してください';
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
  IF NOT v_is_owner AND (OLD.freely_published_once OR NEW.status='open') THEN
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
$$;
DROP TRIGGER IF EXISTS works_protect_freely_published ON public.works;
CREATE TRIGGER works_protect_freely_published
BEFORE INSERT OR UPDATE OR DELETE ON public.works
FOR EACH ROW EXECUTE FUNCTION private.protect_freely_published_works();
REVOKE ALL ON FUNCTION private.protect_freely_published_works() FROM PUBLIC, anon, authenticated;

-- 本文に加えて著者の参考文献も管理者が任意に書き換えない。
CREATE OR REPLACE FUNCTION private.protect_open_work_references()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_work_id uuid;
  v_owner_id uuid;
  v_freely_published boolean;
  v_status text;
BEGIN
  v_work_id := CASE WHEN TG_OP='DELETE' THEN OLD.work_id ELSE NEW.work_id END;
  SELECT author_id,freely_published_once,status
    INTO v_owner_id,v_freely_published,v_status FROM public.works WHERE id=v_work_id;
  IF v_freely_published AND v_status='open'
     AND v_owner_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION '自由公開作品の参考文献を管理者が直接編集することはできません';
  END IF;
  IF TG_OP='UPDATE' AND NEW.work_id IS DISTINCT FROM OLD.work_id THEN
    SELECT author_id,freely_published_once,status
      INTO v_owner_id,v_freely_published,v_status FROM public.works WHERE id=OLD.work_id;
    IF v_freely_published AND v_status='open'
       AND v_owner_id IS DISTINCT FROM (SELECT auth.uid()) THEN
      RAISE EXCEPTION '自由公開作品から参考文献を移動することはできません';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
DROP TRIGGER IF EXISTS references_protect_freely_published ON public.work_references;
CREATE TRIGGER references_protect_freely_published
BEFORE INSERT OR UPDATE OR DELETE ON public.work_references
FOR EACH ROW EXECUTE FUNCTION private.protect_open_work_references();
REVOKE ALL ON FUNCTION private.protect_open_work_references() FROM PUBLIC, anon, authenticated;

-- 通報1件を受け、非公開化を記録・実行・通報解決まで一括処理する。
CREATE OR REPLACE FUNCTION public.hide_reported_open_work(p_report_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_report public.reports%ROWTYPE;
  v_work public.works%ROWTYPE;
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR NOT private.is_moderator() THEN
    RAISE EXCEPTION '管理者のみ操作できます';
  END IF;
  IF char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION '非公開の理由を1～1000文字で記録してください';
  END IF;
  SELECT work_id INTO v_report.work_id FROM public.reports WHERE id=p_report_id;
  IF v_report.work_id IS NULL THEN RAISE EXCEPTION '通報が存在しません'; END IF;
  SELECT * INTO v_work FROM public.works WHERE id=v_report.work_id FOR UPDATE;
  IF NOT FOUND OR v_work.status<>'open' OR NOT v_work.freely_published_once THEN
    RAISE EXCEPTION '対象は自由公開中の作品ではありません';
  END IF;
  SELECT * INTO v_report FROM public.reports WHERE id=p_report_id FOR UPDATE;
  IF NOT FOUND OR v_report.resolved OR v_report.work_id<>v_work.id THEN
    RAISE EXCEPTION 'この通報は処理済み、または対象が異なります';
  END IF;
  -- 自分自身の通報を自分で裁定できない。
  IF v_report.reporter_id=v_actor THEN
    RAISE EXCEPTION '管理者自身の通報を自身で裁定することはできません';
  END IF;
  INSERT INTO private.reported_open_hide_authorizations(work_id,report_id,moderator_id)
  VALUES(v_work.id,p_report_id,v_actor);
  UPDATE public.works SET status='hidden' WHERE id=v_work.id;
  INSERT INTO public.open_work_moderation_log(report_id,work_id,moderator_id,action,reason)
  VALUES(p_report_id,v_work.id,v_actor,'hide',btrim(p_reason));
  UPDATE public.reports SET resolved=true WHERE work_id=v_work.id AND resolved=false;
  DELETE FROM private.reported_open_hide_authorizations
   WHERE work_id=v_work.id AND report_id=p_report_id;
END;
$$;
REVOKE ALL ON FUNCTION public.hide_reported_open_work(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hide_reported_open_work(uuid,text) TO authenticated;

-- 管理者に隠された自由公開作品も、著者本人による削除だけは認める。
DROP POLICY IF EXISTS "author can delete unapproved works" ON public.works;
CREATE POLICY "author can delete unapproved works" ON public.works FOR DELETE TO authenticated
 USING (author_id=(SELECT auth.uid()) AND
        (status IN ('draft','pending','rejected','open') OR (status='hidden' AND freely_published_once)));

COMMIT;
