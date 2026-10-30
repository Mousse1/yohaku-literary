# 余白。v4 — 分野追加・数式・文字サイズ対応

既存v3の個別URL・投稿審査・公開版の改訂履歴・停止/削除申請を維持し、記事の分類と書式を拡張した更新版です。

## 変更点

- 投稿・検索で「文芸評論」「映画」「ノベルゲーム」「科学」を選べる（既存カテゴリは維持）。
- 本文にMarkdown（見出し、太字、リスト、表、引用、リンク）を使える。
- LaTeX系の数式記法を `remark-math` と KaTeX で表示。行内は `$E=mc^2$` 、独立行は次のように記述。

  ```text
  $$
  S=\int_{t_1}^{t_2} L\,dt
  $$
  ```

- 執筆画面に「見出し」「太字」「数式」の挿入ボタンと、プレビューの表示切替。
- 執筆画面の文字サイズを 13–24px、読者の本文表示文字サイズを 12–26px の範囲で調整。設定は**使用中のブラウザ内**に保存される（公開作品の本文データは書き換えない）。
- Markdownの見出しにより、著者も段落単位で表示の大きさを使い分けられる。
- 過去の改訂履歴の本文にも新しい表示形式を適用。

※数式はサーバー上で計算・検証されるものではありません。KaTeXがサポートするLaTeX数式記法を**表示する機能**です。
※過去の作品本文がMarkdownの特殊記号（`#`, `*`, `$`など）を含む場合、以前と表示が変わることがあります。公開前にサンプル作品と既存作品を確認してください。

## 既存「余白。」v3からの更新（重要）

1. **Supabaseのバックアップを取る**。既存データを保護するため。
2. Supabase Dashboard → SQL Editor → New query で、**`supabase/migrations/20261030_add_fields.sql` だけ**を実行する。既存の作品は削除しない。成功したらジャンル制限が広がる。
3. ZIPを解凍し、GitHubの既存サイトのソースを今回の `yohaku-public` 中のファイルで更新する（`.env`、Supabaseのキー、ユーザーデータの上書き不要）。特に `src/`, `package.json`, `supabase/` と `index.html` を反映する。
4. GitHubの `package.json` がある場所と、Cloudflare Workers → Settings → Build の **Root directory** を一致させる。例：リポジトリ直下に `yohaku-public/package.json` がある場合は `yohaku-public`。
5. **Build command = `npm run build`**、**Build output directory = `dist`**、Deploy commandは既存Workers設定に従って `npx wrangler deploy`。既存の `wrangler.jsonc` を利用する。ビルド時の環境変数 `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` はそのまま再利用する。
6. GitHubの変更をcommitしてCloudflareの自動ビルド/デプロイを待つ。追加のnpm依存がインストールされるため、ビルド時にネットワークが必要。
7. 未ログインで公開作品を開く、カテゴリで絞る、新規記事投稿、本文数式、改訂版提出→管理者承認、読者の文字サイズ切り替えを確認する。

**もしv2の改訂機能用SQLがまだ正常に適用されていない場合:** v4追加SQLより先に `supabase/migrations/20261028_revisions_and_requests.sql` を適用する。ただし、すでに正常適用済みなら再実行しない。今回のv4同梱版は以前の構文問題を回避した修正版です。

**新規インストールの場合:** 新しいSupabaseプロジェクトで `supabase/schema.sql` → `supabase/migrations/20261028_revisions_and_requests.sql` → `supabase/migrations/20261030_add_fields.sql` の順に実行。あとは通常の認証・運営者設定を行う。

## 事前確認用SQL（変更なし）

```sql
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.works'::regclass and contype = 'c';

select to_regclass('public.work_revisions') as revisions_table;
```

`work_revisions` が null ならv2の移行が未完了です。

## 作品の数式と書式の例

```text
## フェルマーの原理

光学的経路長が停留することを考える。

$$
\delta \int_A^B n\,ds=0
$$

ここで $n$ は屈折率である。

**注意**：説明上の簡略化と、厳密な仮定を区別する。
```

## 公開前に留意すること

- 数式やMarkdownは表示形式です。本文の保存方式（`works.body` テキスト）と投稿者権限は従来通りです。
- HTMLタグを作品本文から直接実行しません。外部からのマークアップの無制限な実行は認めません。
- 引用・著作権・研究出典の記載について運営方針は別途必要です。
- 数式の全コマンドを保証するものではありません。未サポートのLaTeX命令は表示エラーになる場合があります。
- 今回の環境ではnpmパッケージの取得ができず、**本番ビルドとSupabase接続テストは未完了**です。Cloudflareのビルドログと本番の操作テストを必ず確認してください。
