import test, {afterEach} from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'
import {servePublicWorksApi, isUuid, runtimeConfig, loadPublicTree} from '../worker/publicWorksApi.js'

const root='e39132fd-9851-4d4e-a6e7-4e07da6e46b5'
const first='13da0000-0000-4000-8000-000000000001'
const leaf='13da0000-0000-4000-8000-000000000002'
const other='13da0000-0000-4000-8000-000000000004'
const hidden='13da0000-0000-4000-8000-000000000003'
const records=[
 {id:root,title:'エチカ',pen_name:'スピノザ',contributor_credit:'入力者',summary:'要約',body:'',section:'哲学',status:'published',node_kind:'collection',parent_work_id:null,order_index:0,created_at:'2026-10-30T03:00:00Z'},
 {id:first,title:'第一部 神について',pen_name:'スピノザ',body:'',section:'哲学',status:'open',node_kind:'collection',parent_work_id:root,order_index:1,created_at:'2026-10-30T02:00:00Z'},
 {id:leaf,title:'定義',pen_name:'スピノザ',body:'　冒頭。\n\n　本文<script>unsafe</script>',section:'哲学',status:'published',node_kind:'work',parent_work_id:first,order_index:1,created_at:'2026-10-30T01:00:00Z'},
 {id:other,title:'公理',pen_name:'スピノザ',body:'公理の本文',section:'哲学',status:'open',node_kind:'work',parent_work_id:first,order_index:2,created_at:'2026-10-30T00:00:00Z'},
 {id:hidden,title:'下書き',pen_name:'非公開',body:'SECRET_PRIVATE',section:'哲学',status:'draft',node_kind:'work',parent_work_id:root,created_at:'2026-10-29T00:00:00Z'},
]
const assetHtml='<!doctype html><html><head><title>余白。</title></head><body><div id="root"></div></body></html>'
const env={PUBLIC_SUPABASE_URL:'https://abcdef.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_mock',ASSETS:{fetch:async()=>new Response(assetHtml,{headers:{'content-type':'text/html'}})}}
const originalFetch=globalThis.fetch
let requests=[]
function dbMock({fail=false}={}){
 requests=[]
 globalThis.fetch=async(input,opts)=>{
  const url=new URL(input)
  requests.push({url,opts})
  assert.equal(url.hostname,'abcdef.supabase.co')
  assert.equal(opts.headers.apikey,'sb_publishable_mock')
  assert.equal(opts.headers.cookie,undefined)
  assert.equal(opts.headers.authorization,undefined)
  if(fail)return new Response('database offline',{status:503})
  if(url.pathname==='/rest/v1/works'){
   let rows=records.filter(r=>['published','open'].includes(r.status))
   const id=url.searchParams.get('id')
   if(id?.startsWith('eq.'))rows=rows.filter(r=>r.id===id.slice(3))
   if(id?.startsWith('in.'))rows=rows.filter(r=>id.slice(4,-1).split(',').includes(r.id))
   const parent=url.searchParams.get('parent_work_id')
   if(parent==='is.null')rows=rows.filter(r=>r.parent_work_id===null)
   if(parent?.startsWith('eq.'))rows=rows.filter(r=>r.parent_work_id===parent.slice(3))
   if(parent?.startsWith('in.'))rows=rows.filter(r=>parent.slice(4,-1).split(',').includes(r.parent_work_id))
   const section=url.searchParams.get('section')
   if(section?.startsWith('eq.')) rows=rows.filter(r=>r.section===section.slice(3))
   const title=url.searchParams.get('title')
   if(title?.startsWith('ilike.*')) rows=rows.filter(r=>r.title.includes(title.slice(7,-1)))
   if(url.searchParams.get('order')==='created_at.desc,id.desc')rows.sort((a,b)=>b.created_at.localeCompare(a.created_at))
   else rows.sort((a,b)=>(Number(a.order_index)||0)-(Number(b.order_index)||0))
   const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100)
   const select=(url.searchParams.get('select') || '').split(',')
   return Response.json(rows.slice(offset,offset+limit).map(row=>Object.fromEntries(select.map(field=>[field,row[field]??null]))))
  }
  if(url.pathname==='/rest/v1/work_references')return Response.json([{title:'紙のパンフレット',relation:'出典',url:null}])
  return Response.json([],{status:404})
 }
}
afterEach(()=>globalThis.fetch=originalFetch)
const req=(path,options={})=>servePublicWorksApi(new Request('https://site.test'+path,options),env)

