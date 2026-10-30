> **最新版 v5:** 二階層分類と「作者／入力・構成」は `UPDATE_V5_GUIDE.md` を参照してください。v4以前の説明は履歴として残しています。

# v4 の更新手順: [UPDATE_V4_GUIDE.md](./UPDATE_V4_GUIDE.md) を最初にお読みください。

# 余白。 — 純文学・実験文学のための公開投稿プラットフォーム

**位置づけ：一般公開用のMVP（改訂・公開申請対応版）**。以前の `localStorage` 試作から、複数ユーザーが作品を共有できる Supabase ベースの設計に変更しています。

作品本文・テーマ・参考文献・作者による新規性の仮説を登録し、作品の比較と読者による批評を行うサイトです。「独創性の自動採点」は行いません。

**既存サイトのアップデート時は最初に [UPDATE_GUIDE.md](UPDATE_GUIDE.md) を読んでください。**

## 技術構成

- **画面**: React + Vite（スマートフォン対応）
- **認証 / データベース**: Supabase Auth + PostgreSQL
- **権限**: PostgreSQL Row Level Security（RLS）
- **ホスティング**: Cloudflare Pages などの静的サイト配信サービス
- **公開ワークフロー**: 下書き → 審査待ち → 承認公開。読者注釈も事前審査。
- **改訂ワークフロー**: 公開中の旧版を保持 → 改訂案の下書き・再審査 → 新版を承認公開。承認済み版は履歴閲覧可能。
- **作者からの申請**: 公開停止と削除申請を管理者へ提出。承認まで現行公開状態を維持。
- **運営**: 管理者による投稿承認・差し戻し・非公開化、通報対応

## ローカルで見る

Node.js 20以上を推奨します。

```bash
npm install
npm run dev
```

ターミナルに表示されたローカル URL を開いてください。

`.env` をまだ用意していない場合は、**架空作品3本だけを読むプレビュー状態**になります。投稿・ログインは使えません。

## 実際に一般公開する手順

### 1. Supabase の作成

1. https://supabase.com で新規プロジェクトを作成する。
2. Supabase の **SQL Editor** を開く。
3. `supabase/schema.sql` を**新規データベースで一度だけ実行**する。続けて `supabase/migrations/20261028_revisions_and_requests.sql` を実行する。既存DBには後者の移行SQLだけを実行します。
4. **Authentication → Providers → Email** でメールログインとメールアドレス確認を有効にする。
5. **Authentication → URL Configuration** で後述の公開 URL を `Site URL` に指定し、`Redirect URLs` に同 URL を登録する。ローカル検証時は `http://localhost:5173` も登録してください。
6. **Project Settings / API** から Project URL と **publishable key**（または従来の anon key）を取得する。

### 2. 環境変数を用意

`.env.example` を `.env` にコピーし、次を設定してください。

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
VITE_CONTACT_EMAIL=operator@example.com
VITE_OPERATOR_NAME=運営者名
```

`VITE_` 付きの変数はブラウザに公開されます。**絶対に service_role / secret key を設定しないでください。**

### 3. 初期運営者を設定する

まずサイトからメールアドレスで登録・認証し、Supabase ダッシュボードの Authentication → Users から本人の UUID を確認します。その後 SQL Editor で管理者権限を付与します。

```sql
insert into public.moderators (user_id)
values ('ここに認証済み運営者のUUID');
```

管理権限は本人が自分自身に与えることはできません。`moderators` テーブルはクライアントから書き込めない設計です。

### 4. Cloudflare Workers / Pages に公開

1. このフォルダーを GitHub リポジトリにアップロードする（`.env` は含めない）。
2. https://dash.cloudflare.com/ → Workers & Pages → Pages で Git リポジトリを連携する。
3. **Build command**: `npm run build` / **Build output directory**: `dist` と指定する。
4. Viteの **ビルド用環境変数** に `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CONTACT_EMAIL`, `VITE_OPERATOR_NAME` を登録する。
5. デプロイ後の `https://XXXX.workers.dev` または `https://XXXX.pages.dev` を Supabase Auth の Site URL / Redirect URLs に設定し直す。
6. メール確認 → ログイン → 投稿 → 管理者の承認 → 別ブラウザで閲覧、まで本番 URL でテストする。

