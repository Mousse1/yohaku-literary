# 余白。v6.8 — 第三者による注釈・異論／参考文献・解説の投稿

## 今回の変更

- **「読む」画面**: 公開作品にログインした読者が「注釈・異論」「参考文献・解説」を投稿できます。
- **「並べて読む」画面**: 「注釈・異論」「参考文献・解説」パネルでも投稿フォームを開けます。
- **承認制**: 読者の提案は `pending` で保存。管理者が承認したものだけ公開されます。
- **著者と第三者を分離**: 作者の `work_references` と読者提案の `community_references` は別管理。作者の参考文献 **20件** 制限は変更していません。
- **収録作品の引用元**: 下位の公開作品に寄せられた承認済み文献提案も、上位グループの「下位作品の参考文献」から参照できます。提案元の章・節も表示します。
- **注釈**: 既存の `notes` テーブルと承認画面を再利用。第三者も投稿可能だった機能を並列読書へ拡張しました。

## 公開サイトの更新手順 — 必ずこの順序で

1. Supabaseのデータベースをバックアップしてください。特に既存原稿の保全が必要です。
2. Supabase Dashboard → **SQL Editor → New query** を開き、ZIP内の `yohaku-public/supabase/migrations/20261030_community_references_v6_8.sql` **全文**を貼り付けて実行します。成功したら以下の確認SQLを実行します。
3. GitHubの本番ブランチで、ZIP内の `yohaku-public` の更新済みファイルを既存ファイルに反映します。CloudflareのRoot directory が `package.json` と `index.html` のあるフォルダと一致しているか確認します。
4. Cloudflare Workersにて **ビルド・デプロイ**。公開サイトのHTMLにある `<meta name="yohaku-version" content="v6.8">` を確認します。Workersの場合、既存の `wrangler.jsonc` を使用します。
5. **通常の読書**・**並列読書**の両方で、一般利用者が提案 → 管理者が承認 → シークレットウィンドウで確認、を検証します。

### SQLの確認

```sql
select to_regclass('public.community_references') as community_references;
select routine_name from information_schema.routines
where routine_schema='public' and routine_name='list_descendant_community_references';
select policyname,roles,cmd from pg_policies
where schemaname='public' and tablename='community_references';
```

`community_references` がNULLでないこと、関数とRLSポリシーが作成されていることを確認します。

## 使い方

- 第三者は **Supabaseでログイン** します。Cloudflare自体のログインは不要です。
- 各公開作品にある **「注釈・異論を投稿」** または **「参考文献・解説を追加」** を押し、必要事項を入力して「審査へ提出」を押します。
- 管理者は「管理・審査」で、既存の注釈と新設の「第三者の参考文献・解説」の承認・却下を行います。
- 承認されるまでは、提案者本人と管理者以外には提案本文が表示されません。作者の本文・参考文献は変更されません。

## 制限と留意点

- 作者登録文献：**1作品につき20件**（既存仕様）。
- 第三者の文献提案：**提案者1人につき同じ作品で承認済み・審査待ちの合計20件まで**、かつ **1日20件まで**。これは作者枠とは独立しています。
- 注釈・異論：**5〜2,000文字**（既存制限）。
- 文献解説：**5〜4,000文字**、文献名1〜300文字、提案者筆名1〜80文字、任意の `https://` URL。
- 作品が非公開になった場合は、提案も一般利用者には表示されません。削除された場合は親作品とともに削除されます。
- サーバーのRLSがアクセスを制限しています。**RLSを無効にしないでください。** `service_role` / `secret` keyをフロントエンドに置かないでください。
- 利用規約・プライバシー表示文言は運営者自身で確定してください。誤った出典や権利侵害、スパム対策・通報運用は別途必要です。

## 変更するファイル

- `src/main.jsx` — 通常読書と管理・審査
- `src/ParallelReader.jsx` — 並列読書の投稿フォーム
- `src/CommunityContributions.jsx` — 新規、投稿フォーム／表示
- `src/DescendantReferences.jsx` — 下位作品の読者投稿文献の集約
- `src/style.css` — 表示スタイル
- `supabase/migrations/20261030_community_references_v6_8.sql` — 新規、DBテーブル／RLS／審査対象／階層集約RPC
- `index.html` — バージョン表示
- `package.json` — パッケージ版番号のみ

## 検証

この配布版ではJavaScript/JSXの構文解析と既存の階層読書テストを実行しています。ネットワーク制限によりnpmの依存パッケージが取得できず、**Cloudflare上での最終ビルド／Supabaseへの実行・認証・RLSの実テストは未実施**です。一般ユーザーの募集前に、テストアカウントで権限と審査フローの検証を必ず行ってください。
