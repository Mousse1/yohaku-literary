-- 余白。v7.2.5 / 投稿上限16件・新規下書き上限32件（各直近24時間）
-- v7.2.4 および 20261030_double_daily_post_limit.sql 適用済みのDBへ実行。
-- 投稿（審査待ち・自由公開）は16件、下書きとして新規保存する作品は32件。
-- 下書きから投稿に変更する際にも投稿枠を確認。既存下書きの編集は件数に含めない。
-- 投稿の削除と再作成による回避を防ぐため、非公開の独立イベント台帳を保持する。
-- 実行前にDBバックアップを取得してください。作品本文や参考文献は削除しません。
BEGIN;

CREATE TABLE IF NOT EXISTS private.work_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_id uuid NOT NULL,
  author_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('draft_created', 'submitted')),
  event_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_limit_event_once UNIQUE (work_id, event_type)
);
CREATE INDEX IF NOT EXISTS work_limit_events_recent
  ON private.work_limit_events (author_id, event_type, event_at DESC);

-- 既存作品については作成日を起点に推定して引き継ぐ。
-- 過去に「下書き → 投稿」と変更された正確な日時は既存DBに記録されていないため、
-- その分は created_at を採用する。今後の変更は実際の提出日時で計上する。
INSERT INTO private.work_limit_events(work_id,author_id,event_type,event_at)
SELECT id,author_id,
       CASE WHEN status = 'draft' THEN 'draft_created' ELSE 'submitted' END,
       created_at
  FROM public.works
ON CONFLICT (work_id, event_type) DO NOTHING;

ALTER TABLE private.work_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.work_limit_events FROM PUBLIC, anon, authenticated;

-- 投稿枠と下書き枠は独立。登録する作品単位で最初の一回だけ計上する。
CREATE OR REPLACE FUNCTION private.check_work_submission_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_type text;
  v_limit integer;
  v_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := CASE WHEN NEW.status = 'draft' THEN 'draft_created' ELSE 'submitted' END;
  ELSIF TG_OP = 'UPDATE' THEN
    -- すでに投稿済みの作品の再編集・差し戻し・公開停止等は新規投稿ではない。
    -- 初回下書きの提出時だけ投稿枠に計上する。
    IF OLD.status = 'draft' AND NEW.status <> 'draft'
       AND NOT EXISTS (
         SELECT 1 FROM private.work_limit_events
          WHERE work_id = NEW.id AND event_type = 'submitted'
       ) THEN
      v_event_type := 'submitted';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  v_limit := CASE WHEN v_event_type = 'draft_created' THEN 32 ELSE 16 END;

  -- 同一投稿者の同時処理を直列化し、複数リクエストで上限を超えないようにする。
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(NEW.author_id::text));
  IF EXISTS (
    SELECT 1 FROM private.work_limit_events
     WHERE work_id = NEW.id AND event_type = v_event_type
  ) THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_count
    FROM private.work_limit_events
   WHERE author_id = NEW.author_id
     AND event_type = v_event_type
     AND event_at > now() - interval '24 hours';
  IF v_count >= v_limit THEN
    IF v_event_type = 'draft_created' THEN
      RAISE EXCEPTION '1日あたりの新規下書き上限（32件）に達しました。';
    ELSE
      RAISE EXCEPTION '1日あたりの新規投稿上限（16件）に達しました。';
    END IF;
  END IF;

  INSERT INTO private.work_limit_events(work_id,author_id,event_type,event_at)
  VALUES (NEW.id, NEW.author_id, v_event_type, now());
  RETURN NEW;
END;
$$;

-- 古い「新規作成なら一律16件」のトリガーを置き換える。
DROP TRIGGER IF EXISTS works_submission_limit ON public.works;
CREATE TRIGGER works_submission_limit
  BEFORE INSERT OR UPDATE OF status ON public.works
  FOR EACH ROW EXECUTE FUNCTION private.check_work_submission_limit();
REVOKE ALL ON FUNCTION private.check_work_submission_limit() FROM PUBLIC, anon, authenticated;

COMMIT;
