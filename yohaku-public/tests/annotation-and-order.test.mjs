import test from 'node:test'
import assert from 'node:assert/strict'
import { referenceForNumber, unpackReference } from '../src/referenceAnnotations.js'
import { organizeOwnerWorks } from '../src/ownerLibrary.js'
import { hierarchyEntries } from '../src/workHierarchy.js'

test('annotation lookup accepts missing or malformed bibliography data', () => {
  for (const refs of [undefined,null,{},[],[null,undefined]]) {
    assert.equal(referenceForNumber(refs,1),null)
  }
  assert.equal(unpackReference(null).title,'')
})
test('annotation lookup finds the requested numbered reference', () => {
  const ref={title:'【*2】 文献',url:null}
  assert.equal(referenceForNumber([null,{title:'番号なし'},ref],2),ref)
  assert.equal(referenceForNumber([ref],1),null)
  assert.equal(unpackReference(ref).title,'文献')
})
test('default owner order matches public nested reading order', () => {
  const works=[
    {id:'root',title:'親',node_kind:'collection'},
    {id:'b',parent_work_id:'root',title:'B',order_index:2,created_at:'2020-01-01',updated_at:'2030-01-01'},
    {id:'a',parent_work_id:'root',title:'A',order_index:1,created_at:'2021-01-01'},
    {id:'d',parent_work_id:'a',title:'先の章',order_index:2},
    {id:'c',parent_work_id:'a',title:'後の章',order_index:1},
    {id:'f',parent_work_id:'root',title:'あ',order_index:2,created_at:'2020-01-01'},
  ]
  const owner=organizeOwnerWorks(works)
  const flatten=nodes=>nodes.flatMap(n=>[n.work.id,...flatten(n.children)])
  assert.deepEqual(flatten(owner),['root','a','c','d','b','f'])
  assert.deepEqual(flatten(owner),hierarchyEntries(works).map(w=>w.id))
  assert.equal(organizeOwnerWorks(works,{childSort:'updated_desc'})[0].children[0].work.id,'b')
})
