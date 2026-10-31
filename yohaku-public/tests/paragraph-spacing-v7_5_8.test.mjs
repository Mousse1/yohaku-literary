import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { remarkParagraphSpacing } from '../src/paragraphSpacing.js'
import { organizeOwnerWorks, childSortOptions } from '../src/ownerLibrary.js'

const sourceOf = path => readFileSync(new URL(path, import.meta.url),'utf8')
const rich = sourceOf('../src/RichBody.jsx')
const css = sourceOf('../src/style.css')
const worker = sourceOf('../worker/publicWorkHtml.js')
function paragraph(start, end) {
  return {type:'paragraph',children:[{type:'text',value:'x'}],position:{start:{offset:start},end:{offset:end}}}
}
function model(source) {
  const a=source.indexOf('あ')
  const b=source.indexOf('い')
  const children=[paragraph(a,a+1),paragraph(b,b+1)]
  const tree={type:'root',children}
  remarkParagraphSpacing()(tree,{value:source})
  return children[0].data?.hProperties?.className || []
}

test('one newline has no paragraph gap; two newlines give a visible paragraph gap',()=>{
  assert.deepEqual(model('あ\nい'),[])
  assert.deepEqual(model('あ\n\nい'),['body-paragraph-gap-2'])
  assert.match(rich,/remarkBreaks/)
  assert.match(rich,/remarkParagraphSpacing/)
  assert.match(css,/\.rich-body p\{margin:0 0 \.35em/)
})
test('three and four newlines increase the gap, including Windows-style line endings',()=>{
  assert.deepEqual(model('あ\n\n\nい'),['body-paragraph-gap-3'])
  assert.deepEqual(model('あ\r\n\r\n\r\n\r\nい'),['body-paragraph-gap-4'])
  assert.deepEqual(model(`あ${'\n'.repeat(16)}い`),['body-paragraph-gap-8'])
  const spacing=[2,3,4,5,6,7,8].map(n=>Number(new RegExp(`\\.rich-body p\\.body-paragraph-gap-${n}\\{margin-bottom:([\\d.]+)em!important\\}`).exec(css)?.[1]))
  assert.ok(spacing.every(Number.isFinite))
  assert.ok(spacing.every((value,index)=>index===0||value>spacing[index-1]))
})
test('preserves nested paragraph gaps and never tags non-paragraph blocks',()=>{
  const source='> あ\n>\n> い' // offset test constructed from a plain source for mdast nodes
  const tree={type:'root',children:[
    {type:'blockquote',children:[paragraph(2,3),paragraph(8,9)]},
    {type:'code',position:{start:{offset:10},end:{offset:10}}}
  ]}
  remarkParagraphSpacing()(tree,{value:source})
  assert.equal(tree.children[0].children[0].data,undefined) // between nodes has Markdown quote markers
  assert.equal(tree.children[1].data,undefined)
})
test('existing JSON/text source is untouched, public initial HTML respects explicit blank lines',()=>{
  assert.match(worker,/white-space:pre-wrap/)
  assert.match(worker,/renderAnnotatedPlainText\(text, escapeHtml\)/)
  assert.doesNotMatch(sourceOf('../src/paragraphSpacing.js'),/replace\(/)
})
test('the initial child-library choice is recent edits; manual sorting stays available',()=>{
  assert.equal(childSortOptions[0].value,'updated_desc')
  const rows=[
    {id:'g',node_kind:'collection',created_at:'2026-10-01',updated_at:'2026-10-01'},
    {id:'older',parent_work_id:'g',created_at:'2026-10-02',updated_at:'2026-10-21'},
    {id:'newer',parent_work_id:'g',created_at:'2026-10-03',updated_at:'2026-10-10'},
  ]
  const recent=organizeOwnerWorks(rows)
  assert.deepEqual(recent[0].children.map(x=>x.work.id),['older','newer'])
  assert.deepEqual(organizeOwnerWorks(rows,{childSort:'created_asc'})[0].children.map(x=>x.work.id),['older','newer'])
  assert.ok(childSortOptions.some(x=>x.value==='manual'))
})
