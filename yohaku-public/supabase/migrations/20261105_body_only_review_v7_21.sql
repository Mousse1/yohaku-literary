-- Apply after v7.20. Existing data and publication states are preserved.
BEGIN;
CREATE OR REPLACE FUNCTION private.require_review_body()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status IN ('pending','published')
     AND regexp_replace(coalesce(NEW.body,''),'[[:space:]　 ﻿]+','','g')=''
     AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.body IS DISTINCT FROM OLD.body) THEN
    RAISE EXCEPTION '本文のないグループ・作品は審査対象ではありません。審査なしで公開してください';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.require_review_body() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS works_00_require_review_body ON public.works;
CREATE TRIGGER works_00_require_review_body BEFORE INSERT OR UPDATE ON public.works
FOR EACH ROW EXECUTE FUNCTION private.require_review_body();
COMMIT;
