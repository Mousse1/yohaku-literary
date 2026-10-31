-- Yohaku v7.9: optional, multiple subcategories and moderated shared vocabulary.
-- Apply after existing v7.x migrations. Atomic and repeatable; no work rows or
-- revision snapshots are rewritten. Existing RPC signatures remain unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS public.work_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK(section IN ('文学','哲学','評論','科学','その他')),
  name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 80 AND name=btrim(name)),
  is_legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS work_classifications_name_unique
  ON public.work_classifications(section,lower(name));
CREATE TABLE IF NOT EXISTS public.classification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK(section IN ('文学','哲学','評論','科学','その他')),
  name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 80 AND name=btrim(name)),
  reason text NOT NULL DEFAULT '' CHECK(char_length(reason)<=500),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note text NOT NULL DEFAULT '' CHECK(char_length(review_note)<=500),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS classification_requests_one_pending
  ON public.classification_requests(section,lower(name)) WHERE status='pending';

INSERT INTO public.work_classifications(section,name,is_legacy) VALUES
('文学','純文学',false),('文学','実験文学',false),('文学','詩・散文',false),('文学','哲学小説',true),
('哲学','理論哲学',false),('哲学','実践哲学',false),
('評論','文芸',false),('評論','映画',false),('評論','アニメ',false),('評論','ゲーム',false),('評論','文芸評論',true),('評論','ノベルゲーム',true),
('科学','数学',false),('科学','物理学',false),('科学','脳科学',false),('科学','心理学',false),('科学','精神医学',false),('科学','科学',true),('その他','その他',false)
ON CONFLICT DO NOTHING;

ALTER TABLE public.work_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_classifications,public.classification_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.work_classifications TO anon,authenticated;
GRANT SELECT ON public.classification_requests TO authenticated;
DROP POLICY IF EXISTS classification_catalog_read ON public.work_classifications;
CREATE POLICY classification_catalog_read ON public.work_classifications FOR SELECT TO anon,authenticated USING(true);
DROP POLICY IF EXISTS classification_requests_read ON public.classification_requests;
CREATE POLICY classification_requests_read ON public.classification_requests FOR SELECT TO authenticated
  USING(requester_id=(SELECT auth.uid()) OR private.is_moderator());

