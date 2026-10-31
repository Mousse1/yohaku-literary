import test, {afterEach} from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'
import {servePublicWorksApi, runtimeConfig} from '../worker/publicWorksApi.js'

const root='e39132fd-9851-4d4e-a6e7-4e07da6e46b5'
const group='13da0000-0000-4000-8000-000000000001'
const leaf='13da0000-0000-4000-8000-000000000002'
const hidden='13da0000-0000-4000-8000-000000000003'
const records=[
  {id:root,title:'エチカ',pen_name:'スピノザ',body:'　作品全体の序文\n次の行',status:'published',node_kind:'collection',parent_work_id:null,order_index:0,created_at:'2026-10-30T00:00:00Z'},
  {id:group,title:'第一部 神について',body:'',status:'published',node_kind:'collection',parent_work_id:root,order_index:1,created_at:'2026-10-30T00:00:00Z'},
  {id:leaf,title:'定義',body:'　定義一。\n\n　定義二。',status:'open',node_kind:'work',parent_work_id:group,order_index:1,created_at:'2026-10-30T00:00:00Z'},
  {id:hidden,title:'下書き',body:'PRIVATE-DO-NOT-EXPOSE',status:'draft',node_kind:'work',parent_work_id:root,order_index:2,created_at:'2026-10-30T00:00:00Z'},
]
const html='<!doctype html><html><head><title>余白。</title></head><body><div id="root"></div></body></html>'
const env={PUBLIC_SUPABASE_URL:'https://abcdef.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example',ASSETS:{fetch:async()=>new Response(html,{headers:{'content-type':'text/html'}})}}
const originalFetch=globalThis.fetch
let inbound=[]
function mockDatabase(){
  inbound=[]
  globalThis.fetch=async(input,opts={})=>{
    const url=new URL(input)
    inbound.push({url,opts})
    assert.equal(url.hostname,'abcdef.supabase.co')
    assert.equal(opts.headers.apikey,'sb_publishable_example')
    assert.equal(opts.headers.authorization,undefined)
    assert.equal(opts.headers.cookie,undefined)
    if(url.pathname==='/rest/v1/work_references')return Response.json([])
    assert.equal(url.pathname,'/rest/v1/works')
    assert.equal(url.searchParams.get('status'),'in.(published,open)')
    let rows=records.filter(r=>r.status==='published'||r.status==='open')
    const id=url.searchParams.get('id')
    if(id?.startsWith('eq.'))rows=rows.filter(r=>r.id===id.slice(3))
    if(id?.startsWith('in.'))rows=rows.filter(r=>id.slice(4,-1).split(',').includes(r.id))
    const parent=url.searchParams.get('parent_work_id')
    if(parent?.startsWith('eq.'))rows=rows.filter(r=>r.parent_work_id===parent.slice(3))
    if(parent?.startsWith('in.'))rows=rows.filter(r=>parent.slice(4,-1).split(',').includes(r.parent_work_id))
    const select=url.searchParams.get('select').split(',')
    const offset=Number(url.searchParams.get('offset')||0)
    const limit=Number(url.searchParams.get('limit')||100)
    return Response.json(rows.slice(offset,offset+limit).map(r=>Object.fromEntries(select.map(key=>[key,r[key]??null]))))
  }
}
afterEach(()=>{globalThis.fetch=originalFetch})
const address=`https://site.test/api/public/works/${root}/content`

test('ログインCookieもAuthorizationもないGETで親本文と孫本文をJSON取得',async()=>{
  mockDatabase()
  const res=await worker.fetch(new Request(address),env)
  assert.equal(res.status,200)
  assert.match(res.headers.get('content-type'),/application\/json/)
  assert.equal(res.headers.get('access-control-allow-origin'),'*')
  const json=await res.json()
  assert.equal(json.work.id,root)
  assert.equal(json.work.body,'　作品全体の序文\n次の行')
  assert.deepEqual(json.items.map(x=>x.title),['第一部 神について','定義'])
  assert.equal(json.items[1].body,'　定義一。\n\n　定義二。')
  assert.equal(json.items[1].depth,2)
  assert.equal(json.items[1].path,'第一部 神について › 定義')
  assert.equal(json.links.next,null)
  assert.doesNotMatch(JSON.stringify(json),/PRIVATE-DO-NOT-EXPOSE/)
  assert.ok(inbound.length)
})

