-- 余白。v7.5.3: 空の下書きを「作成」を押した時点で確保できるようにする。
-- 既存の v7.2.5 投稿16件/24時間・下書き32件/24時間のトリガーを維持。
-- 必須項目は下書きの間だけ任意。公開・審査提出時は以前と同じ厳格な条件。
-- 先にDBをバックアップ。適用後、Cloudflare Workerを更新してください。
BEGIN;
ALTER TABLE public.works DROP CONSTRAINT IF EXISTS works_title_check;
ALTER TABLE public.works ADD CONSTRAINT works_title_check CHECK (
  char_length(btrim(title)) <= 180 AND (status='draft' OR char_length(btrim(title))>=1)
);
ALTER TABLE public.works DROP CONSTRAINT IF EXISTS works_pen_name_check;
ALTER TABLE public.works ADD CONSTRAINT works_pen_name_check CHECK (
  char_length(btrim(pen_name)) <= 80 AND (status='draft' OR char_length(btrim(pen_name))>=1)
);
ALTER TABLE public.works DROP CONSTRAINT IF EXISTS works_body_check;
ALTER TABLE public.works ADD CONSTRAINT works_body_check CHECK (
  char_length(body) <= 200000 AND
  (status='draft' OR node_kind='collection' OR char_length(btrim(body))>=10)
);
-- 既存の紹介文（任意・上限1000文字）とほかの制限は変更しない。
COMMIT;
