import test from 'node:test'
import assert from 'node:assert/strict'
import {servePublicWork, renderHtml, isUuid, loadDescendants} from '../worker/publicPages.js'
const root='e39132fd-9851-4d4e-a6e7-4e07da6e46b5'
const first='13da0000-0000-4000-8000-000000000001'
const leaf='13da0000-0000-4000-8000-000000000002'
const privateId='13da0000-0000-4000-8000-000000000003'
const unsafe='<script>alert("hi")</script>'
const db = [
 {id:root,title:'エチカ',pen_name:'スピノザ',contributor_credit:'投稿者',section:'哲学',genre:'理論哲学',theme:'',summary:'',body:'',status:'published',node_kind:'collection',parent_work_id:null,order_index:0,created_at:'2026-10-30'},
 {id:first,title:'第一部 神について',pen_name:'スピノザ',contributor_credit:'投稿者',section:'哲学',genre:'理論哲学',summary:'',body:'',status:'open',node_kind:'collection',parent_work_id:root,order_index:1,created_at:'2026-10-30'},
 {id:leaf,title:'定義',pen_name:'スピノザ',section:'哲学',genre:'理論哲学',summary:'',body:'これは定義です。'+unsafe,status:'published',node_kind:'work',parent_work_id:first,order_index:1,created_at:'2026-10-30'},
 {id:privateId,title:'非公開の機密原稿',body:'PRIVATE',status:'draft',node_kind:'work',parent_work_id:root,order_index:0,created_at:'2026-10-30'}
]
const template='<!doctype html><html><head><title>旧サイト</title></head><body><div id="root"></div><script type="module" src="/assets/compiled.js"></script></body></html>'
let requests=[]
const env={PUBLIC_SUPABASE_URL:'https://abcdef.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_demo',ASSETS:{fetch:async()=>new Response(template,{headers:{'content-type':'text/html'}})}}
const oldFetch=globalThis.fetch
const useMock=()=>{
 requests=[]
 globalThis.fetch=async(input,options)=>{
  const url=new URL(input)
  requests.push({url,options})
  assert.equal(url.host,'abcdef.supabase.co')
  assert.equal(options.headers.apikey,'sb_publishable_demo')
  assert.equal(options.headers.authorization,undefined)
  if(url.pathname==='/rest/v1/works') {
   let result=db.filter(r=>['published','open'].includes(r.status))
   const id=url.searchParams.get('id')
   if(id?.startsWith('eq.')) result=result.filter(x=>x.id===id.slice(3))
   if(id?.startsWith('in.'))result=result.filter(x=>id.slice(4,-1).split(',').includes(x.id))
   const p=url.searchParams.get('parent_work_id')
   if(p?.startsWith('in.'))result=result.filter(x=>p.slice(4,-1).split(',').includes(x.parent_work_id))
   const lim=Number(url.searchParams.get('limit')||500),offset=Number(url.searchParams.get('offset')||0)
   return Response.json(result.slice(offset,offset+lim))
  }
  if(url.pathname==='/rest/v1/work_references')return Response.json([{title:'参考書 & 研究',relation:'先行作品',url:null}])
  return Response.json([], {status:404})
 }
}
test.afterEach(()=>{globalThis.fetch=oldFetch})
test('valid work ID only',()=>{assert.ok(isUuid(root));assert.equal(isUuid('5%2fetc'),false); assert.equal(isUuid('../PRIVATE'),false)})
test('HTML includes direct original text, group descendants and metadata without executing JS',async()=>{
 useMock();const res=await servePublicWork(new Request(`https://site.test/works/${root}`),env)
 assert.equal(res.status,200)
 const html=await res.text()
 assert.match(html,/エチカ｜余白。/)
 assert.match(html,/第一部 神について/)
 assert.match(html,/これは定義です。/)
 assert.match(html,/&lt;script&gt;alert/)
 assert.doesNotMatch(html,/<script>alert\("hi"\)<\/script>/)
 assert.doesNotMatch(html,/PRIVATE/)
 assert.match(html,/<script type="module" src="\/assets\/compiled.js"><\/script>/)
 assert.match(html,/rel="canonical"/)
 assert.equal(res.headers.get('cache-control'),'no-store')
})
test('JSON returns chapter URL + body on request for anonymous external clients',async()=>{
 useMock()
 const res=await servePublicWork(new Request(`https://site.test/api/public/works/${root}?include=descendants`),env)
 assert.equal(res.status,200)
 assert.equal(res.headers.get('access-control-allow-origin'),'*')
 const json=await res.json()
 assert.equal(json.work.title,'エチカ')
 assert.ok(json.descendants.find(row=>row.id===leaf)?.url.endsWith(`/works/${leaf}`))
 assert.ok(json.inline_descendant_bodies.some(row=>row.body.includes('これは定義です。')))
 assert.ok(!JSON.stringify(json).includes('PRIVATE'))
})
test('TXT is available to bots and other non-JS consumers',async()=>{
 useMock()
 const r=await servePublicWork(new Request(`https://site.test/works/${root}.txt`),env)
 assert.equal(r.status,200)
 assert.match(await r.text(),/これは定義です。/)
})
test('private, nonexistent and invalid IDs are not exposed',async()=>{
 useMock()
 const hidden=await servePublicWork(new Request(`https://site.test/api/public/works/${privateId}`),env)
 assert.equal(hidden.status,404)
 const bad=await servePublicWork(new Request('https://site.test/api/public/works/definitely-not-a-uuid'),env)
 assert.equal(bad.status,404)
 const missing=await servePublicWork(new Request(`https://site.test/api/public/works/${root}`),{...env,PUBLIC_SUPABASE_URL:''})
 assert.equal(missing.status,503)
})
test('no session token or cookies forwarded to Supabase',async()=>{
 useMock()
 await servePublicWork(new Request(`https://site.test/api/public/works/${leaf}`,{headers:{cookie:'sb-auth=PRIVATE',authorization:'Bearer SECRET'}}),env)
 for (const req of requests) {
   assert.equal(req.options.headers.cookie,undefined)
   assert.notEqual(req.options.headers.authorization,'Bearer SECRET')
 }
})
test('HTML cannot treat contributor supplied tags as markup',()=>{
 const html=renderHtml({...db[2],title:unsafe},[],{items:[],truncated:false},{selected:[],limited:false},'https://site.test',template)
 assert.ok(html.includes('&lt;script&gt;'))
 assert.ok(!html.includes('<script>alert("hi")</script>'))
})
