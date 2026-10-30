import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const main = read('../src/main.jsx')
const html = read('../index.html')
const migration = read('../supabase/migrations/20261030_open_submissions_v7.sql')

const formPosition = main.indexOf('02 / 思想・技法・知識の位置づけ')
assert.ok(formPosition >= 0, '思想・技法・知識の位置づけ欄が存在する')
assert.ok(!main.includes("fields.node_kind!=='collection'&&<div className=\"editor-section\"><div className=\"section-small\">02 / 思想"), 'グループでも02を表示する')
for (const field of ['question', 'inheritance', 'novelty']) {
  assert.ok(main.slice(formPosition, formPosition+1200).includes(`fields.${field}`), `${field}は共通フォームで編集できる`)
  assert.ok(main.includes(`p_${field}:fields.${field}.trim()`), `${field}が作品保存RPCに渡される`)
  assert.ok(main.includes(`${field}:payload.p_${field}`), `${field}が改訂案に渡される`)
  assert.ok(migration.includes(`p_${field} text`), `${field}は既存DBスキーマの保存対象`)
}
assert.ok(main.includes("work.node_kind==='collection'?'このグループで試みること'"), 'グループの位置づけが一覧に表示される')
assert.ok(main.includes('historyPreview.snapshot.question'), '改訂履歴にグループの問いが残る')
assert.match(html, /content="v7\.(?:2(?:\.[12345])?|3(?:\.[123])?)"/, 'v7.2系のバージョンを維持')
console.log('v7.2: グループ編集、保存、表示、改訂履歴の静的検証 OK')
