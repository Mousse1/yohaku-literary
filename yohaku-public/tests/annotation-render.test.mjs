import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('numbered bibliography panel renders all supported data states', async () => {
  const server=await createServer({server:{middlewareMode:true},appType:'custom'})
  try {
    const {AnnotationReferenceFocus}=await server.ssrLoadModule('/src/ParallelReader.jsx')
    const render=references=>renderToStaticMarkup(React.createElement(AnnotationReferenceFocus,{references,referenceNumber:1,showSource:true,onToggleSource(){}}))
    for(const refs of [undefined,null,{},[],[null]]) {
      assert.match(render(refs),/対応する文献はまだ登録されていません/)
    }
    assert.match(render([{title:'【*1】 URLなしの書籍',url:null}]),/URLなしの書籍/)
    const linked=render([{title:'【*1】 出典',url:'https://example.com/source'}])
    assert.match(linked,/<iframe/)
    assert.match(linked,/https:\/\/example.com\/source/)
    const unsafe=render([{title:'【*1】 出典',url:'javascript:alert(1)'}])
    assert.doesNotMatch(unsafe,/<iframe|javascript:/)
  } finally { await server.close() }
})
