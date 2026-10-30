import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hierarchyEntries, compactHierarchicalLabel } from '../src/workHierarchy.js'

const works = [
  {id:'root',title:'エチカ'},
  {id:'part',title:'第一部　神について',parent_work_id:'root'},
  {id:'a',title:'本文',parent_work_id:'part'},
  {id:'def',title:'定義',parent_work_id:'a'},
  {id:'part2',title:'第二部',parent_work_id:'root'}
]
const entries = hierarchyEntries(works.reverse())
assert.deepEqual(entries.map(e=>e.id), ['root','part','a','def','part2'])
assert.deepEqual(entries.map(compactHierarchicalLabel), [
  '▣ エチカ', '　↳ 第一部　神について', '　　↳ 本文',
  '　　　↳ 定義', '　↳ 第二部'
])
assert.equal(entries[3].path, 'エチカ › 第一部　神について › 本文 › 定義')
assert.ok(!compactHierarchicalLabel(entries[3]).includes('エチカ'))
const ui = readFileSync(new URL('../src/ParallelReader.jsx', import.meta.url), 'utf8')
assert.ok(ui.includes('ParallelWorkPicker'), '検索型の作品選択画面を備える')
assert.ok(ui.includes('title={w.path||w.title}'), '作品の完全な階層パスを確認可能')
assert.ok(ui.includes('w.title||'), '選択候補に親名を繰り返さない')
console.log('並列読書: 階層は保持し、選択肢は固有名のみ: OK')
