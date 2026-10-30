# 余白。v5 二階層カテゴリ・作者と入力／構成

v4の機能を引き継ぎ、分野（文学／哲学／評論／科学／その他）と小分類を実装。作者名（元のpen_name）と、入力／構成（新しい任意欄）を分けて登録・閲覧・改訂できます。

**更新手順:** `UPDATE_V5_GUIDE.md` を必ずお読みください。既存のSupabaseには、`supabase/migrations/20261030_hierarchical_categories_and_credits.sql` を追加で適用してください。既存の作品・版履歴を初期化しないこと。
