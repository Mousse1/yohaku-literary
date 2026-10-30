import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const sql = read('../supabase/migrations/20261030_double_daily_post_limit.sql')
const schema = read('../supabase/schema.sql')
const main = read('../src/main.jsx')
const owner = read('../src/MyWorkLibrary.jsx')
assert.ok(sql.includes('recent_count >= 16'), 'SQL migration doubles the 24h cap to 16')
assert.ok(schema.includes('recent_count >= 16'), 'new installations use the same limit')
assert.ok(sql.includes("interval '24 hours'"), 'rolling window is unchanged')
assert.ok(main.includes('<MyWorkLibrary'), 'owner library renders a tree instead of cards')
for (const action of ['onCreateChild','onEdit','onDelete','onRevise','onCancelRequest']) {
  assert.ok(owner.includes(action), `${action} stays available`)
}
console.log('投稿上限と自分の作品ツリー表示: OK')
