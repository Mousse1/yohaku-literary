import assert from 'node:assert/strict'
import fs from 'node:fs'
import { hierarchyEntries, descendantsOf } from '../src/workHierarchy.js'
const read = f => fs.readFileSync(new URL(f,import.meta.url),'utf8')
const main=read('../src/main.jsx')
const descendants=read('../src/DescendantBodies.jsx')
const fallback=read('../src/ReaderErrorBoundary.jsx')
assert.match(main,/treeNodes=\{treeIndex\} onBack=/)
assert.match(main,/ReaderPartBoundary key=\{`desc-\$\{work.id\}`\}/)
assert.match(fallback,/DescendantBodies rootWorkId=\{work.id\}/)
assert.match(descendants,/\.in\('parent_work_id', pageParents\)/)
assert.match(descendants,/\.in\('status', PUBLIC_STATUSES\)/)
assert.match(descendants,/\.in\('id',ids\)/)
assert.match(descendants,/MAX_LEVELS = 12/)
const data=[
 {id:'ethica',title:'エチカ',status:'published',node_kind:'collection',parent_work_id:null},
 {id:'part1',title:'第一部',status:'published',node_kind:'collection',parent_work_id:'ethica'},
 {id:'text',title:'本文',status:'published',node_kind:'work',order_index:1,parent_work_id:'part1'},
 {id:'definition',title:'定義',status:'open',node_kind:'work',order_index:2,parent_work_id:'part1'},
 {id:'private',title:'未公開の原稿',status:'pending',node_kind:'work',parent_work_id:'part1'}
]
const displayed=descendantsOf(hierarchyEntries(data.filter(x=>['published','open'].includes(x.status))),'ethica')
assert.deepEqual(displayed.map(x=>x.id),['part1','text','definition'])
assert.deepEqual(displayed.map(x=>x.path),['エチカ › 第一部','エチカ › 第一部 › 本文','エチカ › 第一部 › 定義'])
console.log('個別作品のフォールバック、階層の再取得、公開状態の確認: OK')