test('下位作品が多い場合はページングし、次ページURLを返す',async()=>{
  mockDatabase()
  const first=await (await worker.fetch(new Request(`${address}?page=1&limit=1`),env)).json()
  assert.equal(first.items.length,1)
  assert.equal(first.items[0].title,'第一部 神について')
  assert.equal(first.pagination.has_more,true)
  assert.equal(first.links.next,`${address}?page=2&limit=1`)
  const second=await (await worker.fetch(new Request(first.links.next),env)).json()
  assert.equal(second.items[0].body,'　定義一。\n\n　定義二。')
  assert.equal(second.pagination.next_page,null)
})

test('自由公開・未審査の本文は読めるが下書きにはアクセスできない',async()=>{
  mockDatabase()
  const publicResponse=await worker.fetch(new Request(`https://site.test/api/public/works/${leaf}/content`),env)
  assert.equal(publicResponse.status,200)
  assert.equal((await publicResponse.json()).work.body,records[2].body)
  const privateResponse=await worker.fetch(new Request(`https://site.test/api/public/works/${hidden}/content`),env)
  assert.equal(privateResponse.status,404)
  assert.equal((await privateResponse.json()).error,'not_found')
})

test('認証ヘッダーが送られてもSupabaseには転送しない',async()=>{
  mockDatabase()
  const res=await worker.fetch(new Request(address,{headers:{Authorization:'Bearer user-private-jwt',Cookie:'secret_session=1'}}),env)
  assert.equal(res.status,200)
  assert.ok(inbound.every(x=>!('cookie' in x.opts.headers)&&!('authorization' in x.opts.headers)))
})

test('HEAD、CORSプリフライト、誤った入力を安全に処理',async()=>{
  mockDatabase()
  const head=await worker.fetch(new Request(address,{method:'HEAD'}),env)
  assert.equal(head.status,200)
  assert.equal(await head.text(),'')
  const options=await worker.fetch(new Request(address,{method:'OPTIONS'}),env)
  assert.equal(options.status,204)
  assert.equal(options.headers.get('access-control-allow-origin'),'*')
  const invalid=await worker.fetch(new Request(`${address}?limit=200`),env)
  assert.equal(invalid.status,400)
  const post=await worker.fetch(new Request(address,{method:'POST'}),env)
  assert.equal(post.status,405)
})

test('従来の詳細APIにも本文とcontentリンクを返す',async()=>{
  mockDatabase()
  const res=await servePublicWorksApi(new Request(`https://site.test/api/public/works/${root}`),env)
  const json=await res.json()
  assert.equal(json.work.body,'　作品全体の序文\n次の行')
  assert.equal(json.links.content,address)
})

test('共有URL初期HTMLに本文とJSON APIへの発見用リンクを含める',async()=>{
  mockDatabase()
  const res=await worker.fetch(new Request(`https://site.test/works/${root}`),env)
  const page=await res.text()
  assert.equal(res.status,200)
  assert.match(page,/rel="alternate" type="application\/json"/)
  assert.match(page,/\/api\/public\/works\/e39132fd-9851-4d4e-a6e7-4e07da6e46b5\/content/)
  assert.match(page,/作品全体の序文/)
  assert.match(page,/定義一。/)
  assert.doesNotMatch(page,/PRIVATE-DO-NOT-EXPOSE/)
})

test('高権限キーを誤登録しても匿名APIは使用しない',async()=>{
  assert.equal(runtimeConfig({PUBLIC_SUPABASE_URL:'https://abcdef.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_do_not_use'}),null)
  const jwt=(role)=>['eyJhbGciOiJub25lIn0',Buffer.from(JSON.stringify({role})).toString('base64url'),'signature'].join('.')
  assert.equal(runtimeConfig({PUBLIC_SUPABASE_URL:'https://abcdef.supabase.co',PUBLIC_SUPABASE_ANON_KEY:jwt('service_role')}),null)
  assert.ok(runtimeConfig({PUBLIC_SUPABASE_URL:'https://abcdef.supabase.co',PUBLIC_SUPABASE_ANON_KEY:jwt('anon')}))
})