CREATE OR REPLACE FUNCTION public.propose_work_classification(p_section text,p_name text,p_reason text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_name text:=btrim(p_name);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ログインしてください' USING ERRCODE='42501';END IF;
  IF p_section IS NULL OR p_section NOT IN ('文学','哲学','評論','科学','その他') OR v_name IS NULL
     OR char_length(v_name) NOT BETWEEN 1 AND 80 OR char_length(coalesce(p_reason,''))>500
     OR v_name ~ '[[:cntrl:]]' THEN RAISE EXCEPTION '分野・分類名・説明を確認してください' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM public.work_classifications WHERE section=p_section AND lower(name)=lower(v_name)) THEN
    RAISE EXCEPTION 'この分類はすでに利用できます' USING ERRCODE='23505';END IF;
  INSERT INTO public.classification_requests(section,name,reason,requester_id)
    VALUES(p_section,v_name,coalesce(p_reason,''),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.propose_work_classification(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.propose_work_classification(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_work_classification(p_request_id uuid,p_approve boolean,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request public.classification_requests;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_moderator() THEN RAISE EXCEPTION '管理権限がありません' USING ERRCODE='42501';END IF;
  IF p_approve IS NULL OR char_length(coalesce(p_note,''))>500 THEN RAISE EXCEPTION '審査結果・コメントを確認してください' USING ERRCODE='22023';END IF;
  SELECT * INTO v_request FROM public.classification_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status<>'pending' THEN RAISE EXCEPTION '審査待ちの申請がありません' USING ERRCODE='22023';END IF;
  IF p_approve THEN
    INSERT INTO public.work_classifications(section,name) VALUES(v_request.section,v_request.name) ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.classification_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewer_id=auth.uid(),review_note=coalesce(p_note,''),reviewed_at=now() WHERE id=p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.review_work_classification(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_work_classification(uuid,boolean,text) TO authenticated;

-- genre remains text for compatibility with all existing save/revision RPCs:
-- legacy single label, JSON array for multiple selections, [] for no selection.
CREATE OR REPLACE FUNCTION private.valid_work_classifications(p_section text,p_genre text)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v_values jsonb;v_value jsonb;v_name text;v_seen text[]:=ARRAY[]::text[];
BEGIN
  IF p_genre IS NULL OR (p_section IS NOT NULL AND p_section NOT IN ('文学','哲学','評論','科学','その他')) THEN RETURN false;END IF;
  IF left(btrim(p_genre),1)='[' THEN v_values:=p_genre::jsonb;
  ELSIF btrim(p_genre)='' THEN v_values:='[]'::jsonb;
  ELSE v_values:=jsonb_build_array(p_genre);END IF;
  IF jsonb_typeof(v_values)<>'array' OR jsonb_array_length(v_values)>100 THEN RETURN false;END IF;
  FOR v_value IN SELECT value FROM jsonb_array_elements(v_values) LOOP
    IF jsonb_typeof(v_value)<>'string' THEN RETURN false;END IF;
    v_name:=v_value#>>'{}';
    IF v_name<>btrim(v_name) OR v_name=ANY(v_seen) OR NOT EXISTS(
      SELECT 1 FROM public.work_classifications c WHERE c.name=v_name AND (p_section IS NULL OR c.section=p_section)
    ) THEN RETURN false;END IF;
    v_seen:=array_append(v_seen,v_name);
  END LOOP;
  RETURN true;
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.valid_work_classifications(text,text) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.valid_work_classifications(text,text) TO authenticated;
ALTER TABLE public.works DROP CONSTRAINT IF EXISTS works_genre_check;
ALTER TABLE public.works DROP CONSTRAINT IF EXISTS works_section_genre_check;
ALTER TABLE public.works DROP CONSTRAINT IF EXISTS works_classifications_check;
ALTER TABLE public.works ADD CONSTRAINT works_classifications_check CHECK(private.valid_work_classifications(section,genre));

-- Preserve the installed validator's title/body/reference/draft rules verbatim.
-- Copy ONCE, rather than replacing them with a possibly older release's rules.
DO $migration$
DECLARE v_source text;
BEGIN
  IF to_regprocedure('private.validate_revision_payload(jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION '既存のv7系SQLを先に適用してください';
  END IF;
  IF to_regprocedure('private.validate_revision_payload_v781_base(jsonb,jsonb)') IS NULL THEN
    SELECT pg_get_functiondef('private.validate_revision_payload(jsonb,jsonb)'::regprocedure) INTO v_source;
    v_source:=replace(v_source,'FUNCTION private.validate_revision_payload(', 'FUNCTION private.validate_revision_payload_v781_base(');
    EXECUTE v_source;
  END IF;
END;
$migration$;
REVOKE ALL ON FUNCTION private.validate_revision_payload_v781_base(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.validate_revision_payload_v781_base(jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.validate_revision_payload(p_data jsonb,p_refs jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_placeholder text;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR NOT private.valid_work_classifications(p_data->>'section',p_data->>'genre') THEN
    RAISE EXCEPTION '承認済みの小分類を選択してください（未選択も可能です）';
  END IF;
  v_placeholder:=CASE p_data->>'section' WHEN '哲学' THEN '理論哲学' WHEN '評論' THEN '文芸' WHEN '科学' THEN '数学' WHEN 'その他' THEN 'その他' ELSE '純文学' END;
  PERFORM private.validate_revision_payload_v781_base(jsonb_set(p_data,'{genre}',to_jsonb(v_placeholder)),p_refs);
END;
$$;
REVOKE ALL ON FUNCTION private.validate_revision_payload(jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.validate_revision_payload(jsonb,jsonb) TO authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
