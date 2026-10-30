# 余白。v6.1 — 「本文」と独立した入れ子グループ

## できること

『エチカ』(グループ) → 「第一部 神について」(下位グループ) → 「定義／公理」(作品・本文) という構成を、**本文に文章を埋め込むのではなく、別々のレコード**として扱います。

- 「グループ」は本文なし・紹介文なしで作成可能（タイトル、原著者、分野などの基本情報は必要）。
- グループの中にさらにグループ、作品・本文のどちらも作れます。最大12階層。
- 通常の**作品本文10〜200,000文字、紹介文10〜1,000文字**という制限は従来のままです。
- グループの本文入力欄は表示しません。説明だけ任意で0〜1,000文字入力できます。
- 一つひとつに作品ID、固有URL、審査状況、改訂履歴を持ちます。公開画面には公開済みの項目だけ表示。
- 従来のv5・v6で作成した作品、グループ、URLはそのまま利用できます。
- v6で公開中の作品の「収録先」変更が改訂案に含まれない不具合も修正しました。新版の承認までは旧位置が維持されます。

## どちらのSQLを実行する？

**実行前に本番Supabaseデータベースをバックアップしてください。** SQLは本番DBへの接続テストをしていません。

| 現在のDB状態 | SQL Editorで実行するファイル |
| --- | --- |
| v5まで適用済みで、v6未適用 | `supabase/migrations/20261030_nested_works.sql` **だけ** |
| v6の階層用SQLを正常に適用済み | `supabase/migrations/20261030_groups_v6_1_from_v6.sql` **だけ** |

※ v2・v4・v5 SQLが未適用の場合は先にそれらを適用。**2つのSQLを両方実行しない**でください。`schema.sql` を本番に再実行しないでください。

SQLの適用後、以下のSQLで必要な列があるか確認できます（読み取りのみ）。

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='works'
  and column_name in ('node_kind','parent_work_id','order_index')
order by column_name;
```

3列返れば階層データ構造が存在します。概要説明の任意化が反映されたかは、`pg_get_constraintdef` で確認できます。

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid='public.works'::regclass and conname='works_summary_check';
```

## GitHubとCloudflare Workers

1. ZIPを解凍して中の `yohaku-public/` を開きます。
2. **このフォルダ内の** `package.json`, `index.html`, `src/`, `supabase/`, `wrangler.jsonc` などを、GitHub上でアプリがあるフォルダに上書き・コミットします。ZIPの上位フォルダだけを余分に入れ子にしないでください。
3. Cloudflare Workersの Settings → Build で **Root directory** を `package.json` と `index.html` があるGitHub上のパスに設定します。たとえば `yohaku-public/` 内なら `yohaku-public`。`index.html` は `package.json` と同じ階層です。
4. Build command は `npm run build`、Deploy command は既存の `npx wrangler deploy`、出力先は `dist` を維持します。
5. ビルド用 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` は**再発行不要**です。
6. デプロイ後に「自分の作品」から次のテストを行ってください。

## テスト例

1. **最上位グループを作成** → 『エチカ』（グループ、作者スピノザ、入力／構成はご自身の筆名）。グループの説明と本文は空欄。
2. 審査待ちから管理者が承認。
3. 『エチカ』の **「下位グループを作成」** →「第一部 神について」。本文不要、承認。
4. 「第一部 神について」の **「この中に本文を追加」** →「定義／公理」。こちらは通常の作品と同じ10〜200,000文字制限で、承認が必要。
5. 他の閲覧者のシークレットウィンドウで『エチカ』→第一部→定義／公理と辿れ、各項目のURLが共有できるか確認。
6. 公開済み作品の収録先変更は「改訂版を書く」→提出→管理者承認で反映されることを確認。

**注意**：グループも管理上は別の項目として承認されます。親グループを承認する前に子を公開することはできません。他人のグループには収録できません。グループに既存の本文がある場合、本文はそのまま保存し、公開時には引き続き表示されますが、グループ用の簡易入力画面からは編集できません。

## 検証状況

React/JSXの構文解析は通過。npm依存パッケージのインストールがこの環境ではタイムアウトしたため、Viteの本番ビルドおよびSupabaseでのSQL実行テストは未完了です。利用中の本番環境で権限・投稿・審査を検証してから一般投稿を開放してください。