`public/_headers` に基本的なセキュリティヘッダーがあります。**Workersで無限ループエラーを起こしていた `public/_redirects` は削除**し、`wrangler.jsonc` の SPA フォールバックを使用しています。独自ドメインは Cloudflare から任意で接続できます。

### 5. 公開前に強く推奨するセキュリティ・運営設定

- **CAPTCHA**: Supabase Auth の Bot and Abuse Protection から Cloudflare Turnstile を有効にする。Cloudflare の公開 Site Key を `VITE_TURNSTILE_SITE_KEY` に設定します。Turnstile Secret Key は **Supabase Auth の管理画面のみに設定**し、フロントエンドや GitHub に置かないでください。
- **SMTP**: Supabase の標準メール送信のままでは運用上の制限があります。独自のメール送信サービスと適切な送信ドメインを設定してください。
- **問い合わせ窓口**: `VITE_CONTACT_EMAIL` を本当に受信・対応できるアドレスに設定する。
- **利用規約とプライバシー**: サイト内の文章は**ひな型**です。運営者、著作権侵害申告、個人情報、未成年の利用、削除請求、保存期間、準拠法等を実態に合わせて確定させてください。
- **バックアップ**: Supabase のプランに適した DB バックアップ方法と、復元テストを準備してください。
- **運用体制**: 審査待ち・通報を日常的に確認し、規約違反や権利侵害を迅速に処理してください。大量投稿・不正登録には追加のレート制限や WAF を検討してください。
- **独自ドメイン**: メール認証リンク・リンク共有・信頼性のために推奨します。

## 公開前テスト（最低限）

- [ ] 未ログイン利用者は公開作品を閲覧でき、未承認作品・非公開作品を閲覧できない。
- [ ] 一般投稿者が他人の作品・文献・注釈を書き換えたり、作品を自分で「公開」に変更したりできない。
- [ ] 投稿者が下書き・審査待ち作品を編集できる。公開作品は原則直接編集できない。
- [ ] 新規投稿はすぐに公開一覧に出ず、管理者の承認後に表示される。
- [ ] 読者注釈は承認後にのみ他の利用者へ表示される。
- [ ] 通報が管理画面に表示され、処理後に消える。
- [ ] メール確認・ログイン・ログアウト・パスワード再設定が使える。
- [ ] スマートフォンとPCで読書・投稿・比較が利用できる。
- [ ] 連絡先・プライバシーポリシー・利用規約に未設定項目が残っていない。

## 作品と参考文献のデータ

`public.works`: 本文・筆名・主題・作者の新規性仮説・公開状態。

`public.work_references`: 参考作品・研究・関連文献、関連の説明、任意の HTTPS リンク。

`public.notes`: 読者注釈（審査あり）。`public.reports`: 通報（管理者のみ閲覧）。`public.moderators`: 運営者資格（自己昇格不可）。

`public.work_revisions`: 改訂案と承認済み各版のスナップショット。`public.publication_requests`: 作者による公開停止・削除の申請。

作品と文献は DB 内の `public.save_work` を使い**単一トランザクション**で更新されます。RLS により匿名閲覧は承認済み作品だけ、投稿・注釈は本人の権限内だけ、公開操作は管理者のみが行えます。

## 既存の試作との違いとデータ移行

以前のデモ作品はブラウザの `localStorage` にあり、**自動的には新しいサイトへ移行しません**。投稿文は古い画面から手動でコピーしてください。新しいサイトのサンプル作品は架空の作品で、Supabase が未接続のときだけ表示します。

## 初期公開版で未実装 / 別途必要なもの

- 完全なサイト内検索（現在の検索は読み込み済み作品が対象）、公開版の差分ハイライト、出版向け ePub / PDF 出力
- ユーザー設定からの自己退会・全データ削除のセルフサービス化（運営窓口での対応は別途必要）
- 外部文献データベースとの自動書誌照合、読者批評の編集履歴、複雑な権限委譲
- 認証と SQL の**実際の本番環境での結合テスト**、負荷試験、アクセシビリティ監査、法律面の最終確認

このパッケージは**デプロイ可能なソースコードとDB定義**ですが、Supabaseアカウント・本番URL・運営者情報は含まれていません。実際のインターネット公開はユーザーのアカウント側で設定する必要があります。