test('公開用キーのみ、VITE実行時変数も代替可能',()=>{
 assert.ok(isUuid(root));assert.equal(isUuid('../../x'),false)
 assert.equal(runtimeConfig({VITE_SUPABASE_URL:'https://abcdef.supabase.co',VITE_SUPABASE_ANON_KEY:'anon'}).key,'anon')
 assert.equal(runtimeConfig({PUBLIC_SUPABASE_URL:'https://example.com',PUBLIC_SUPABASE_ANON_KEY:'secret'}),null)
})
test('共有URLはAPIから完全に独立し、設定不良でもSPAを返す',async()=>{
 const pathname=`/works/${root}`
 assert.equal(await servePublicWorksApi(new Request('https://site.test'+pathname),{}),null)
 const res=await worker.fetch(new Request('https://site.test'+pathname),{ASSETS:env.ASSETS})
 assert.equal(res.status,200)
 assert.match(await res.text(),/id="root"/)
})
test('作品一覧APIは公開作品のみ、本文を含めず、ページ区切り',async()=>{
 dbMock()
 const res=await req('/api/public/works?limit=2&page=1')
 assert.equal(res.status,200)
 assert.match(res.headers.get('content-type'),/application\/json/)
 const data=await res.json()
 assert.deepEqual(data.items.map(r=>r.title),['エチカ','第一部 神について'])
 assert.equal(data.items[0].body,undefined)
 assert.equal(data.pagination.has_more,true)
 const next=await (await req('/api/public/works?limit=2&page=2')).json()
 assert.deepEqual(next.items.map(r=>r.title),['定義','公理'])
 assert.equal(next.pagination.has_more,false)
 assert.doesNotMatch(JSON.stringify(next),/SECRET_PRIVATE/)
})
test('タイトル検索、分野絞り込み、最上位作品だけ表示に対応',async()=>{
 dbMock()
 const r=await (await req('/api/public/works?q=エチカ&section=哲学&root_only=1')).json()
 assert.deepEqual(r.items.map(x=>x.title),['エチカ'])
 for(const q of ['q=foo,bar','limit=9999','page=-1','section=unknown','root_only=foo']){
  const res=await req('/api/public/works?'+q)
  assert.equal(res.status,400)
 }
})
test('作品詳細JSONは本文・字下げ・参考文献・下位階層・APIリンクを含む',async()=>{
 dbMock()
 const res=await req(`/api/public/works/${root}`)
 assert.equal(res.status,200)
 assert.equal(res.headers.get('access-control-allow-origin'),'*')
 const json=await res.json()
 assert.equal(json.work.title,'エチカ')
 assert.deepEqual(json.descendants.map(x=>x.id),[first,leaf,other])
 assert.equal(json.descendants[1].path,'第一部 神について › 定義')
 assert.equal(json.references[0].url,null)
 assert.equal(json.links.descendants,`https://site.test/api/public/works/${root}/descendants`)
 assert.doesNotMatch(JSON.stringify(json),/SECRET_PRIVATE/)
 const child=await (await req(`/api/public/works/${leaf}`)).json()
 assert.equal(child.work.body,records[2].body)
 assert.match(child.work.body,/^　冒頭。\n\n　本文/)
})
test('孫作品も含む本文APIはページ単位で取得できる',async()=>{
 dbMock()
 const path=`/api/public/works/${root}/descendants`
 const page1=await (await req(`${path}?page=1&limit=2`)).json()
 assert.deepEqual(page1.items.map(r=>r.title),['第一部 神について','定義'])
 assert.equal(page1.pagination.next_page,2)
 assert.equal(page1.items[1].body,records[2].body)
 const page2=await (await req(`${path}?page=2&limit=2`)).json()
 assert.deepEqual(page2.items.map(r=>r.title),['公理'])
 assert.equal(page2.pagination.next_page,null)
 assert.doesNotMatch(JSON.stringify(page2),/SECRET_PRIVATE/)
})
test('グループ直下の子作品を、ツリー上限とは独立してページング取得できる',async()=>{
 dbMock()
 const res=await (await req(`/api/public/works/${first}/children?page=1&limit=1`)).json()
 assert.equal(res.items[0].title,'定義')
 assert.equal(res.pagination.next_page,2)
 const res2=await (await req(`/api/public/works/${first}/children?page=2&limit=1`)).json()
 assert.equal(res2.items[0].title,'公理')
 assert.equal(res2.pagination.has_more,false)
})
test('旧版の ?include=descendants も利用可能',async()=>{
 dbMock()
 const json=await (await req(`/api/public/works/${root}?include=descendants`)).json()
 assert.ok(json.inline_descendant_bodies.some(item=>item.body===records[2].body))
})
test('非公開・未登録作品、無効なURLは404で本文を公開しない',async()=>{
 dbMock()
 const hiddenRes=await req(`/api/public/works/${hidden}`)
 assert.equal(hiddenRes.status,404)
 assert.deepEqual(await hiddenRes.json(),{error:'not_found'})
 assert.equal((await req('/api/public/works/not-a-uuid')).status,404)
 assert.equal((await req('/api/public/unknown')).status,404)
})
test('HEAD,OPTIONS,POST と非公開トークンの転送禁止',async()=>{
 dbMock()
 const head=await req(`/api/public/works/${root}`,{method:'HEAD',headers:{cookie:'private',authorization:'Bearer SECRET'}})
 assert.equal(head.status,200);assert.equal(await head.text(),'')
 const options=await req('/api/public/works',{method:'OPTIONS'})
 assert.equal(options.status,204)
 const post=await req('/api/public/works',{method:'POST'})
 assert.equal(post.status,405)
 for(const x of requests){
  assert.equal(x.opts.headers.authorization,undefined)
  assert.equal(x.opts.headers.cookie,undefined)
  if(x.url.pathname.endsWith('/works')) assert.equal(x.url.searchParams.get('status'),'in.(published,open)')
 }
})
test('設定不足とSupabase接続障害を区別し、内部情報を返さない',async()=>{
 const missing=await servePublicWorksApi(new Request(`https://site.test/api/public/works/${root}`),{})
 assert.equal(missing.status,503)
 assert.equal((await missing.json()).error,'not_configured')
 dbMock({fail:true})
 const broken=await req(`/api/public/works/${root}`)
 assert.equal(broken.status,503)
 assert.deepEqual(await broken.json(),{error:'temporarily_unavailable'})
})
