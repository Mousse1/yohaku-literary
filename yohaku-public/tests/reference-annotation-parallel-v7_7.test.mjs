import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {annotationSegments, prepareAnnotationSource, remarkAnnotationMarkers, renderAnnotatedPlainText} from '../src/annotationMarkers.js'
import {packReference,unpackReference,referenceForNumber,validateReferenceNumbers,packedTitleLength} from '../src/referenceAnnotations.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url),'utf8')
const markers = text => annotationSegments(text).filter(x=>x.type==='marker').map(x=>[x.stars,x.number])

test('** inserts self-numbered markers while keeping *1 and **1',()=>{
  assert.deepEqual(markers('本文**。注記**。'),[['**','1'],['**','2']])
  assert.deepEqual(markers('本文*4。続き**。手動**6。最後**。'),[['*','4'],['**','5'],['**','6'],['**','7']])
  assert.deepEqual(markers('注釈**1、注釈**2'),[['**','1'],['**','2']])
  assert.deepEqual(markers('**太字** と 本文**。'),[['**','1']])
  assert.deepEqual(markers('**強調** は違う、`コード**` は違う、本文**。'),[['**','1']])
  assert.deepEqual(markers('\\**エスケープ と $a**$ は注釈ではない'),[])
  assert.match(prepareAnnotationSource('文献**'),/\uE000D1\uE001/)
})

test('inline button is rendered only in reading mode, not static export',()=>{
  const source=prepareAnnotationSource('文献** と 旧文献*2')
  const tree={type:'root',children:[{type:'paragraph',children:[{type:'text',value:source}]}]}
  remarkAnnotationMarkers({interactive:true})(tree)
  const buttons=tree.children[0].children.filter(x=>x.data?.hName==='button')
  assert.equal(buttons.length,2)
  assert.deepEqual(buttons.map(x=>x.data.hProperties['data-annotation-number']),['1','2'])
  assert.equal(buttons[0].children[0].value,'**')
  const plain=renderAnnotatedPlainText('文献**。',x=>x)
  assert.match(plain,/\*\*<sup class="annotation-marker"[^>]*>1<\/sup>/)
})

test('citation associations are persisted without an SQL migration via visible title prefix',()=>{
  const original={title:'スピノザ『エチカ』',relation:'第1部の読解',url:'https://example.org'}
  const numbered=packReference({...original,annotationNumber:'2'})
  assert.equal(numbered.title,'【*2】 スピノザ『エチカ』')
  assert.deepEqual(unpackReference(numbered),{...original,annotationNumber:'2'})
  assert.equal(referenceForNumber([original,numbered],2)?.title,numbered.title)
  assert.equal(referenceForNumber([numbered],1),null)
  assert.equal(packedTitleLength({...original,annotationNumber:'2'}),numbered.title.length)
  assert.equal(validateReferenceNumbers([{...original,annotationNumber:'2'},{...original,annotationNumber:'02'}]),false)
  assert.equal(validateReferenceNumbers([{...original,annotationNumber:'1'},{...original,annotationNumber:'3'}]),true)
})

test('the editor inserts only ** and the direct reading page opens parallel panes',()=>{
  const main=read('../src/main.jsx')
  const parallel=read('../src/ParallelReader.jsx')
  const descendants=read('../src/DescendantBodies.jsx')
  assert.match(main,/onClick=\{insertAnnotationPlaceholder\}>注釈番号 \*\*/)
  assert.match(main,/fields\.body\.slice\(0,position\)\+'\*\*'\+fields\.body\.slice\(position\)/)
  assert.match(main,/onAnnotationClick=\{parallelAnnotation\}/)
  assert.match(parallel,/referenceForNumber\(work\.work_references,pane\.referenceNumber\)/)
  assert.match(parallel,/onAnnotationClick=\{openReferenceNextTo\}/)
  assert.match(parallel,/<iframe title=/)
  assert.match(descendants,/onAnnotationClick=\{onAnnotationClick \? number => onAnnotationClick\(entry\.id,number\) : undefined\}/)
})
