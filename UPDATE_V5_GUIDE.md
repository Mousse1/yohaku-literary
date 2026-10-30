# 余白。v5 — 二階層分類・作者／入力・構成クレジット

この更新は既存の v4 を拡張するもので、**投稿済み作品、参考文献、作品URL、公開審査、改訂履歴、数式、読書・執筆時の文字サイズ**を維持します。

## 増えた機能

サイト内「作品を探す」に大分類のタブを設置。タブを押すと小分類が選べます。

| 大分類 | 小分類 |
|---|---|
| 文学 | 純文学、実験文学、詩・散文 |
| 哲学 | 理論哲学、実践哲学 |
| 評論 | 文芸、映画、アニメ、ゲーム |
| 科学 | 数学、物理学、脳科学、心理学、精神医学 |
| その他 | 単独分類 |

投稿・改訂画面も「分野」「小分類」の2段階選択に変更しました。以前の「哲学小説」「文芸評論」「ノベルゲーム」「科学」といった分類は**既存データを変更せず保持**し、それぞれ該当する大分類の「すべて」に含まれます。旧「文芸評論」は新「文芸」でも、旧「ノベルゲーム」は新「ゲーム」でも検索できます。昔の「科学」は細分類不明のため、科学の「すべて」に残ります。

「作者（原著者）」は従来の `works.pen_name` を継承し、別に `works.contributor_credit` （最大120文字、任意）を保存します。例えば：

- タイトル：『エチカ』定義と公理の整理
- 作者（原著者）：バールーフ・スピノザ
- 入力／構成：まとめた人の筆名
- 分野：哲学 → 小分類：理論哲学

**注意：** `works.author_id` は投稿・編集・審査の権限判断に使う**サイトの投稿者ID**です。「作者（原著者）」と混同せず、更新しません。「作者」の表示は著作権の帰属や転載許諾を証明しません。引用・要約・原文転載のルールは別途確認してください。

## v4から更新する順序（重要）

1. **Supabaseデータベースをバックアップ**する。現在のサイトも更新前のコードを保存する。
2. SupabaseのSQL Editorで、**`supabase/migrations/20261030_hierarchical_categories_and_credits.sql` の全文だけ**を実行。最後の `notify pgrst, 'reload schema';` まで含める。以前のv4マイグレーションが未適用なら先に実行。
3. SQL Editorで下記の確認クエリを実行し、`section` と `contributor_credit` の列が追加されていることを確かめる。
4. 配布ZIP中の `yohaku-public` フォルダの内容をGitHubの既存コードと統合。特に `src/`・`supabase/migrations/` を更新する。**SupabaseのデータはGitHubのファイルではありません。**
5. Cloudflare Workers のビルド設定では `package.json` のある場所を Root directory にし、Build command=`npm run build`、deploy は既存の `npx wrangler deploy` のまま。`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` の値は変更不要。
6. GitHubにcommitし、ビルド・デプロイ結果と、実ブラウザで投稿・改訂・閲覧を確認する。

### 移行後のデータ確認（読み取りのみ）

```sql
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='works'
  and column_name in ('section','genre','pen_name','contributor_credit')
order by column_name;
```

### 投稿・改訂動作のチェック

- 「文学」「哲学」「評論」「科学」「その他」を押すと、指定された小分類を表示する。
- 科学 → 物理学で新しい記事を下書き保存し、審査に提出できる。
- 作者「スピノザ」、入力／構成「まとめた人の筆名」で新しい記事を保存する。
- 管理者承認後、一覧・個別URLで作者と入力／構成が別々に出る。
- 公開済み記事の「改訂版を書く」で入力／構成の変更を提出し、**承認前は旧版の表示のまま**、承認後のみ変更が反映される。
- 版履歴に、承認時点の作者と入力／構成が記録される。
- 以前の作品のIDと共有URLが変わらない。
- 未ログインでも公開作品が読め、未承認原稿は読めない。

## 新規Supabaseプロジェクトでの導入順

`supabase/schema.sql` → `supabase/migrations/20261028_revisions_and_requests.sql` → `supabase/migrations/20261030_add_fields.sql` → `supabase/migrations/20261030_hierarchical_categories_and_credits.sql`。

途中まで実行した古いDBに対して、新規インストール用SQLを最初から再実行しないでください。

## 技術メモ

- `works.section`：大分類。v4との同時運用を想定してNULLを許す（新しい `save_work_v5` RPC は必須とする）。
- `works.genre`：小分類（旧名との互換性のため列名は維持）。
- `works.contributor_credit`：入力／構成。`pen_name` は作者（原著者）表示に利用。
- `private.work_snapshot`：新たな履歴に2つの列を記録。
- `private.validate_revision_payload`：改訂案の新しい分類とクレジットを検査。
- `public.review_revision`：承認時にクレジットと分類も本文とともに切り替える。
- `public.save_work_v5`：既存の `save_work` を削除せず新RPCとして追加。既存のRLSを維持。

**検証状況：** ソースの構文／ファイル整合性は検査していますが、Supabase本番環境へのマイグレーション実行とクラウドへのビルド・公開は行っていません。公開前に必ずテストしてください。
