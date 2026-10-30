# 余白。改訂管理版 — 既存公開サイトを更新する手順

このパッケージは以前の `yohaku-public-ready.zip` に **改訂案と公開版の分離、版履歴、公開停止・削除申請** を追加したものです。既存のSupabaseデータを消さずに移行する設計です。

## まず重要なこと

- **既存の `supabase/schema.sql` を既存DBに再実行しないでください。** 新しいDBを作成する場合だけ `schema.sql` → `supabase/migrations/20261028_revisions_and_requests.sql` の順に実行します。
- 既存の本番Supabase DBをバックアップし、可能ならステージング用DBで試してください。
- **最初にSupabaseのSQL移行を済ませ、その後GitHubでサイトを更新**します。移行前に新コードをデプロイすると、改訂機能用テーブルが見つからず「自分の作品」などがエラーになります。
- 削除申請の承認は **作品・本文・参考文献・注釈・改訂履歴をすべて物理削除**します。元に戻せません。
- 公開停止申請も削除申請も、**審査が終わるまでは公開継続**します（申請だけでは自動的に非公開になりません）。緊急削除は運営者が管理画面から対応してください。

## 1. Supabaseで既存DBに移行SQLを適用

1. https://supabase.com/dashboard の「余白。」で使っているプロジェクトを開く。
2. 「SQL Editor」→「New query」を選ぶ。
3. `supabase/migrations/20261028_revisions_and_requests.sql` の全文をコピーして実行する。
4. 成功したら「Table Editor」で `work_revisions`, `publication_requests` が追加されたことを確認する。
5. `works` に `current_version` 列が追加され、既存の公開作品に第1版の履歴が作成されたことを確認する。

### 確認用SQL

```sql
select w.title, w.status, w.current_version,
       (select count(*) from public.work_revisions r
        where r.work_id=w.id and r.status='approved') as approved_versions
from public.works w
order by w.created_at desc limit 20;
```

すでに公開されていた作品には「第1版」を移行時のデータから作成します。以前の改稿履歴を過去に遡って復元することはできません。

## 2. GitHubのコードを更新

1. このパッケージを解凍する。
2. **前回GitHubにアップロードしたプロジェクトフォルダの中身**を、新版の `yohaku-public/` の中身で置き換える。以前の配置が `yohaku-public/package.json` なら今回も同じ階層に `package.json` を置く。
3. `src/main.jsx`、`src/style.css`、`supabase/migrations/..sql`、`wrangler.jsonc` 等をコミットする。
4. 以前の `public/_redirects` は **削除した状態**にしてください。Workersのデプロイで infinite loop を発生させていたためです。
5. Cloudflare Workers Buildsが新しいGitHubコミットで再ビルド・再デプロイするのを確認する。

### Cloudflare Workersの設定

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`（Workers Buildsの場合）
- Root directory: `package.json` の置かれているフォルダ（例: `yohaku-public`）
- ビルド時の環境変数: `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（必要な場合は `VITE_CONTACT_EMAIL` 等も）
- `wrangler.jsonc` の `assets.directory` が `./dist` になっていることを確認。

`VITE_` 変数は **ビルド時** に組み込まれます。Worker実行時の「Variables and Secrets」に追加しただけではReactアプリで読み込めないことがあります。公開キーだけを設定し、`service_role` や Supabase Secret Key をサイトへ渡さないでください。

## 3. 4つの新機能の使い方

### ① 公開済み作品の編集申請と再審査

「自分の作品」→ 公開済みの作品 →「改訂版を書く」→ 変更内容を入力 →「審査へ提出」。審査待ち中の改訂案は「改訂案を編集」から変更できます。

### ② 旧版を維持しながら新版を審査

`works` テーブルの公開本文は審査の間は変更されません。管理者の「管理・審査」→「改訂案の再審査」→「新版を承認」で、本文・参考文献・現在の版番号が **1トランザクションで** 切り替わります。「差し戻す」も可能です。

### ③ 投稿者による公開停止・削除申請

「自分の作品」→「公開停止を申請」または「削除を申請」→理由を入力→送信。管理者は「公開停止・削除申請」で承認／却下できます。申請中は作者が「取り消す」もできます。

**公開停止の承認**: 作品が非公開となり、公開版の履歴も一般閲覧できなくなります（保存は継続）。**削除の承認**: 作品に紐づくデータを物理削除します。

### ④ 改訂履歴の保存・閲覧

公開作品の「読む・履歴」→「改訂履歴」。各承認済み版の本文と参考文献を開けます。閲覧者には承認済み版だけが見え、下書きや審査待ちの原稿は表示されません。

## 4. 必須の動作確認

- [ ] 既存の公開作品がそのまま読める。
- [ ] 既存の公開作品に「第1版」が表示される。
- [ ] 投稿者が改訂案を下書き保存・審査提出できる。
- [ ] 審査中、一般読者には旧版が表示され、新版は見えない。
- [ ] 管理者の承認で新版へ切り替わり、旧版も履歴から閲覧できる。
- [ ] 差し戻した改訂案を投稿者が再編集できる。
- [ ] 他人の改訂案は閲覧・編集できない。
- [ ] 作者の公開停止申請 → 管理者の承認で非公開になる。
- [ ] 作者の削除申請 → 管理者の承認で作品・履歴・注釈が消える。
- [ ] ログアウト状態の閲覧者からは審査中原稿と非公開作品が見えない。

## 注意事項・限界

- **本番Supabase接続による結合テストは未実施**です。SQLの実行権限、メール認証、RLS、RPCを本番公開前にステージング環境で検証してください。
- 既存の公開作品の「第1版」は **移行時点の内容** であり、過去の編集履歴を推測して作成したものではありません。
- 改訂途中の保存は作品ごとに1件です。承認済み版は保持され、下書きや差し戻し状態は同じレコードを再編集します。
- `work_revisions` と `publication_requests` のDBへの書き込みは権限を検証するRPC経由のみです。ブラウザに管理者秘密鍵を置かないでください。
- 規約・個人情報・権利侵害・バックアップの運用は別途必要です。
