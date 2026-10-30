import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {annotationSegments,prepareAnnotationSource,remarkAnnotationMarkers,renderAnnotatedPlainText} from '../src/annotationMarkers.js'
import {renderPublicWorkHtml} from '../worker/publicWorkHtml.js'

const read = filename => readFileSync(new URL(filename, import.meta.url),'utf8')
const escapeHtml = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const tokens = source => annotationSegments(source).filter(x=>x.type==='marker').map(x=>x.number)

test('one or several editorial references are split without changing their original text',()=>{
  const input='　この言葉*1は重要である。次の言葉*2と比較する*10。'
  assert.deepEqual(tokens(input),['1','2','10'])
  assert.notEqual(prepareAnnotationSource(input),input)
  assert.equal(annotationSegments(input).map(p=>p.type==='marker'?'*'+p.number:p.value).join(''),input)
  assert.deepEqual(tokens('再考*123456。'),['123456'])
  assert.deepEqual(tokens('7*20 は掛け算、参照*12 は注釈'),['12'])
})

test('ordinary Markdown, escaped asterisks, inline code, fenced code, math and indentation are preserved',()=>{
  const input=[
    '**太字** *斜体* これは*1',
    '文字列\\*2 は注釈ではない',
    '`code *3` と 本文*4',
    '```js',
    'let s="*5"',
    '```',
    '    インデントされたコード *6',
    '$E*7$ でも本文*8',
    '$$x*9$$',
    '次の注釈*10',
    '[リンク](https://example.org/article*11) に続く注釈*12',
    '<https://example.org/article*13> に続く注釈*14',
    '価格は$20、脚注は*15',
  ].join('\n')
  assert.deepEqual(tokens(input),['1','4','8','10','12','14','15'])
  assert.match(prepareAnnotationSource(input),/\\\*2/)
  assert.match(prepareAnnotationSource(input),/`code \*3`/)
  assert.match(prepareAnnotationSource(input),/\*\*太字\*\*/)
})

test('remark transformer produces semantic superscripts and labels',()=>{
  const body=prepareAnnotationSource('この一節*1、次の一節*2。')
  const tree={type:'root',children:[{type:'paragraph',children:[{type:'text',value:body}]}]}
  remarkAnnotationMarkers()(tree)
  const children=tree.children[0].children
  assert.deepEqual(children.map(x=>x.type),['text','text','emphasis','text','text','emphasis','text'])
  assert.equal(children[1].value,'*')
  assert.equal(children[4].value,'*')
  const supers=children.filter(x=>x.data?.hName==='sup')
  assert.deepEqual(supers.map(x=>x.children[0].value),['1','2'])
  assert.equal(supers[0].data.hProperties['aria-label'],'注釈 1')
  assert.deepEqual(supers[1].data.hProperties.className,['annotation-marker'])
})

test('initial HTML output includes escaped prose and small raised notes',()=>{
  const template='<!doctype html><html><head><title>余白。</title></head><body><div id="root"></div></body></html>'
  const work={id:'a0000000-0000-4000-8000-000000000001',title:'引用本文',status:'published',body:'　言葉*1 と <script>alert(1)</script>\n\n　別の言葉*2'}
  const result=renderPublicWorkHtml(template,work,[],{items:[],truncated:false},{items:[],limited:false},'https://example.org')
  assert.match(result,/言葉\*<sup class="annotation-marker"[^>]*>1<\/sup>/)
  assert.match(result,/別の言葉\*<sup class="annotation-marker"[^>]*>2<\/sup>/)
  assert.match(result,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(result,/<script>alert\(1\)<\/script>/)
  assert.match(renderAnnotatedPlainText('資料*10',escapeHtml),/\*<sup[^>]+>10<\/sup>/)
})

test('reader, toolbar, source CSS, initial HTML and unchanged JSON API use same convention',()=>{
  const reader=read('../src/RichBody.jsx')
  const main=read('../src/main.jsx')
  const css=read('../src/style.css')
  const htmlWorker=read('../worker/publicWorkHtml.js')
  const api=read('../worker/publicWorksApi.js')
  assert.match(reader,/prepareAnnotationSource\(preserveParagraphIndentation\(source\)\)/)
  assert.match(reader,/remarkAnnotationMarkers/)
  assert.match(main,/注釈番号 \*1/)
  assert.match(css,/\.rich-body sup\.annotation-marker/)
  assert.match(css,/line-height:0/)
  assert.match(htmlWorker,/renderAnnotatedPlainText\(text, escapeHtml\)/)
  assert.doesNotMatch(api,/prepareAnnotationSource|renderAnnotatedPlainText/)
  assert.match(read('../index.html'),/v7\.5\.(?:2|3|4)/)
})
