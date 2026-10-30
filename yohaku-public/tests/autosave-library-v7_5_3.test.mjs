import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createEmptyDraftPayload, toWorkPayload, draftCacheKey } from '../src/editorDraft.js'
import { organizeOwnerWorks } from '../src/ownerLibrary.js'
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8')
const main=read('../src/main.jsx')
const sql=read('../supabase/migrations/20261030_autosave_partial_drafts_v7_5_3.sql')
const library=read('../src/MyWorkLibrary.jsx')
test('draft is allocated when author clicks Create (not when they press Save)',()=>{
 const p=createEmptyDraftPayload()
 assert.equal(p.p_id,null);assert.equal(p.p_title,'');assert.equal(p.p_body,'');assert.equal(p.p_status,'draft')
 assert.equal(p.p_node_kind,'work')
 assert.equal(createEmptyDraftPayload('collection',{id:'parent',title:'親',section:'哲学',genre:'実践哲学'}).p_parent_work_id,'parent')
 assert.match(main,/async \(kind='work', parent=null\) => \{/)
 assert.match(main,/await supabase.rpc\('save_work_v6',createEmptyDraftPayload\(kind,parent\)\)/)
 assert.match(main,/onClick=\{\(\)=>beginCreation\('work'\)\}/)
})
test('only draft constraints are relaxed; publication still needs valid authors, names, and bodies',()=>{
 for (const constraint of ['works_title_check','works_pen_name_check','works_body_check']) assert.match(sql,new RegExp(constraint))
 assert.match(sql,/status='draft' OR char_length\(btrim\(title\)\)>=1/)
 assert.match(sql,/status='draft' OR char_length\(btrim\(pen_name\)\)>=1/)
 assert.match(sql,/status='draft' OR node_kind='collection' OR char_length\(btrim\(body\)\)>=10/)
 assert.match(sql,/char_length\(body\) <= 200000/)
 assert.doesNotMatch(sql,/work_limit_events|works_submission_limit/i)
})
test('autosave uses existing draft UUID, retains leading whitespace and is not a publish action',()=>{
 const fields={pen_name:' 筆名 ',contributor_credit:'',section:'文学',title:' 題名 ',genre:'純文学',theme:'',summary:'',body:'　字下げ\n本文',question:'',inheritance:'',novelty:'',parent_work_id:null,order_index:0,node_kind:'work'}
 const p=toWorkPayload(fields,[],{id:'draft-id',status:'draft'})
 assert.equal(p.p_id,'draft-id');assert.equal(p.p_body,'　字下げ\n本文');assert.equal(p.p_status,'draft')
 assert.match(main,/initial\?\.status!=='draft'/)
 assert.match(main,/setTimeout\(\(\)=>\{/)
 assert.match(main,/pendingSave\.current/)
 assert.doesNotMatch(main,/下書き保存<\/button>/)
 assert.match(main,/localStorage\.setItem\(cacheKey/)
 assert.notEqual(draftCacheKey('a','b',false),draftCacheKey('a','b',true))
})
test('library is collapsed by default and sorts by latest edit including descendants',()=>{
 assert.match(library,/useState\(\(\) => new Set\(\)\)/)
 assert.match(library,/const expanded = expandedIds\.has\(w\.id\)/)
 const items=[
  {id:'old',title:'古いグループ',updated_at:'2026-01-01',node_kind:'collection'},
  {id:'young',title:'古いグループの子',parent_work_id:'old',updated_at:'2026-10-29'},
  {id:'fresh',title:'最近の独立作品',updated_at:'2026-10-25'}
 ]
 const tree=organizeOwnerWorks(items)
 assert.equal(tree[0].work.id,'old')
 assert.equal(tree[0].lastActivity,new Date('2026-10-29').getTime())
 assert.equal(tree[0].latestWork.id,'young')
 assert.equal(tree[1].work.id,'fresh')
})
test('editor hides standard navigation but retains a return-to-library control',()=>{
 assert.match(main,/route==='submit'\|\|route==='revise'/)
 assert.match(main,/editor-header-controls/)
 assert.match(main,/執筆を終える/)
})
