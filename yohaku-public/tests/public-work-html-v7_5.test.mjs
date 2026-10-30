import test, {afterEach} from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'
import {servePublicWorkHtml,renderPublicWorkHtml} from '../worker/publicWorkHtml.js'

const root='e39132fd-9851-4d4e-a6e7-4e07da6e46b5'
const first='13da0000-0000-4000-8000-000000000001'
const leaf='13da0000-0000-4000-8000-000000000002'
const hidden='13da0000-0000-4000-8000-000000000003'
const values=[
 {id:root,title:'エチカ',pen_name:'スピノザ',summary:'<安全の確認>',body:'',status:'published',node_kind:'collection',parent_work_id:null,order_index:0,created_at:'2026-10-30'},
 {id:first,title:'第一部 神について',pen_name:'スピノザ',body:'',status:'published',node_kind:'collection',parent_work_id:root,order_index:1,created_at:'2026-10-30'},
 {id:leaf,title:'本文',pen_name:'スピノザ',body:'　これは本文です。\n\n　<script>alert("XSS")</script> & 引用',status:'open',node_kind:'work',parent_work_id:first,order_index:1,created_at:'2026-10-30'},
 {id:hidden,title:'秘密',pen_name:'author',body:'SECRET_PRIVATE_BODY',status:'draft',node_kind:'work',parent_work_id:root,order_index:2,created_at:'2026-10-30'},
]
const template='<!doctype html><html lang="ja"><head><title>余白。</title><meta name="description" content="一般的な説明"><script type="module" src="/assets/index-123.js"></script><link rel="stylesheet" href="/assets/index-123.css"></head><body><div id="root"></div></body></html>'
let sent=[]
const env={PUBLIC_SUPABASE_URL:'https://sample.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_mock',ASSETS:{fetch:async()=>new Response(template,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public,max-age=120'}})}}
const originalFetch=globalThis.fetch
function mockDb(fail=false){
 sent=[]
 globalThis.fetch=async(input,init)=>{
  const u=new URL(input)
  sent.push({url:u,init})
  assert.equal(u.hostname,'sample.supabase.co')
  assert.equal(init.headers.apikey,'sb_publishable_mock')
  assert.equal(init.headers.cookie,undefined)
  assert.equal(init.headers.authorization,undefined)
  if(fail)return new Response('broken',{status:503})
  if(u.pathname==='/rest/v1/works'){
   let rows=values.filter(x=>x.status==='published'||x.status==='open')
   const id=u.searchParams.get('id')||''
   if(id.startsWith('eq.')) rows=rows.filter(r=>r.id===id.slice(3))
   if(id.startsWith('in.')) rows=rows.filter(r=>id.slice(4,-1).split(',').includes(r.id))
   const parent=u.searchParams.get('parent_work_id')||''
   if(parent.startsWith('in.'))rows=rows.filter(r=>parent.slice(4,-1).split(',').includes(r.parent_work_id))
   const fields=(u.searchParams.get('select')||'').split(',')
   return Response.json(rows.slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+Number(u.searchParams.get('limit')||200)).map(r=>Object.fromEntries(fields.map(f=>[f,r[f]??null]))))
  }
  if(u.pathname==='/rest/v1/work_references')return Response.json([{title:'配布パンフレット',relation:'出典',url:null}])
  return Response.json([],{status:404})
 }
}
afterEach(()=>globalThis.fetch=originalFetch)
const request=(id,init={})=>new Request(`https://yohaku.example/works/${id}`,init)

test('公開された親グループの初期HTMLに孫作品の本文・目次・字下げを含む',async()=>{
 mockDb()
 const res=await worker.fetch(request(root),env)
 const html=await res.text()
 assert.equal(res.status,200)
 assert.match(res.headers.get('content-type'),/text\/html/)
 assert.equal(res.headers.get('cache-control'),'no-store')
 assert.match(html,/<title>エチカ｜余白。<\/title>/)
 assert.match(html,/rel="canonical" href="https:\/\/yohaku\.example\/works\//)
 assert.match(html,/第一部 神について/)
 assert.match(html,/　これは本文です。\n\n　&amp;lt;script&amp;gt;|　これは本文です。\n\n　&lt;script&gt;/)
 assert.match(html,/&lt;script&gt;alert\(&quot;XSS&quot;\)&lt;\/script&gt;/)
 assert.doesNotMatch(html,/<script>alert\("XSS"\)<\/script>/)
 assert.doesNotMatch(html,/SECRET_PRIVATE_BODY/)
 assert.doesNotMatch(html,/秘密/)
 assert.match(html,/配布パンフレット/)
 assert.match(html,/src="\/assets\/index-123.js"/)
 assert.match(html,/href="\/assets\/index-123.css"/)
 assert.match(html,/自由公開（未審査）|審査済み公開/)
 assert.ok(sent.length>1)
 for(const x of sent.filter(x=>x.url.pathname==='/rest/v1/works')) assert.equal(x.url.searchParams.get('status'),'in.(published,open)')
})
test('個別作品の初期HTMLに本文全文を含みMarkdown原文の字下げを保存',async()=>{
 mockDb()
 const html=await (await worker.fetch(request(leaf),env)).text()
 assert.match(html,/　これは本文です。/)
 assert.match(html,/　&lt;script&gt;alert/)
 assert.match(html,/自由公開（未審査）/)
 assert.match(html,/og:title/)
})
test('非公開作品は初期HTMLに漏れずSPAシェルに戻る',async()=>{
 mockDb()
 const html=await (await worker.fetch(request(hidden),env)).text()
 assert.equal(html,template)
 assert.doesNotMatch(html,/SECRET_PRIVATE_BODY/)
 assert.equal(await servePublicWorkHtml(request('not-a-uuid'),env),null)
})
test('環境変数なし・データベース障害でも通常のSPAを返す',async()=>{
 mockDb()
 assert.equal(await (await worker.fetch(request(root),{ASSETS:env.ASSETS})).text(),template)
 mockDb(true)
 assert.equal(await (await worker.fetch(request(root),env)).text(),template)
})
test('HEADは本文なしのHTMLレスポンス、JSON APIはそのままJSON',async()=>{
 mockDb()
 const head=await worker.fetch(request(root,{method:'HEAD'}),env)
 assert.equal(head.status,200)
 assert.equal(await head.text(),'')
 const api=await worker.fetch(new Request(`https://yohaku.example/api/public/works/${leaf}`),env)
 assert.match(api.headers.get('content-type'),/application\/json/)
 assert.equal((await api.json()).work.body,values[2].body)
})
test('不正HTMLの埋め込みを防ぎ、親の本文は常に埋め込む',()=>{
 const work={id:root,title:'</title><script>hack</script>',body:'　始まり\n 続き <iframe src="evil"></iframe>',status:'open'}
 const html=renderPublicWorkHtml(template,work,[],{items:[],truncated:false},{items:[],limited:false},'https://yohaku.example')
 assert.ok(html)
 assert.match(html,/&lt;iframe/)
 assert.doesNotMatch(html,/<script>hack<\/script>/)
 assert.doesNotMatch(html,/<iframe/)
 assert.match(html,/　始まり\n 続き/)
})
