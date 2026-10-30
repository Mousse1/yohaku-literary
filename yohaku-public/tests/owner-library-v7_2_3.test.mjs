import test from 'node:test'
import assert from 'node:assert/strict'
import { organizeOwnerWorks } from '../src/ownerLibrary.js'

const item = (id, title, parent_work_id=null, node_kind='work') => ({id,title,parent_work_id,node_kind,order_index:0,created_at:id})
test('owner library displays parents before child and grandchild',()=>{
  const result=organizeOwnerWorks([
    item('3','定義','2'),item('2','第一部','1','collection'),item('4','第二部','1','collection'),item('1','エチカ',null,'collection'),
  ])
  assert.equal(result.length,1)
  assert.equal(result[0].work.title,'エチカ')
  assert.equal(result[0].descendantCount,3)
  assert.deepEqual(new Set(result[0].children.map(x=>x.work.title)),new Set(['第一部','第二部']))
  assert.equal(result[0].children.find(x=>x.work.title==='第一部').children[0].path,'エチカ › 第一部 › 定義')
})
test('missing parent becomes visible root',()=>{
  const result=organizeOwnerWorks([item('a','孤立した作品','missing')])
  assert.equal(result.length,1)
  assert.equal(result[0].missingParent,true)
})
test('cyclic relationships do not hide works',()=>{
  const result=organizeOwnerWorks([item('a','A','b'),item('b','B','a')])
  assert.equal(result.reduce((s,root)=>s+root.descendantCount+1,0),2)
})
test('an empty list stays empty',()=>assert.deepEqual(organizeOwnerWorks([]),[]))
