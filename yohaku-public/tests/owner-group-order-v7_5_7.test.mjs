import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {organizeOwnerWorks,sortGroupChildren,moveSiblingIds,childSortOptions} from '../src/ownerLibrary.js'
import {createEmptyDraftPayload} from '../src/editorDraft.js'

const child=(id,created,updated,order_index=0,parent_work_id='root')=>({id,title:id,created_at:created,updated_at:updated,order_index,parent_work_id})
const parent=(id,created,updated)=>({id,title:id,node_kind:'collection',created_at:created,updated_at:updated})
const iso=n=>`2026-10-${String(n).padStart(2,'0')}T00:00:00Z`
const idList=nodes=>nodes.map(node=>node.work.id)

test('child list defaults to the most recently edited, regardless of initial creation order',()=>{
  const works=[parent('root',iso(1),iso(1)),child('first',iso(2),iso(29)),child('second',iso(3),iso(8)),child('third',iso(4),iso(15))]
  const tree=organizeOwnerWorks(works)
  assert.deepEqual(idList(tree[0].children),['first','third','second'])
})
test('roots stay latest-edited first including the latest child activity',()=>{
  const works=[parent('a',iso(1),iso(1)),child('a1',iso(2),iso(30),0,'a'),parent('b',iso(3),iso(22))]
  assert.deepEqual(idList(organizeOwnerWorks(works)),['a','b'])
})
test('users may choose reverse creation date, recent edits, title, or a saved manual order',()=>{
  const works=[parent('root',iso(1),iso(1)),child('A',iso(2),iso(25),2),child('B',iso(3),iso(15),0),child('C',iso(4),iso(29),1)]
  assert.deepEqual(idList(organizeOwnerWorks(works,{childSort:'created_desc'})[0].children),['C','B','A'])
  assert.deepEqual(idList(organizeOwnerWorks(works,{childSort:'updated_desc'})[0].children),['C','A','B'])
  assert.deepEqual(idList(organizeOwnerWorks(works,{childSort:'title'})[0].children),['A','B','C'])
  assert.deepEqual(idList(organizeOwnerWorks(works,{childSort:'manual'})[0].children),['B','C','A'])
  assert.equal(childSortOptions[0].value,'updated_desc')
  assert.deepEqual(idList(organizeOwnerWorks(works,{childSort:'created_asc'})[0].children),['A','B','C'])
})
test('manual order operates only within siblings, returning null for first/last boundary',()=>{
  const works=[parent('root',iso(1),iso(1)),child('a',iso(2),iso(2)),child('b',iso(3),iso(3)),child('c',iso(4),iso(4))]
  const nodes=organizeOwnerWorks(works,{childSort:'created_asc'})[0].children
  assert.deepEqual(moveSiblingIds(nodes,1,-1),['b','a','c'])
  assert.deepEqual(moveSiblingIds(nodes,1,1),['a','c','b'])
  assert.equal(moveSiblingIds(nodes,0,-1),null)
  assert.equal(moveSiblingIds(nodes,2,1),null)
})
test('nested group grandchildren also default to most recently edited first',()=>{
  const works=[parent('root',iso(1),iso(1)),child('part',iso(2),iso(2)),child('1',iso(5),iso(29),0,'part'),child('2',iso(7),iso(10),0,'part')]
  assert.deepEqual(idList(organizeOwnerWorks(works)[0].children[0].children),['1','2'])
  assert.deepEqual(idList(organizeOwnerWorks(works,{childSort:'created_asc'})[0].children[0].children),['1','2'])
})
test('UI exposes group-only sorting and persistent per-sibling move action',()=>{
  const library=readFileSync(new URL('../src/MyWorkLibrary.jsx',import.meta.url),'utf8')
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
  assert.match(library,/childSort==='manual'/)
  assert.match(library,/onReorderChildren\(siblings\[index\]\.work\.parent_work_id,ids\)/)
  assert.match(library,/グループ内の並び順/)
  assert.match(library,/v7_5_8/) // migrate old implicit creation-order preference
  assert.match(library,/return 'updated_desc'/)
  assert.match(library,/recent保存|最近保存・編集した作品/)
  assert.match(main,/rpc\('reorder_my_group_children'/)
})
test('RPC validates the author and complete sibling set, and only updates order_index',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261031_reorder_owner_group_children_v7_5_7.sql',import.meta.url),'utf8')
  assert.match(sql,/SECURITY DEFINER/)
  assert.match(sql,/v_parent_owner <> v_actor/)
  assert.match(sql,/v_distinct_count <> v_count/)
  assert.match(sql,/w\.parent_work_id IS DISTINCT FROM p_parent_id/)
  assert.match(sql,/SET order_index=/)
  assert.match(sql,/GRANT EXECUTE.*TO authenticated/)
  assert.match(sql,/REVOKE ALL.*PUBLIC, anon/)
  assert.doesNotMatch(sql,/SET status\s*=/i)
})

test('newly created child is appended to manual order instead of jumping to the top',()=>{
  assert.equal(createEmptyDraftPayload('work',{id:'root',next_order_index:9}).p_order_index,9)
})
