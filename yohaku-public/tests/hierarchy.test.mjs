import assert from 'node:assert/strict'
import { hierarchyEntries, descendantsOf, hierarchicalLabel } from '../src/workHierarchy.js'

const works = [
  { id: 'root', title: '最上位', order_index: 0 },
  { id: 'a', title: '2番目_1', parent_work_id: 'root', order_index: 1 },
  { id: 'a1', title: '3_1', parent_work_id: 'a', order_index: 1 },
  { id: 'a2', title: '3_2', parent_work_id: 'a', order_index: 2 },
  { id: 'b', title: '2番目_2', parent_work_id: 'root', order_index: 2 },
  { id: 'b1', title: '3_1', parent_work_id: 'b', order_index: 1 }
]
const entries = hierarchyEntries(works.slice().reverse())
assert.deepEqual(entries.map(w=>w.id), ['root','a','a1','a2','b','b1'])
assert.deepEqual(descendantsOf(entries, 'root').map(w=>w.id), ['a','a1','a2','b','b1'])
assert.equal(entries[2].path, '最上位 › 2番目_1 › 3_1')
assert.ok(hierarchicalLabel(entries[2]).includes('最上位 › 2番目_1 › 3_1'))
assert.deepEqual(descendantsOf(entries, 'a').map(w=>w.id), ['a1','a2'])
assert.deepEqual(descendantsOf(entries, 'a1'), [])
const cyclic = hierarchyEntries([{id:'x',parent_work_id:'y',title:'x'},{id:'y',parent_work_id:'x',title:'y'}])
assert.equal(cyclic.length,2)
console.log('階層順序・親子本文・パス表示: OK')
