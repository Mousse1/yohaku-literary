import test,{afterEach} from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'
import {renderExportHtml, renderExportText, loadExportDocument} from '../worker/workExports.js'
import {readFileSync} from 'node:fs'

const root='e39132fd-9851-4d4e-a6e7-4e07da6e46b5'
const child='13da0000-0000-4000-8000-000000000001'
const leaf='13da0000-0000-4000-8000-000000000002'
const privateId='13da0000-0000-4000-8000-000000000003'
const rows=[
  {id:root,title:'エチカ',pen_name:'スピノザ',body:'',summary:'概要',node_kind:'collection',status:'published',parent_work_id:null,order_index:0,created_at:'2026-10-29'},
  {id:child,title:'第一部 神について',pen_name:'スピノザ',body:'',node_kind:'collection',status:'published',parent_work_id:root,order_index:0,created_at:'2026-10-30'},
  {id:leaf,title:'本文',pen_name:'スピノザ',body:'　これは本文です。*1\n\n　<script>alert(1)</script> & 内容',node_kind:'work',status:'open',parent_work_id:child,order_index:0,created_at:'2026-10-31'},
  {id:privateId,title:'秘密の草稿',pen_name:'作者',body:'PRIVATE_CONTENT',node_kind:'work',status:'draft',parent_work_id:root,order_index:1,created_at:'2026-10-31'},
]
const refs=[{work_id:root,title:'紙のパンフレット',relation:'参考文献',url:null},{work_id:leaf,title:'説明資料',relation:'リンク',url:'https://example.net/reference'}]
const env={PUBLIC_SUPABASE_URL:'https://example.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',ASSETS:{fetch:async()=>new Response('SPA SHELL')}}
let calls=[]
const before=globalThis.fetch
function installMock() {
  calls=[]
  globalThis.fetch=async(input,opts={})=>{
    const url=new URL(input)
    calls.push({url,opts})
    assert.equal(url.host,'example.supabase.co')
    assert.equal(opts.headers.apikey,'sb_publishable_test')
    assert.equal(opts.headers.authorization,undefined)
    assert.equal(opts.headers.cookie,undefined)
    if(url.pathname.endsWith('/works')) {
      let found=rows.filter(r=>['published','open'].includes(r.status))
      const id=url.searchParams.get('id')||''
      if(id.startsWith('eq.'))found=found.filter(w=>w.id===id.slice(3))
      if(id.startsWith('in.'))found=found.filter(w=>id.slice(4,-1).split(',').includes(w.id))
      const parent=url.searchParams.get('parent_work_id')||''
      if(parent.startsWith('in.'))found=found.filter(w=>parent.slice(4,-1).split(',').includes(w.parent_work_id))
      const fields=(url.searchParams.get('select')||'').split(',')
      return Response.json(found.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||200)).map(w=>Object.fromEntries(fields.map(f=>[f,w[f]??null]))))
    }
    if(url.pathname.endsWith('/work_references')) {
      const work=url.searchParams.get('work_id')||''
      let filtered=work.startsWith('eq.')?refs.filter(r=>r.work_id===work.slice(3)):work.startsWith('in.')?refs.filter(r=>work.slice(4,-1).split(',').includes(r.work_id)):refs
      const fields=(url.searchParams.get('select')||'').split(',')
      return Response.json(filtered.map(r=>Object.fromEntries(fields.map(f=>[f,r[f]??null]))))
    }
    return Response.json([])
  }
}
afterEach(()=>{globalThis.fetch=before})
const call=(path,method='GET')=>worker.fetch(new Request(`https://yohaku.example${path}`,{method}),env)

test('匿名で作品＋孫作品を.txtに書き出し、非公開作品は除外する',async()=>{
  installMock()
  const result=await call(`/export/works/${root}.txt`)
  assert.equal(result.status,200)
  assert.match(result.headers.get('content-type'),/text\/plain/)
  assert.match(result.headers.get('content-disposition'),/attachment/)
  assert.match(result.headers.get('content-disposition'),/UTF-8''/)
  const text=await result.text()
  assert.match(text,/エチカ/)
  assert.match(text,/第一部 神について/)
  assert.match(text,/　これは本文です。\*1/)
  assert.match(text,/\n\n　<script>alert\(1\)<\/script>/)
  assert.match(text,/紙のパンフレット/)
  assert.match(text,/説明資料/)
  assert.doesNotMatch(text,/PRIVATE_CONTENT|秘密の草稿/)
  for(const x of calls.filter(c=>c.url.pathname.endsWith('/works')))assert.equal(x.url.searchParams.get('status'),'in.(published,open)')
})
test('Markdownは原文と章立てを保つ',async()=>{
  installMock()
  const result=await call(`/export/works/${root}.md`)
  assert.match(result.headers.get('content-type'),/text\/markdown/)
  const text=await result.text()
  assert.match(text,/# エチカ/)
  assert.match(text,/## 第一部 神について › 本文/)
  assert.match(text,/\n\n---\n\n/)
})
test('PDF印刷用HTMLは日本語・字下げ・数字だけ上付きを保持し、スクリプトを注入させない',async()=>{
  installMock()
  const result=await call(`/export/works/${root}/print`)
  assert.equal(result.status,200)
  assert.match(result.headers.get('content-type'),/text\/html/)
  assert.doesNotMatch(result.headers.get('content-disposition')||'',/attachment/)
  const text=await result.text()
  assert.match(text,/@page\{size:A4/)
  assert.match(text,/window.print\(\)/)
  assert.match(text,/　これは本文です。\*<sup/)
  assert.match(text,/>1<\/sup>/)
  assert.match(text,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(text,/<script>alert\(1\)<\/script>/)
  assert.doesNotMatch(text,/PRIVATE_CONTENT/)
  assert.match(text,/紙のパンフレット/)
  assert.match(text,/説明資料/)
})
test('未公開作品は直接ファイル取得できず、環境変数欠落も非公開情報を返さない',async()=>{
  installMock()
  const hidden=await call(`/export/works/${privateId}.txt`)
  assert.equal(hidden.status,404)
  assert.doesNotMatch(await hidden.text(),/PRIVATE_CONTENT/)
  const unavailable=await worker.fetch(new Request(`https://yohaku.example/export/works/${root}.txt`),{ASSETS:env.ASSETS})
  assert.equal(unavailable.status,503)
})
test('HEADは本文を含めず、エクスポート以外の経路は今までの処理へ渡す',async()=>{
  installMock()
  const head=await call(`/export/works/${root}.txt`,'HEAD')
  assert.equal(head.status,200)
  assert.equal(await head.text(),'')
  assert.match(head.headers.get('content-type'),/text\/plain/)
  const spa=await call(`/other-route`)
  assert.equal(await spa.text(),'SPA SHELL')
})
test('作品管理画面・作品読書画面の双方からファイル共有にアクセス可能',()=>{
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
  const owner=readFileSync(new URL('../src/MyWorkLibrary.jsx',import.meta.url),'utf8')
  const menu=readFileSync(new URL('../src/WorkExportLinks.jsx',import.meta.url),'utf8')
  assert.match(main,/<WorkExportLinks workId=\{work\.id\}/)
  assert.match(owner,/<WorkExportLinks workId=\{w\.id\} compact\/>/)
  assert.match(menu,/PDFとして保存/)
  assert.match(menu,/\.txt/)
  assert.match(menu,/\.md/)
  assert.match(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'),/"\/export\/\*"/)
})
