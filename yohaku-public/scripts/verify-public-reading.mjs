import {robotsAllows} from '../worker/crawlerPolicy.js'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

// Read-only post-deployment verification. No browser, cookies or login tokens.
const [base,id,privateId]=process.argv.slice(2)
if(!base||!id)throw new Error('Usage: node scripts/verify-public-reading.mjs https://YOUR_DOMAIN PUBLIC_UUID [PRIVATE_UUID]')
const origin=new URL(base)
assert.ok(origin.protocol==='https:'||(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))
assert.ok(!origin.username&&!origin.password&&!origin.search&&!origin.hash)
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
assert.ok(uuid.test(id));if(privateId)assert.ok(uuid.test(privateId))
const results=[]
async function read(path,expected,type,ua='Yohaku-HTTP-Verification/1.0') {
 const response=await fetch(new URL(path,origin),{headers:{accept:type,'user-agent':ua},redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(60000)})
 const body=await response.text(),contentType=response.headers.get('content-type')||''
 results.push({url:response.url,method:'GET',user_agent:ua,status:response.status,content_type:contentType,characters:body.length,sha256:createHash('sha256').update(body).digest('hex'),cf_mitigated:response.headers.get('cf-mitigated')})
 assert.equal(response.status,expected,`${path}: status ${response.status}`)
 assert.ok(contentType.startsWith(type),`${path}: ${contentType}`)
 assert.notEqual(response.headers.get('cf-mitigated'),'challenge')
 return body
}
try {
 const html=await read(`/works/${id}`,200,'text/html')
 const markdown=await read(`/works/${id}.md`,200,'text/markdown')
 const json=JSON.parse(await read(`/api/public/works/${id}`,200,'application/json'))
 assert.equal(json.work.id.toLowerCase(),id.toLowerCase());assert.ok(json.work.title)
 assert.ok(html.includes('rel="canonical"'));assert.ok(html.includes('application/ld+json'))
 assert.ok(markdown.includes(`作品ID: ${json.work.id}`))
 const htmlText=html.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
 for(const work of [json.work,...json.chapters]){
  // Text around editorial note markers may differ by representation; use a
  // non-marker plain line, plus explicit per-work scope and reference checks.
  const line=String(work.body||'').split(/\r?\n/).find(s=>s.trim().length>5&&!/[*<>]/.test(s))
  if(line)assert.ok(htmlText.includes(line),`Missing HTML body for ${work.id}`)
  assert.ok(markdown.includes(`作品ID: ${work.id}`))
 }
 for(const work of [{...json.work,annotations:json.annotations},...json.chapters]){
  for(const annotation of work.annotations||[]){
   assert.ok(markdown.includes(`[^${annotation.footnote_id}]:`))
   for(const ref of annotation.references){
    assert.equal(ref.annotation_number,annotation.number)
    if(ref.url){assert.ok(markdown.includes(ref.url));assert.ok(htmlText.includes(ref.url))}
   }
  }
 }
 const robots=await read('/robots.txt',200,'text/plain')
 for(const agent of ['ChatGPT-User','OAI-SearchBot','Claude-User','Claude-SearchBot','Googlebot'])for(const path of [`/works/${id}`,`/works/${id}.md`,`/api/public/works/${id}`])assert.ok(robotsAllows(robots,agent,path),`robots.txt blocks ${agent} ${path}`)
 for(const agent of ['ChatGPT-User','Claude-User','Googlebot'])await read(`/works/${id}.md`,200,'text/markdown',agent)
 if(privateId)for(const [path,type] of [[`/works/${privateId}`,'text/html'],[`/works/${privateId}.md`,'text/plain'],[`/api/public/works/${privateId}`,'application/json']])await read(path,404,type)
 console.log(JSON.stringify({ok:true,scope:'Anonymous real HTTP requests; representative User-Agent headers are not actual provider/IP tests.',results},null,2))
}catch(error){console.log(JSON.stringify({ok:false,error:error.message,results},null,2));process.exitCode=1}
