import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'
import {searchVerificationPlugin} from '../scripts/searchVerification.js'
const id=i=>'a0000000-0000-4000-8000-'+i.toString(16).padStart(12,'0')
const env={PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',ASSETS:{fetch(){throw Error('Must not fall back to SPA')}}}
const base='https://yohaku.example'
const request=(path,options={})=>worker.fetch(new Request(base+path,options),env)
test('サイトマップの公開判定・分割・更新・認証境界',async t=>{
 const original=globalThis.fetch
 let rows=Array.from({length:1001},(_,i)=>({id:id(i+1),status:i%2?'open':'published',node_kind:'work',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-11-01T12:34:56Z'}))
 rows.push({id:id(9999),status:'draft'},{id:id(9998),status:'hidden'},{id:id(9997),status:'pending'},{id:id(9996),status:'deleted'})
 let incomplete=false,missingCount=false,databaseDown=false,injectPrivate=false
 const calls=[]
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);calls.push({url,init})
  assert.equal(url.hostname,'fixture.supabase.co');assert.equal(url.pathname,'/rest/v1/works')
  assert.equal(url.searchParams.get('status'),'in.(published,open)')
  assert.equal(init.headers.prefer,'count=exact');assert.equal(init.headers.apikey,'sb_publishable_fixture')
  assert.equal(init.headers.cookie,undefined);assert.equal(init.headers.authorization,undefined)
  if(databaseDown)return new Response('{}',{status:503})
  const visible=(injectPrivate?rows:rows.filter(r=>['open','published'].includes(r.status))).slice().sort((a,b)=>a.id.localeCompare(b.id))
  const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1)
  let selected=visible.slice(offset,offset+limit)
  if(incomplete)selected=selected.slice(0,20)
  return new Response(init.method==='HEAD'?null:JSON.stringify(selected),{headers:missingCount?{}:{'content-range':`${offset}-${offset+selected.length-1}/${visible.length}`}})
 }
 try{
  await t.test('index and pages use absolute canonical HTML URLs and correct XML Content-Type',async()=>{
   const index=await request('/sitemap.xml');const xml=await index.text()
   assert.equal(index.status,200);assert.equal(index.headers.get('content-type'),'application/xml; charset=utf-8')
   assert.ok(xml.includes('<sitemapindex'));assert.ok(xml.includes(base+'/sitemaps/pages.xml'));assert.ok(xml.includes('works-2.xml'));assert.ok(!xml.includes('works-3.xml'))
   const first=await request('/sitemaps/works-1.xml'),text=await first.text()
   assert.equal((text.match(/<url>/g)||[]).length,1000);assert.ok(text.includes(base+'/works/'+id(1)))
   assert.ok(text.includes('<lastmod>2026-11-01T12:34:56.000Z</lastmod>'))
   assert.equal(first.headers.get('cache-control'),'no-store')
   const second=await (await request('/sitemaps/works-2.xml')).text();assert.equal((second.match(/<url>/g)||[]).length,1)
   const home=await (await request('/sitemaps/pages.xml')).text();assert.ok(home.includes('<loc>'+base+'/</loc>'))
   for(const row of rows.filter(r=>!['open','published'].includes(r.status)))assert.ok(!text.includes(row.id)&&!second.includes(row.id))
   assert.ok(calls.every(c=>!c.url.searchParams.get('select').includes('body')))
  })
  await t.test('公開・非公開変更を再ビルドやログインなしで反映する',async()=>{
   const fresh={id:id(5000),status:'open',node_kind:'work',updated_at:'invalid'};rows.push(fresh)
   let xml=await (await request('/sitemaps/works-2.xml',{headers:{cookie:'session=private',authorization:'Bearer visitor'}})).text()
   assert.ok(xml.includes(fresh.id));assert.ok(!xml.includes('<lastmod>invalid'))
   fresh.status='hidden';xml=await (await request('/sitemaps/works-2.xml')).text();assert.ok(!xml.includes(fresh.id))
  })
  await t.test('意図しない非公開行・グループの不正確なlastmodを出力しない',async()=>{
   injectPrivate=true;rows[0].node_kind='collection'
   const first=await (await request('/sitemaps/works-1.xml')).text()
   assert.ok(!first.includes('<loc>'+base+'/works/'+id(1)+'</loc><lastmod>'))
   const second=await (await request('/sitemaps/works-2.xml')).text()
   for(const row of rows.filter(r=>!['open','published'].includes(r.status)))assert.ok(!second.includes(row.id))
   injectPrivate=false
  })
  await t.test('HEAD・メソッド・robotsとSPAルーティング',async()=>{
   const robots=await (await request('/robots.txt')).text();assert.ok(robots.includes('Sitemap: '+base+'/sitemap.xml'))
   for(const path of ['/sitemap.xml','/sitemaps/pages.xml','/sitemaps/works-1.xml']){
    const head=await request(path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'')
    assert.equal((await request(path,{method:'POST'})).status,405)
   }
   for(const path of ['/sitemaps/nope.xml','/sitemaps/works-0.xml','/sitemaps/works-99999.xml'])assert.equal((await request(path)).status,404)
  })
  await t.test('DBエラー・設定不備・不完全なページで成功扱いにしない',async()=>{
   const old=console.error;console.error=()=>{}
   try{
    incomplete=true;assert.equal((await request('/sitemaps/works-1.xml')).status,503);incomplete=false
    missingCount=true;assert.equal((await request('/sitemap.xml')).status,503);missingCount=false
    databaseDown=true;assert.equal((await request('/sitemap.xml')).status,503);databaseDown=false
    assert.equal((await worker.fetch(new Request(base+'/sitemap.xml'),{})).status,503)
    assert.equal((await worker.fetch(new Request(base+'/sitemap.xml'),{...env,PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_secret_never_use'})).status,503)
   }finally{console.error=old}
  })
  await t.test('公開作品が0件でもホームページのサイトマップは取得できる',async()=>{
   rows=[]
   const index=await (await request('/sitemap.xml')).text()
   assert.ok(index.includes('/sitemaps/pages.xml'));assert.ok(!index.includes('/sitemaps/works-'))
   const page=await request('/sitemaps/works-1.xml');assert.equal(page.status,200);assert.ok(!(await page.text()).includes('<url>'))
  })
 }finally{globalThis.fetch=original}
})
test('Search Console所有権確認タグは設定した場合だけ挿入される',()=>{
 assert.deepEqual(searchVerificationPlugin('').transformIndexHtml(),[])
 const tags=searchVerificationPlugin('verification-token').transformIndexHtml()
 assert.deepEqual(tags,[{tag:'meta',attrs:{name:'google-site-verification',content:'verification-token'},injectTo:'head'}])
})

test('所有権確認タグがビルド時のHTMLのheadへ入る',async()=>{
 const {createServer}=await import('vite')
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},plugins:[searchVerificationPlugin('test-verification-token')],server:{middlewareMode:true,hmr:false},appType:'custom'})
 try{
  const html=await server.transformIndexHtml('/','<html><head><title>余白</title></head><body></body></html>')
  assert.match(html,/<meta name="google-site-verification" content="test-verification-token">/)
  assert.ok(html.indexOf('test-verification-token')<html.indexOf('</head>'))
 }finally{await server.close()}
})
