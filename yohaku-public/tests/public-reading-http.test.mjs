import {robotsAllows} from '../worker/crawlerPolicy.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {writeFile} from 'node:fs/promises'
import worker from '../worker/index.js'
import {runtimeConfig} from '../worker/publicWorksApi.js'

const rootId='10000000-0000-4000-8000-000000000001'
const childId=i=>`20000000-0000-4000-8000-${String(i).padStart(12,'0')}`
const privateId='30000000-0000-4000-8000-000000000001'
const body='# 見出し\n\n段落と **太字**\n\n> 引用を保持\n\n$$x^2+y^2=z^2$$\n\n出典*1、未対応*9。\n\n```js\nconst literal="*1"\n```\n\n文字列 $& を保持。'
const root={id:rootId,title:'検証作品 </script><script>alert(1)</script> $&',pen_name:'公開著者',body,status:'published',summary:'公開作品の検証用の概要',node_kind:'collection',created_at:'2026-01-01',updated_at:'2026-01-02'}
let rows,refs,notes,dbDown=false,refDown=false,denyId=null,hideOnReferences=false
const reset=()=>{
 rows=[root,...Array.from({length:15},(_,i)=>({id:childId(i+1),title:`第${i+1}章`,pen_name:'章の著者',parent_work_id:rootId,order_index:i+1,status:i===1?'open':'published',body:`第${i+1}章の全文。参照*1。`,created_at:'2026-01-01'})),...['draft','hidden','pending','rejected','deleted'].map((status,i)=>({id:i===0?privateId:childId(100+i),title:'秘密タイトル',body:'秘密本文',status,parent_work_id:rootId})),{id:childId(200),status:'published',title:'秘密の枝',body:'秘密の枝本文',parent_work_id:childId(101)}]
 refs=[{work_id:rootId,title:'【*1】 根の文献',relation:'根の引用元',url:'https://example.org/root-source'},{work_id:rootId,title:'番号なしの文献',relation:'背景資料',url:null},...Array.from({length:15},(_,i)=>({work_id:childId(i+1),title:`【*1】 章${i+1}の文献`,relation:'章の引用元',url:`https://example.org/chapter-${i+1}`}))]
 notes=[{id:'note1',work_id:rootId,pen_name:'読者',type:'読後の問い',body:'公開読者注釈',status:'published',created_at:'2026-01-01'},{id:'note2',work_id:rootId,pen_name:'秘密読者',body:'審査待ちの秘密注釈',status:'pending'}]
 dbDown=false;refDown=false;denyId=null;hideOnReferences=false
}
reset()
const realFetch=globalThis.fetch
const queries=[]
const project=(row,select)=>Object.fromEntries(select.split(',').filter(k=>k in row).map(k=>[k,row[k]]))
const matches=(value,filter)=>!filter?true:filter.startsWith('eq.')?value===filter.slice(3):filter.startsWith('in.(')?filter.slice(4,-1).split(',').includes(value):true
const env={PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',ASSETS:{async fetch(req){
 if(new URL(req.url).pathname==='/index.html')return new Response('<!doctype html><html lang="ja"><head><title>余白</title><meta name="description" content="old"></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>',{headers:{'content-type':'text/html','etag':'stale','content-length':'1'}})
 return new Response('SPA FALLBACK MUST NOT HIDE ERRORS',{headers:{'content-type':'text/html'}})
}}}
const report=[]
test('unauthenticated HTTP reading routes and publication boundaries',async t=>{
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url)
  if(url.hostname!=='fixture.supabase.co')return realFetch(input,init)
  queries.push({url,headers:new Headers(init?.headers)})
  if(dbDown||(refDown&&url.pathname.endsWith('/work_references')))return Response.json({code:'unavailable'},{status:503})
  const table=url.pathname.split('/').at(-1),params=url.searchParams
  if(table==='work_references'&&hideOnReferences)rows[0]={...rows[0],status:'hidden'}
  let data=(table==='works'?rows:table==='notes'?notes:refs).filter(r=>matches(r.id,params.get('id'))&&matches(r.status,params.get('status'))&&matches(r.parent_work_id,params.get('parent_work_id'))&&matches(r.work_id,params.get('work_id')))
  if(table==='works')data=data.filter(r=>r.id!==denyId)
  const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||1000)
  return Response.json(data.slice(offset,offset+limit).map(r=>project(r,params.get('select'))))
 }
 const server=createServer(async(req,res)=>{try{
  const response=await worker.fetch(new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers}),env)
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
 }catch(error){res.writeHead(500);res.end(String(error))}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const base=`http://127.0.0.1:${server.address().port}`
 const request=async(path,options={})=>{
  const response=await realFetch(base+path,options),text=await response.text()
  report.push({path,method:options.method||'GET',status:response.status,content_type:response.headers.get('content-type'),characters:text.length})
  return {response,text}
 }
 try{
 await t.test('free pending and rejected reviews stay readable without claiming approval',async()=>{
  try{
   for(const state of ['pending','rejected']){
    reset();rows[0]={...root,status:'open',review_state:state};
    for(const path of [`/works/${rootId}`,`/works/${rootId}.md`,`/api/public/works/${rootId}`]){
     const {response,text}=await request(path);assert.equal(response.status,200);
     assert.ok(text.includes('根の文献'));assert.ok(text.includes('https://example.org/root-source'));
     if(path.startsWith('/api/')){const data=JSON.parse(text);assert.equal(data.work.status,'open');assert.equal(data.work.review_state,state)}
     else assert.ok(text.includes(state==='pending'?'自由公開・審査中':'自由公開・差し戻し'));
    }
   }
  }finally{reset()}
 })
 await t.test('HTML embeds all chapters, references, safe metadata and no-JS text',async()=>{
  const {response,text}=await request(`/works/${rootId}`)
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^text\/html; charset=utf-8$/)
  for(const value of ['公開著者','第15章の全文','根の文献','https://example.org/chapter-15','公開読者注釈','章構成','文字列 $& を保持。'])assert.ok(text.includes(value==='章構成'?'目次・収録作品':value),value)
  assert.doesNotMatch(text,/秘密本文|秘密タイトル|秘密の枝本文|審査待ちの秘密注釈|SPA FALLBACK/)
  assert.ok(text.includes(`href="#ref-${childId(1)}-1"`));assert.ok(text.includes(`id="ref-${childId(1)}-1"`))
  assert.ok(text.includes(`rel="canonical" href="${base}/works/${rootId}"`))
  assert.ok(text.includes(`href="${base}/works/${rootId}.md"`))
  assert.doesNotMatch(text,/<script>alert/)
  const ld=JSON.parse(text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])
  assert.equal(ld.name,root.title);assert.equal(ld.text,body);assert.equal(ld.hasPart.length,15)
  assert.equal(response.headers.get('etag'),null);assert.equal(response.headers.get('cache-control'),'no-store')
 })
 await t.test('Markdown preserves structure, math, quotation, code and scoped citations',async()=>{
  const {response,text}=await request(`/works/${rootId}.md`)
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'text/markdown; charset=utf-8')
  for(const value of ['# 見出し','> 引用を保持','$$x^2+y^2=z^2$$','**太字**','const literal="*1"','第15章の全文','公開読者注釈',`[^work-${rootId}-note-1]`,`[^work-${childId(1)}-note-1]`,'https://example.org/root-source'])assert.ok(text.includes(value),value)
  assert.match(text,/注釈 \*9[^\n]*対応する参考文献は未登録/)
  assert.doesNotMatch(text,/秘密本文|審査待ちの秘密注釈/)
  assert.equal(response.headers.get('content-disposition'),null)
 })
 await t.test('JSON exposes complete public chapters and interpretable citation relationships',async()=>{
  const {response,text}=await request(`/api/public/works/${rootId}`),data=JSON.parse(text)
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8')
  assert.equal(data.work.body,body);assert.equal(data.chapters.length,15)
  assert.equal(data.chapters.at(-1).body,'第15章の全文。参照*1。')
  assert.equal(data.annotations.find(a=>a.number==='1').references[0].url,'https://example.org/root-source')
  assert.equal(data.chapters[0].annotations[0].references[0].url,'https://example.org/chapter-1')
  assert.notEqual(data.annotations[0].footnote_id,data.chapters[0].annotations[0].footnote_id)
  assert.equal(data.annotations.find(a=>a.number==='9').resolved,false)
  assert.equal(data.notes.length,1);assert.equal(data.links.markdown,`${base}/works/${rootId}.md`)
  assert.doesNotMatch(text,/秘密本文|審査待ちの秘密注釈|author_id|apikey|sb_publishable_fixture/)
  const legacy=await request(`/api/public/works/${rootId}/content?limit=12&page=2`),page=JSON.parse(legacy.text)
  assert.equal(legacy.response.status,200);assert.equal(page.items.length,3)
  assert.equal(page.items.at(-1).annotations[0].references[0].url,'https://example.org/chapter-15')
 })
 await t.test('non-public, missing and RLS-denied works never fall back to successful SPA',async()=>{
  for(const row of rows.filter(r=>!['open','published'].includes(r.status))){
   for(const path of [`/works/${row.id}`,`/works/${row.id}.md`,`/api/public/works/${row.id}`]){
    const {response,text}=await request(path);assert.equal(response.status,404);assert.doesNotMatch(text,/秘密本文|秘密タイトル|SPA FALLBACK/)
   }
  }
  denyId=rootId
  for(const path of [`/works/${rootId}`,`/works/${rootId}.md`,`/api/public/works/${rootId}`])assert.equal((await request(path)).response.status,404)
  denyId=null
  for(const path of ['/works/invalid','/works/invalid.md','/api/public/works/invalid',`/works/${childId(999)}`,`/works/${childId(999)}.md`,`/api/public/works/${childId(999)}`])assert.equal((await request(path)).response.status,404)
 })
 await t.test('HEAD, methods, robots and configured worker routing',async()=>{
  for(const path of [`/works/${rootId}`,`/works/${rootId}.md`,`/api/public/works/${rootId}`]){
   const head=await request(path,{method:'HEAD'});assert.equal(head.response.status,200);assert.equal(head.text,'')
   assert.equal((await request(path,{method:'POST'})).response.status,405)
  }
  assert.equal(robotsAllows('User-agent: special\nDisallow:\n\nUser-agent: other\nDisallow: /','special','/'),true)
  const robots=await request('/robots.txt');assert.equal(robots.response.status,200);assert.match(robots.text,/Allow: \/api\/public\/works/);assert.match(robots.text,/Disallow: \/admin/)
  for(const ua of ['ChatGPT-User','Claude-User','Googlebot']){assert.ok(robotsAllows(robots.text,ua,`/works/${rootId}`));assert.ok(robotsAllows(robots.text,ua,`/api/public/works/${rootId}`))}
  assert.equal(robotsAllows(robots.text+'\nUser-agent: ChatGPT-User\nDisallow: /\n','ChatGPT-User',`/works/${rootId}`),false)
  for(const ua of ['ChatGPT-User','Claude-User','Googlebot'])assert.equal((await request(`/works/${rootId}.md`,{headers:{'user-agent':ua}})).response.status,200)
 })
 await t.test('visitor credentials are never forwarded and privileged server keys are rejected',async()=>{
  await request(`/works/${rootId}`,{headers:{cookie:'secret=session',authorization:'Bearer visitor-secret'}})
  for(const q of queries){assert.equal(q.headers.get('cookie'),null);assert.equal(q.headers.get('authorization'),null);assert.equal(q.headers.get('apikey'),'sb_publishable_fixture')}
  assert.equal(runtimeConfig({...env,PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_forbidden'}),null)
  const serviceJWT='eyJ0eXAiOiJKV1QifQ.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature'
  assert.equal(runtimeConfig({...env,PUBLIC_SUPABASE_PUBLISHABLE_KEY:serviceJWT}),null)
 })
 await t.test('runtime setup failure is explicit and legacy export/API URLs still work',async()=>{
  const saved=env.PUBLIC_SUPABASE_PUBLISHABLE_KEY
  try{
   env.PUBLIC_SUPABASE_PUBLISHABLE_KEY=''
   for(const path of [`/works/${rootId}`,`/works/${rootId}.md`,`/api/public/works/${rootId}`]){
    const {response,text}=await request(path);assert.equal(response.status,503);assert.doesNotMatch(text,/SPA FALLBACK/)
   }
  }finally{env.PUBLIC_SUPABASE_PUBLISHABLE_KEY=saved}
  for(const [path,type] of [[`/export/works/${rootId}.md`,'text/markdown'],[`/export/works/${rootId}.txt`,'text/plain'],[`/export/works/${rootId}/print`,'text/html']]){
   const {response,text}=await request(path);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').startsWith(type));assert.ok(text.includes('第15章の全文'))
  }
  const {response,text}=await request(`/api/public/works/${rootId}?include=descendants`)
  assert.equal(response.status,200);assert.equal(JSON.parse(text).inline_descendant_bodies.length,8)
  const upper=rootId.replace('10000000','ABCDEF00')
  const alternate={...root,id:upper.toLowerCase(),parent_work_id:null}
  rows.push(alternate)
  assert.equal((await request(`/works/${upper}`)).response.status,200)
  rows.pop()
 })
 await t.test('revocation during document assembly never returns stale public content',async()=>{
  const oldError=console.error;console.error=()=>{}
  try{
   for(const path of [`/works/${rootId}`,`/works/${rootId}.md`,`/api/public/works/${rootId}`]){
    reset();hideOnReferences=true
    const {response,text}=await request(path)
    assert.equal(response.status,503);assert.doesNotMatch(text,/第15章の全文|公開読者注釈/)
   }
  }finally{reset();console.error=oldError}
 })
 await t.test('database errors and oversized documents return explicit errors rather than partial success',async()=>{
  const oldError=console.error;console.error=()=>{}
  try{
   for(const mode of ['database','references']){
    dbDown=mode==='database';refDown=mode==='references'
    for(const path of [`/works/${rootId}`,`/works/${rootId}.md`,`/api/public/works/${rootId}`]){const r=await request(path);assert.equal(r.response.status,503);assert.doesNotMatch(r.text,/SPA FALLBACK|sb_publishable_fixture/)}
   }
   reset();rows[0]={...root,body:'超'.repeat(2_000_001)}
   for(const path of [`/works/${rootId}`,`/works/${rootId}.md`,`/api/public/works/${rootId}`])assert.equal((await request(path)).response.status,413)
   reset()
  }finally{console.error=oldError;reset()}
 })
 }finally{
  globalThis.fetch=realFetch;await new Promise(resolve=>server.close(resolve))
  if(process.env.YOHAKU_HTTP_REPORT)await writeFile(process.env.YOHAKU_HTTP_REPORT,JSON.stringify({environment:'local HTTP server; mocked anonymous Supabase; HTTP fetch without browser/page JavaScript',results:report},null,2))
 }
})
