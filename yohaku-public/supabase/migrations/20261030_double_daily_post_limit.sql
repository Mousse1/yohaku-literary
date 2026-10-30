-- 余白。v7.2.3: 新規投稿上限を8件から16件に変更します。
-- 「1日」は直近24時間を意味します。本文とグループの新規作成を両方数えます。
-- 既存の作品・ユーザー・既存の権限・トリガーは変更しません。
-- 本番実行前にバックアップを確認してください。

begin;

create or replace function private.check_work_submission_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.author_id::text));
  select count(*) into recent_count
    from public.works
   where author_id = new.author_id
     and created_at > now() - interval '24 hours';
  if recent_count >= 16 then
    raise exception '1日あたりの新規投稿上限（16件）に達しました。';
  end if;
  return new;
end;
$$;

revoke all on function private.check_work_submission_limit() from public, anon, authenticated;

commit;
