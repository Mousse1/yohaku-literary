import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowUpRight, ArrowRight, BookOpen, PenLine, GitCompareArrows, Search, ChevronDown, Plus, X, ShieldCheck, Flag, LogOut, Menu, Link as LinkIcon, Check, Eye, Clock, Trash2, History, FileClock, EyeOff, FolderTree, CornerDownRight } from 'lucide-react'
import { Turnstile } from '@marsidev/react-turnstile'
import { supabase, configured, categoryTree, categorySections, categoryOf, displayGenre, genreMatches, reportReasons, demoWorks, dateFmt, messageFor, safeUrl } from './client'
import RichBody from './RichBody'
import ParallelReader from './ParallelReader'
import DescendantReferences from './DescendantReferences'
import DescendantBodies from './DescendantBodies'
import { CommunityReferences, CommunityNoteForm, CommunityNoteList } from './CommunityContributions'
import MyWorkLibrary from './MyWorkLibrary'
import ReaderErrorBoundary, { ReaderPartBoundary } from './ReaderErrorBoundary'
import './style.css'

const routeNames = ['explore','submit','revise','compare','parallel','about','mine','admin','rules','privacy','terms']
// Public, permanent, human-readable per-work URLs. Never use an array index or title as ID.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const getWorkIdFromPath = () => {
  const m = location.pathname.match(/^\/works\/([^/]+)\/?$/)
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return null }
}
const makeWorkUrl = id => new URL(`/works/${encodeURIComponent(id)}`, location.origin).href
const getRoute = () => getWorkIdFromPath() !== null
  ? 'work' : routeNames.includes(location.hash.substring(1)) ? location.hash.substring(1) : 'explore'
const PUBLIC_WORK_STATUSES = ['published','open']
const isPublicWork = work => Boolean(work && PUBLIC_WORK_STATUSES.includes(work.status))
const PublicationLabel = ({status}) => isPublicWork({status}) ? <span className={'publication-label '+(status==='published'?'reviewed':'unreviewed')}>{status==='published'?'審査済み公開':'自由公開・未審査'}</span> : null
const statusText = { draft:'下書き', pending:'審査待ち', published:'審査済み公開', open:'自由公開（未審査）', rejected:'差し戻し', hidden:'非公開', approved:'承認済み', canceled:'取り消し' }
const requestText = {hide:'公開停止',delete:'削除'}
const safeStoredSize = (key, fallback, min, max) => {
  try { const v=Number(localStorage.getItem(key)); return Number.isFinite(v)&&v>=min&&v<=max ? v : fallback } catch { return fallback }
}
const emptyWork = {parent_work_id:null,order_index:0,node_kind:'work',pen_name:'',contributor_credit:'',title:'',section:'文学',genre:'純文学',theme:'',summary:'',body:'',question:'',inheritance:'',novelty:'',work_references:[]}
const contact = import.meta.env.VITE_CONTACT_EMAIL?.trim() || ''
const operator = import.meta.env.VITE_OPERATOR_NAME?.trim() || '（運営者名は公開前に設定）'
const turnstileKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim()

// Organize works without merging their bodies. Each entry keeps its own 200,000-character limit.
const siblingSort = (a,b) => (a.order_index??0)-(b.order_index??0) || String(a.created_at||'').localeCompare(String(b.created_at||'')) || String(a.title||'').localeCompare(String(b.title||''))
const treeOptions = (items, excludeId=null) => {
  const map = new Map(items.map(x=>[x.id,x])), result=[], visited = new Set()
  const visit = (w,depth) => {
    if(visited.has(w.id) || depth>12 || w.id===excludeId)return
    visited.add(w.id)
    const chain=[]; const seenParents=new Set(); let item=w
    while(item && !seenParents.has(item.id)){chain.unshift(item.title);seenParents.add(item.id);item=map.get(item.parent_work_id)}
    result.push({work:w,depth,path:chain.join(' › ')})
    items.filter(x=>x.parent_work_id===w.id).sort(siblingSort).forEach(x=>visit(x,depth+1))
  }
  items.filter(x=>!x.parent_work_id||!map.has(x.parent_work_id)).sort(siblingSort).forEach(x=>visit(x,0))
  items.filter(x=>!visited.has(x.id)).sort(siblingSort).forEach(x=>visit(x,0))
  if (!excludeId)return result
  // A work cannot be moved into itself or one of its descendants.
  const isDescendant = (w) => {
    let cursor=w;const seen=new Set()
    while(cursor?.parent_work_id && !seen.has(cursor.id)){
      if(cursor.parent_work_id===excludeId)return true
      seen.add(cursor.id);cursor=map.get(cursor.parent_work_id)
    }
    return false
  }
  return result.filter(({work})=>work.id!==excludeId && !isDescendant(work))
}
function ChildTree({parentId,nodes,onSelect,depth=0}){
  if(depth>=12)return null
  const children=nodes.filter(w=>w.parent_work_id===parentId).sort(siblingSort)
  if(!children.length)return null
  return <ul className={depth===0?'child-tree':'child-tree nested'}>{children.map(w=><li key={w.id}><button type="button" onClick={()=>onSelect(w.id)}>{w.node_kind==='collection'?<FolderTree size={14}/>:<CornerDownRight size={14}/>}<span>{w.title}</span>{w.status==='open'&&<span className="tree-review-mark">未審査</span>}</button><ChildTree parentId={w.id} nodes={nodes} onSelect={onSelect} depth={depth+1}/></li>)}</ul>
}

function App(){
  const [route,setRoute] = useState(getRoute)
  const [pathWorkId,setPathWorkId] = useState(getWorkIdFromPath)
  const [workLoadState,setWorkLoadState] = useState('loading')
  const [session,setSession] = useState(null)
  const [authReady,setAuthReady] = useState(!configured)
  const [isMod,setMod] = useState(false)
  const [works,setWorks] = useState(configured?[]:demoWorks.filter(w=>!w.parent_work_id))
  const [mine,setMine] = useState([])
  const [creationParent,setCreationParent] = useState(null)
  const [creationKind,setCreationKind] = useState('work')
  const [treeIndex,setTreeIndex] = useState([])
  const [myRevisions,setMyRevisions] = useState([])
  const [myRequests,setMyRequests] = useState([])
  const [revisions,setRevisions] = useState([])
  const [revisionEditing,setRevisionEditing] = useState(null)
  const [more,setMore] = useState(false)
  const [page,setPage] = useState(0)
  const [filter,setFilter] = useState('すべて')
  const [fieldFilter,setFieldFilter] = useState('すべて')
  const [reviewFilter,setReviewFilter] = useState('すべて')
  const [query,setQuery] = useState('')
  const [selected,setSelected] = useState(null)
  const [notes,setNotes] = useState([])
  const [parallelSeed,setParallelSeed] = useState([])
  const [compareA,setCompareA] = useState('')
  const [compareB,setCompareB] = useState('')
  const [editing,setEditing] = useState(null)
  const [authOpen,setAuthOpen] = useState(false)
  const [recovery,setRecovery] = useState(false)
  const [notice,setNotice] = useState('')
  const [loading,setLoading] = useState(false)
  const [adminData,setAdminData] = useState({works:[],openWorks:[],notes:[],communityRefs:[],reports:[],revisions:[],requests:[]})
  const [mobileMenu,setMobileMenu] = useState(false)
  const user = session?.user

  const flash = msg => { setNotice(msg); window.scrollTo({top:0,behavior:'smooth'}) }
  const navigate = next => {
    setSelected(null);setMobileMenu(false);setPathWorkId(null)
    // Leaving a /works/:id page must reset its pathname as well as its hash.
    if (getWorkIdFromPath() !== null) window.history.pushState(null,'',`/#${next}`)
    else location.hash=next
    setRoute(next);window.scrollTo({top:0,behavior:'instant'})
  }
  useEffect(()=>{
    const fn=()=>{
      const next=getRoute(), id=getWorkIdFromPath()
      setRoute(next);setPathWorkId(id)
      setSelected(prev=>next==='work'&&prev?.id===id?prev:null)
      window.scrollTo({top:0})
    }
    window.addEventListener('hashchange',fn)
    window.addEventListener('popstate',fn)
    return()=>{window.removeEventListener('hashchange',fn);window.removeEventListener('popstate',fn)}
  },[])
  useEffect(()=>{if(!configured)return;supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthReady(true)});const {data:{subscription}}=supabase.auth.onAuthStateChange((event,next)=>{setSession(next);if(event==='PASSWORD_RECOVERY'){setRecovery(true);setAuthOpen(true)}});return()=>subscription.unsubscribe()},[])
  const loadPublished = useCallback(async (p=0,append=false)=>{
    if(!configured) return
    const {data,error}=await supabase.from('works').select('*, work_references(*)').in('status',PUBLIC_WORK_STATUSES).is('parent_work_id',null).order('created_at',{ascending:false}).range(p*18,p*18+17)
    if(error){setNotice(`作品を取得できませんでした: ${messageFor(error)}`);return}
    setWorks(old=>append?[...old,...(data||[]).filter(w=>!old.some(v=>v.id===w.id))]:data||[])
    setPage(p);setMore((data||[]).length===18)
  },[])
  const loadTree = useCallback(async ()=>{
    if(!configured){setTreeIndex(demoWorks);return}
    const collected=[]
    for(let start=0;start<10000;start+=1000){
      const {data,error}=await supabase.from('works').select('id,title,parent_work_id,order_index,node_kind,status,created_at').in('status',PUBLIC_WORK_STATUSES).order('id',{ascending:true}).range(start,start+999)
      if(error){setNotice(`階層目次を取得できませんでした: ${messageFor(error)}`);return}
      collected.push(...(data||[]))
      if((data||[]).length<1000)break
    }
    setTreeIndex(collected)
  },[])
  const loadMine = useCallback(async ()=>{
    if(!configured||!user){setMine([]);setMyRevisions([]);setMyRequests([]);return}
    const [w,v,r]=await Promise.all([
      supabase.from('works').select('*,work_references(*)').eq('author_id',user.id).order('created_at',{ascending:false}).limit(1000),
      supabase.from('work_revisions').select('*').eq('author_id',user.id).in('status',['draft','pending','rejected']).order('updated_at',{ascending:false}).limit(100),
      supabase.from('publication_requests').select('*').eq('author_id',user.id).order('created_at',{ascending:false}).limit(100)
    ])
    if(w.error||v.error||r.error){setNotice('自分の作品を取得できません。Supabaseの改訂機能用SQLが反映されているか確認してください。');return}
    setMine(w.data||[]);setMyRevisions(v.data||[]);setMyRequests(r.data||[])
  },[user?.id])
  const checkMod = useCallback(async ()=>{
    if(!configured||!user){setMod(false);return}
    const {data,error}=await supabase.from('moderators').select('user_id').eq('user_id',user.id).maybeSingle()
    setMod(!error&&Boolean(data))
  },[user?.id])
  useEffect(()=>{loadPublished();loadTree()},[loadPublished,loadTree])
  useEffect(()=>{loadMine();checkMod()},[loadMine,checkMod])
  const loadAdmin = useCallback(async ()=>{
    if(!isMod)return
    const [w,o,n,c,r,v,q]=await Promise.all([
      supabase.from('works').select('id,title,pen_name,contributor_credit,section,genre,status,created_at').in('status',['pending','rejected','hidden']).order('created_at',{ascending:false}).limit(100),
      supabase.from('works').select('id,title,pen_name,status,created_at').eq('status','open').order('created_at',{ascending:false}).limit(100),
      supabase.from('notes').select('id,work_id,pen_name,type,body,status,created_at').eq('status','pending').order('created_at',{ascending:true}).limit(100),
      supabase.from('community_references').select('id,work_id,pen_name,title,explanation,url,status,created_at').eq('status','pending').order('created_at',{ascending:true}).limit(100),
      supabase.from('reports').select('id,work_id,reason,detail,resolved,created_at').eq('resolved',false).order('created_at',{ascending:true}).limit(100),
      supabase.from('work_revisions').select('*,works(title,pen_name,current_version)').eq('status','pending').order('created_at',{ascending:true}).limit(100),
      supabase.from('publication_requests').select('*,works(title,pen_name)').eq('status','pending').order('created_at',{ascending:true}).limit(100)
    ])
    if(w.error||o.error||n.error||c.error||r.error||v.error||q.error){flash('管理データを取得できませんでした。v6.8文献提案用SQLと権限を確認してください。');console.error('管理データ取得エラー',{works:w.error,openWorks:o.error,notes:n.error,communityRefs:c.error,reports:r.error,revisions:v.error,requests:q.error});return}
    setAdminData({works:w.data||[],openWorks:o.data||[],notes:n.data||[],communityRefs:c.data||[],reports:r.data||[],revisions:v.data||[],requests:q.data||[]})
  },[isMod])
  useEffect(()=>{if(route==='admin')loadAdmin()},[route,loadAdmin])
  const loadWorkExtras = async (workId, valid=()=>true) => {
    if(!configured)return
    const [n,v]=await Promise.all([
      supabase.from('notes').select('*').eq('work_id',workId).order('created_at',{ascending:false}).limit(100),
      supabase.from('work_revisions').select('*').eq('work_id',workId).order('created_at',{ascending:false}).limit(100)
    ])
    if(!valid())return
    if(!n.error)setNotes(n.data||[])
    if(!v.error)setRevisions(v.data||[])
  }
  const openWork = async work => {
    setSelected(work);setNotes([]);setRevisions([])
    if(configured&&isPublicWork(work)&&uuidPattern.test(work.id)){
      window.history.pushState({workId:work.id},'',makeWorkUrl(work.id))
      setPathWorkId(work.id);setRoute('work')
      window.scrollTo({top:0})
      // Direct-link effect reloads the authoritative approved version from the DB.
    }else await loadWorkExtras(work.id)
  }
  // Direct loading works even if this work was never in the first page of listings.
  // Non-published works must NEVER be returned to anonymous users.
  useEffect(()=>{
    if(route!=='work'||pathWorkId===null)return
    let active=true
    setWorkLoadState('loading')
    setNotes([]);setRevisions([])
    if(!configured||!uuidPattern.test(pathWorkId)){
      setSelected(null);setWorkLoadState('notfound');return()=>{active=false}
    }
    ;(async()=>{
      try {
        const {data,error}=await supabase.from('works')
          .select('*,work_references(*)')
          .eq('id',pathWorkId).in('status',PUBLIC_WORK_STATUSES).maybeSingle()
        if(!active)return
        if(error||!data){setSelected(null);setWorkLoadState('notfound');return}
        setSelected(data);setWorkLoadState('ready')
        await loadWorkExtras(data.id,()=>active)
      } catch(err) {
        if(active){console.error('作品読み込みエラー',err);setSelected(null);setWorkLoadState('error')}
      }
    })()
    return()=>{active=false}
  },[route,pathWorkId])
  useEffect(()=>{
    const isPublicPage=route==='work'&&isPublicWork(selected)&&selected?.id===pathWorkId
    const original='余白。 — 文学の新しさを、読み比べる。'
    document.title=isPublicPage?`${selected.title} — ${selected.pen_name} | 余白。`:original
    const description=document.querySelector('meta[name="description"]')
    if(description)description.setAttribute('content',isPublicPage?String(selected.summary||'').slice(0,160):'文学・哲学・評論・科学の投稿と批評。原著者と入力・構成のクレジット、数式と参考文献に対応。')
    let canonical=document.querySelector('link[rel="canonical"]')
    if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical)}
    canonical.href=isPublicPage?makeWorkUrl(selected.id):location.origin+'/'
  },[route,pathWorkId,selected])
  const openWorkId = id => {
    if(!configured){
      const item=demoWorks.find(w=>w.id===id)
      if(item){setSelected(item);setNotes([]);setRevisions([])}
      return
    }
    if(!uuidPattern.test(id))return
    window.history.pushState(null,'',makeWorkUrl(id))
    setSelected(null);setPathWorkId(id);setRoute('work');window.scrollTo({top:0})
  }
  const createChild = (parent,kind='work') => {
    setEditing(null);setCreationParent(parent);setCreationKind(kind);navigate('submit')
  }
  const parallelWork = (work,kind='body') => {
    if(!isPublicWork(work)) {flash('並列表示には公開作品を選んでください。');return}
    setParallelSeed([{workId:work.id,kind:'body'},{workId:work.id,kind}]);navigate('parallel')
  }
  const compareWork = work => {setCompareA(work.id);let alternate=works.find(w=>w.id!==work.id);if(alternate)setCompareB(alternate.id);navigate('compare')}
  const publishOperation = async (table,id,changes)=>{
    setLoading(true)
    const {error}=await supabase.from(table).update(changes).eq('id',id)
    setLoading(false)
    if(error)flash(messageFor(error));else{flash('管理操作を保存しました。');await loadAdmin();await loadPublished();await loadTree();await loadMine()}
  }
  const deleteWork = async work => {
    if(!confirm(`「${work.title}」を削除します。復元できません。続けますか？`))return
    setLoading(true);const {error}=await supabase.from('works').delete().eq('id',work.id)
    setLoading(false)
    if(error)flash(messageFor(error));else{setSelected(null);setEditing(null);flash('作品を削除しました。');await loadMine();await loadPublished();await loadTree()}
  }
  const editPublished = work => {
    const active=myRevisions.find(v=>v.work_id===work.id)
    setRevisionEditing({work,revision:active||null})
    navigate('revise')
  }
  const saveRevision = async payload => {
    setLoading(true)
    const {error}=await supabase.rpc('save_revision',{
      p_work_id:revisionEditing.work.id,
      p_snapshot:{pen_name:payload.p_pen_name,contributor_credit:payload.p_contributor_credit,section:payload.p_section,title:payload.p_title,genre:payload.p_genre,
        theme:payload.p_theme,summary:payload.p_summary,body:payload.p_body,
        question:payload.p_question,inheritance:payload.p_inheritance,novelty:payload.p_novelty,
        parent_work_id:payload.p_parent_work_id,order_index:payload.p_order_index,node_kind:payload.p_node_kind},
      p_references:payload.p_references,p_status:payload.p_status,p_change_note:payload.p_change_note||''
    })
    setLoading(false)
    if(error){flash(messageFor(error));return false}
    setRevisionEditing(null);await loadMine()
    flash(payload.p_status==='draft'?'改訂案を下書き保存しました。':'公開中の旧版を維持したまま、改訂案を審査へ提出しました。')
    navigate('mine');return true
  }
  const requestAction = async (work,action) => {
    const label=requestText[action]
    const reason=prompt(`「${work.title}」の${label}を申請します。理由（任意・1000字以内）を入力してください。\n※管理者の承認までは現在の公開状態が続きます。`,'')
    if(reason===null)return
    if(reason.length>1000){flash('理由は1000文字以内にしてください。');return}
    if(!confirm(`「${work.title}」の${label}申請を送信しますか？`))return
    setLoading(true)
    const {error}=await supabase.rpc('request_publication_action',{p_work_id:work.id,p_action:action,p_reason:reason})
    setLoading(false)
    if(error)flash(messageFor(error));else{flash(`${label}申請を送信しました。管理者の対応までは公開状態が変わりません。`);await loadMine()}
  }
  const cancelRequest = async item => {
    if(!confirm('この申請を取り消しますか？'))return
    setLoading(true)
    const {error}=await supabase.rpc('cancel_publication_request',{p_request_id:item.id})
    setLoading(false)
    if(error)flash(messageFor(error));else{flash('申請を取り消しました。');await loadMine()}
  }
  const reviewRevision = async (item,action) => {
    const note=action==='approve'?'':prompt('差し戻し理由（投稿者に表示）を入力してください。','')
    if(note===null)return
    if(note.length>1000){flash('コメントは1000文字以内にしてください。');return}
    if(action==='approve'&&!confirm('公開版を新版に差し替えます。続けますか？'))return
    setLoading(true)
    const {error}=await supabase.rpc('review_revision',{p_revision_id:item.id,p_action:action,p_review_note:note})
    setLoading(false)
    if(error)flash(messageFor(error));else{setSelected(null);flash(action==='approve'?'新版を公開しました。旧版は改訂履歴に残ります。':'改訂案を差し戻しました。');await loadAdmin();await loadMine();await loadPublished();await loadTree()}
  }
  const reviewRequest = async (item,action) => {
    const label=requestText[item.action]
    const note=prompt(`${label}申請を${action==='approve'?'承認':'却下'}します。コメント（任意）を入力してください。`,'')
    if(note===null)return
    if(note.length>1000){flash('コメントは1000文字以内にしてください。');return}
    if(action==='approve'&&!confirm(item.action==='delete'?'本当に作品と改訂履歴・注釈を完全削除しますか？復元できません。':'この作品を非公開にしますか？'))return
    setLoading(true)
    const {error}=await supabase.rpc('review_publication_request',{p_request_id:item.id,p_action:action,p_review_note:note})
    setLoading(false)
    if(error)flash(messageFor(error));else{setSelected(null);flash(`${label}申請を処理しました。`);await loadAdmin();await loadMine();await loadPublished();await loadTree()}
  }
  const navItems=[['explore','作品を探す'],['parallel','並べて読む'],['compare','作品を比較'],['about','サイトについて']]
  const visible = works.filter(w=>(reviewFilter==='すべて'||(reviewFilter==='審査済み'&&w.status==='published')||(reviewFilter==='自由公開'&&w.status==='open'))&&(fieldFilter==='すべて'||categoryOf(w)===fieldFilter)&&(filter==='すべて'||genreMatches(w.genre,filter))&&[w.title,w.pen_name,w.contributor_credit,w.section,w.genre,w.summary,w.theme,w.novelty,...(w.work_references||[]).map(r=>r.title)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const left = works.find(w=>w.id===compareA)||works[0]
  const right = works.find(w=>w.id===compareB)||works.find(w=>w.id!==left?.id)

  const workDialog = selected && <ReaderErrorBoundary key={selected.id} resetKey={selected.id} work={selected} treeNodes={treeIndex} onBack={()=>navigate('explore')}><WorkDialog key={selected.id} asPage={route==='work'} work={selected} user={user} notes={notes} revisions={revisions} onClose={()=>route==='work'?navigate('explore'):setSelected(null)} onCompare={()=>compareWork(selected)} onParallel={()=>parallelWork(selected)} onLogin={()=>setAuthOpen(true)} onReload={()=>loadWorkExtras(selected.id)} flash={flash} onEdit={()=>{setEditing(selected);navigate('submit')}} onRevise={()=>editPublished(selected)} onRequest={action=>requestAction(selected,action)} onDelete={()=>deleteWork(selected)} treeNodes={treeIndex} onOpenTreeWork={openWorkId} onCreateChild={kind=>createChild(selected,kind)}/></ReaderErrorBoundary>

  return <>
    <header className="header"><div className="container header-inner">
      <button className="brand" onClick={()=>navigate('explore')} aria-label="余白。 トップページ"><span className="brand-mark">余白。</span><span className="brand-sub">文学の新しさを、読み比べる。</span></button>
      <nav className={'nav '+(mobileMenu?'show':'')} aria-label="メインナビゲーション">{navItems.map(([key,label])=><button key={key} className={'nav-link '+(route===key?'active':'')} onClick={()=>navigate(key)}>{label}</button>)}
      {user&&<button className={'nav-link '+(route==='mine'?'active':'')} onClick={()=>navigate('mine')}>自分の作品</button>}
      {isMod&&<button className={'nav-link '+(route==='admin'?'active':'')} onClick={()=>navigate('admin')}>管理・審査</button>}
      <button className="button primary nav-post" onClick={()=>{setEditing(null);setCreationParent(null);setCreationKind('work');navigate('submit')}}><PenLine size={15}/> 作品を投稿</button>
      {configured&&<button className="button tiny-button" onClick={()=>user?supabase.auth.signOut():setAuthOpen(true)}>{user?<><LogOut size={14}/>ログアウト</>:<>ログイン</>}</button>}
      </nav><button className="mobile-toggle" onClick={()=>setMobileMenu(x=>!x)} aria-label="メニューを開閉" aria-expanded={mobileMenu}><Menu/></button>
    </div></header>
    {!configured&&<div className="demo-banner"><div className="container"><strong>プレビュー表示</strong>　Supabase未接続のため、架空のサンプル作品を表示しています。公開投稿機能は設定後に有効になります。</div></div>}
    {notice&&<div className="container notice" role="status"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="閉じる"><X size={15}/></button></div>}
    {route==='explore'&&<>
      <section id="works" className="container section home-library"><div className="section-heading"><h1 className="serif home-library-title">作品を探す</h1><p>表示中の {works.length} 作品から検索</p></div>
      <div className="search"><Search size={18} color="#8a8478"/><input value={query} onChange={e=>setQuery(e.target.value)} aria-label="作品検索"/>{query&&<button onClick={()=>setQuery('')} aria-label="検索を消去"><X size={16}/></button>}</div>
      <div className="review-filter" role="group" aria-label="公開種別で絞り込む">
        {['すべて','審査済み','自由公開'].map(mode=><button type="button" key={mode} className={'chip '+(reviewFilter===mode?'active':'')} aria-pressed={reviewFilter===mode} onClick={()=>setReviewFilter(mode)}>{mode==='自由公開'?'自由公開・未審査':mode==='審査済み'?'審査済み公開':'すべての公開作品'}</button>)}
      </div>
      <div className="classification-filter" aria-label="分野・小分類で絞り込む">
        <div className="classification-label">分野を選ぶ</div>
        <div className="chips category-major" role="group" aria-label="分野">
          {['すべて',...categorySections].map(section=><button key={section} onClick={()=>{setFieldFilter(section);setFilter('すべて')}} className={'chip '+(fieldFilter===section?'active':'')} aria-pressed={fieldFilter===section}>{section}</button>)}
        </div>
        {fieldFilter!=='すべて'&&fieldFilter!=='その他'&&<><div className="classification-label">{fieldFilter}の小分類</div>
          <div className="chips category-minor" role="group" aria-label={`${fieldFilter}の小分類`}>
            {['すべて',...categoryTree[fieldFilter]].map(genre=><button key={genre} onClick={()=>setFilter(genre)} className={'chip '+(filter===genre?'active':'')} aria-pressed={filter===genre}>{genre}</button>)}
          </div></>}
      </div>
      {visible.length?<div className="works-grid">{visible.map(w=><WorkCard key={w.id} work={w} onRead={()=>openWork(w)} onCompare={()=>compareWork(w)} onParallel={()=>parallelWork(w)} demo={!configured} treeNodes={treeIndex} onOpenTreeWork={openWorkId}/>)}</div>:<div className="empty">条件に一致する作品がありません。検索語を変更してください。</div>}
      {more&&<div className="center pad"><button className="button light" disabled={loading} onClick={()=>loadPublished(page+1,true)}>さらに作品を読む <ChevronDown size={15}/></button></div>}
      <p className="hint" style={{marginTop:18}}>作品一覧には最上位の作品を表示し、章・節は各作品の目次から読めます。検索は現在読み込まれている作品を対象とします。過去の分類は各分野の「すべて」に残ります。新着作品は「さらに作品を読む」で追加できます。</p>
      </section>
    </>}
    {route==='work'&&(selected?.id===pathWorkId?workDialog:<main className="container reader-route" aria-live="polite">
      <div className="reader-route-message"><div className="eyebrow">READ / WORK</div>{workLoadState==='loading'?<p>作品を読み込んでいます…</p>:<><h1 className="serif">作品を表示できません</h1><p>作品が見つからないか非公開です。通信エラーの場合は再読み込みしてください。</p><button className="button light" onClick={()=>navigate('explore')}>作品一覧に戻る</button></>}</div>
    </main>)}
    {route==='parallel'&&<ParallelReader initialPanes={parallelSeed} publishedWorks={works} publishedIndex={treeIndex} user={user} onLogin={()=>setAuthOpen(true)} onExit={()=>navigate('explore')} onOpenSingle={openWorkId}/>}
    {route==='compare'&&<main className="container page"><div className="eyebrow">READ / COMPARE</div><h1 className="serif page-title">二つの作品を、読み比べる。</h1><p className="page-lead">投稿者が登録した「問い」「継承」「試み」「参考文献」を並べます。文学的価値や独創性を機械的に採点するものではありません。</p>
      {works.length<2?<div className="empty">公開作品がまだ二つありません。</div>:<><div className="dual-controls"><label>作品 A<select value={left?.id||''} onChange={e=>setCompareA(e.target.value)}>{works.map(w=><option key={w.id} value={w.id}>{w.title} — {w.pen_name}{w.status==='open'?'（自由公開）':''}</option>)}</select></label><label>作品 B<select value={right?.id||''} onChange={e=>setCompareB(e.target.value)}>{works.map(w=><option key={w.id} value={w.id}>{w.title} — {w.pen_name}{w.status==='open'?'（自由公開）':''}</option>)}</select></label></div>
      {left?.id===right?.id&&<p className="caution">異なる作品を選ぶことをおすすめします。</p>}
      <div className="comparison"><div className="comparison-head">比較の視点</div><div className="comparison-head">{left.title}<small>作者：{left.pen_name}{left.contributor_credit&&<> · 入力／構成：{left.contributor_credit}</>}</small></div><div className="comparison-head">{right.title}<small>作者：{right.pen_name}{right.contributor_credit&&<> · 入力／構成：{right.contributor_credit}</>}</small></div>
      {[['作品の主題','theme'],['作品の問い','question'],['継承するもの','inheritance'],['新しく試みること','novelty']].map(([label,key])=><React.Fragment key={key}><div className="comparison-label">{label}</div><div>{left[key]||'—'}</div><div>{right[key]||'—'}</div></React.Fragment>)}
      <div className="comparison-label">参考文献・関連作品</div><div>{left.work_references?.length?left.work_references.map(r=><div key={r.id} className="comp-ref">{r.title}</div>):'—'}</div><div>{right.work_references?.length?right.work_references.map(r=><div key={r.id} className="comp-ref">{r.title}</div>):'—'}</div></div></>}
    </main>}
    {route==='submit'&&<main className="container page"><div className="eyebrow">WRITE / SUBMIT</div><h1 className="serif page-title">作品・グループを投稿する。</h1><p className="page-lead">作品を執筆するか、本文を持たないグループを作成できます。グループの入れ子は最大12段です。審査付き公開と、審査を待たない自由公開を選べます。</p>
      {!configured?<div className="empty">プレビューでは投稿できません。<code>.env</code> とSupabaseの設定後に有効になります。</div>:!authReady?<div className="empty">認証状態を確認しています。</div>:!user?<div className="empty"><p>作品の投稿にはアカウントが必要です。</p><button className="button primary" onClick={()=>setAuthOpen(true)}>ログイン・新規登録</button></div>:<WorkForm key={(editing?.id||creationParent?.id||'new')+'-'+creationKind} initial={editing} initialParent={creationParent} initialKind={creationKind} parentOptions={treeOptions(mine,editing?.id)} user={user} onSubmit={async payload=>{
        setLoading(true);const {error}=await supabase.rpc('save_work_v6',payload);setLoading(false)
        if(error){flash(messageFor(error));return false}
        setEditing(null);setCreationParent(null);await loadMine();await loadPublished();await loadTree();flash(payload.p_status==='draft'?'下書きを保存しました。':payload.p_status==='open'?'自由公開として掲載しました（未審査）。':'審査待ちとして投稿しました。承認後に一般公開されます。');navigate('mine');return true
      }} disabled={loading} onCancel={()=>{setEditing(null);setCreationParent(null);navigate('mine')}}/>}
    </main>}
    {route==='revise'&&<main className="container page"><div className="eyebrow">REVISE / SUBMIT</div><h1 className="serif page-title">改訂版を提出する。</h1><p className="page-lead">旧版はそのまま一般公開されます。改訂案が承認されたときのみ、表示中の本文・参考文献が新版に切り替わります。旧版は読者が参照できる履歴として残ります。</p>
      {!user||!revisionEditing?<div className="empty">「自分の作品」から改訂したい公開済み作品を選んでください。</div>:
      <WorkForm key={revisionEditing.work.id} parentOptions={treeOptions(mine,revisionEditing.work.id)} initial={{...revisionEditing.work,...(revisionEditing.revision?.snapshot||{}),work_references:revisionEditing.revision?.refs||revisionEditing.work.work_references}} revisionMode initialChangeNote={revisionEditing.revision?.change_note||''} onSubmit={saveRevision} disabled={loading} onCancel={()=>{setRevisionEditing(null);navigate('mine')}}/>}
    </main>}
    {route==='mine'&&<main className="container page"><div className="eyebrow">MY LIBRARY</div><h1 className="serif page-title">自分の作品</h1><p className="page-lead">審査済み作品は「改訂版を書く」から新版を提出します。自由公開作品は自分で編集・削除できます。承認までは旧版を公開し続け、承認済みの版は履歴に保存されます。公開停止・削除は管理者への申請制です。</p><div className="section-heading"><p>{mine.length} 作品</p><div className="group-actions"><button className="button light" onClick={()=>{setEditing(null);setCreationParent(null);setCreationKind('collection');navigate('submit')}}><FolderTree size={16}/> 最上位グループを作成</button><button className="button primary" onClick={()=>{setEditing(null);setCreationParent(null);setCreationKind('work');navigate('submit')}}><Plus size={16}/>新しい作品を書く</button></div></div>
      {!mine.length ? <div className="empty">まだ投稿作品がありません。</div> : <MyWorkLibrary
        works={mine} revisions={myRevisions} requests={myRequests} busy={loading}
        onRead={openWork} onCreateChild={createChild}
        onEdit={w=>{setEditing(w);navigate('submit')}} onDelete={deleteWork}
        onRevise={editPublished} onRequest={requestAction} onCancelRequest={cancelRequest}
      />}

    </main>}
    {route==='about'&&<main className="container page prose-page"><div className="eyebrow">ABOUT THIS PLACE</div><h1 className="serif page-title">新しい文学に、文脈を。</h1><p className="large-lead serif">作品を孤立した一冊としてではなく、過去の文学と未来の読者につながる問いとして読む。</p><h2>何を目指しているのか</h2><p>「余白。」は、小説・評論・映画・ノベルゲーム・科学記事の投稿・比較・批評の場です。作品本文、投稿者が提示する新規性の仮説、参考文献、読者の批評を同じ場所に置くことで、作品の可能性を議論できるようにします。原著者と入力／構成の担当者も区別して記録できます。</p><h2>独創性を点数化しない</h2><p>ある作品が先行作品と似ていることは、価値がないことを意味しません。伝統の継承、技法の転用、思想の変形など、多面的に比較することを重視します。作者の説明は自己申告であり、運営が真実と認定したものではありません。</p><h2>投稿の審査について</h2><p>投稿者は作品を自由公開するか審査へ提出するか選べます。注釈・文献提案は公開前に審査します。審査は法令・権利・利用規約などに関する運営上の確認であって、文学的価値の保証ではありません。</p><button className="button light" onClick={()=>navigate('rules')}>投稿ガイドラインを読む <ArrowUpRight size={15}/></button></main>}
    {route==='admin'&&<main className="container page"><div className="eyebrow">MODERATION</div><h1 className="serif page-title">管理・審査</h1>{!isMod?<div className="empty">管理権限がありません。</div>:<><div className="admin-row"><h2>作品の審査 <span>{adminData.works.length}</span></h2>{adminData.works.map(w=><div className="moderation-item" key={w.id}><div><strong>{w.title}</strong><small>作者：{w.pen_name}{w.contributor_credit&&` · 入力／構成：${w.contributor_credit}`} · {statusText[w.status]} · {dateFmt(w.created_at)}</small></div><div className="buttons"><button className="button light small" onClick={async()=>{const {data}=await supabase.from('works').select('*,work_references(*)').eq('id',w.id).single();if(data)openWork(data)}}>本文を見る</button><button className="button primary small" disabled={loading} onClick={()=>publishOperation('works',w.id,{status:'published'})}>承認</button><button className="button light small" disabled={loading} onClick={()=>publishOperation('works',w.id,{status:'rejected'})}>差し戻す</button><button className="button ghost-danger small" disabled={loading} onClick={()=>publishOperation('works',w.id,{status:'hidden'})}>非公開にする</button></div></div>)}</div>
      <div className="admin-row"><h2>自由公開（未審査）<span>{adminData.openWorks.length}</span></h2><p className="hint">自由公開の作品は審査を経ずに掲載されています。審査済み表示に切り替える場合は、実際に本文を確認してから操作してください。</p>{adminData.openWorks.map(w=><div className="moderation-item" key={w.id}><div><strong>{w.title}</strong><small>{dateFmt(w.created_at)} · 未審査公開</small></div><div className="buttons"><button className="button light small" onClick={()=>openWorkId(w.id)}>作品を確認</button><button className="button primary small" disabled={loading} onClick={()=>{if(confirm('本文・出典等を確認済みですか？審査済み公開へ切り替えます。'))publishOperation('works',w.id,{status:'published'})}}>審査済みにする</button><button className="button ghost-danger small" disabled={loading} onClick={()=>publishOperation('works',w.id,{status:'hidden'})}>非公開にする</button></div></div>)}</div>
      <div className="admin-row"><h2>改訂案の再審査 <span>{adminData.revisions.length}</span></h2>{!adminData.revisions.length&&<p className="muted">審査待ちの改訂案はありません。</p>}{adminData.revisions.map(v=><div className="moderation-item" key={v.id}><div><strong>{v.works?.title||'作品'} → {v.snapshot.title}</strong><small>現在 第{v.works?.current_version||1}版 · {dateFmt(v.created_at)}</small><p className="multiline">変更点：{v.change_note||'記載なし'}</p></div><div className="buttons"><button className="button light small" onClick={async()=>{const {data}=await supabase.from('works').select('*,work_references(*)').eq('id',v.work_id).single();if(data)openWork(data)}}>現行版を見る</button><button className="button light small" onClick={()=>openWork({...v.snapshot,id:v.work_id,author_id:v.author_id,work_references:v.refs,status:'pending'})}>改訂案を読む</button><button className="button primary small" disabled={loading} onClick={()=>reviewRevision(v,'approve')}>新版を承認</button><button className="button light small" disabled={loading} onClick={()=>reviewRevision(v,'reject')}>差し戻す</button></div></div>)}</div>
      <div className="admin-row"><h2>公開停止・削除申請 <span>{adminData.requests.length}</span></h2>{!adminData.requests.length&&<p className="muted">対応待ちの申請はありません。</p>}{adminData.requests.map(r=><div className="moderation-item" key={r.id}><div><strong>{r.works?.title||'作品'} · {requestText[r.action]}申請</strong><small>{r.works?.pen_name} · {dateFmt(r.created_at)}</small><p className="multiline">申請理由：{r.reason||'記載なし'}</p></div><div className="buttons"><button className="button primary small" disabled={loading} onClick={()=>reviewRequest(r,'approve')}>承認</button><button className="button light small" disabled={loading} onClick={()=>reviewRequest(r,'reject')}>却下</button></div></div>)}</div>
      <div className="admin-row"><h2>読者の注釈 <span>{adminData.notes.length}</span></h2>{adminData.notes.map(n=><div className="moderation-item" key={n.id}><div><strong>{n.type} / {n.pen_name}</strong><p className="multiline">{n.body}</p></div><div className="buttons"><button className="button primary small" disabled={loading} onClick={()=>publishOperation('notes',n.id,{status:'published'})}>承認</button><button className="button ghost-danger small" disabled={loading} onClick={()=>publishOperation('notes',n.id,{status:'hidden'})}>却下</button></div></div>)}</div>
      <div className="admin-row"><h2>第三者の参考文献・解説 <span>{adminData.communityRefs.length}</span></h2>
        {!adminData.communityRefs.length&&<p className="muted">審査待ちの文献提案はありません。</p>}
        {adminData.communityRefs.map(r=><div className="moderation-item" key={r.id}><div><strong>{r.title}</strong><small>提案者：{r.pen_name} · {dateFmt(r.created_at)}</small><p className="multiline">{r.explanation}</p>{safeUrl(r.url)&&<a href={safeUrl(r.url)} target="_blank" rel="noopener noreferrer">出典URLを見る <ArrowUpRight size={13}/></a>}<p><button type="button" className="text-action" onClick={()=>openWorkId(r.work_id)}>対象作品を見る</button></p></div><div className="buttons"><button className="button primary small" disabled={loading} onClick={()=>publishOperation('community_references',r.id,{status:'published'})}>承認して公開</button><button className="button light small" disabled={loading} onClick={()=>publishOperation('community_references',r.id,{status:'hidden'})}>却下</button></div></div>)}
      </div>
      <div className="admin-row"><h2>未処理の通報 <span>{adminData.reports.length}</span></h2>{adminData.reports.map(r=><div className="moderation-item" key={r.id}><div><strong>{r.reason}</strong><small>作品 ID: {r.work_id}</small><p className="multiline">{r.detail||'詳細なし'}</p></div><div className="buttons"><button className="button ghost-danger small" disabled={loading} onClick={()=>publishOperation('works',r.work_id,{status:'hidden'})}>作品を非公開</button><button className="button light small" disabled={loading} onClick={()=>publishOperation('reports',r.id,{resolved:true})}>対応済みにする</button></div></div>)}</div>
      <p className="hint">管理者の追加はデータベースのSQL Editorからのみ可能です。運営上の判断は利用規約と通報内容に照らして行ってください。</p></>}</main>}
    {route==='rules'&&<main className="container page prose-page"><div className="eyebrow">GUIDELINES</div><h1 className="serif page-title">投稿ガイドライン</h1><h2>作品の権利</h2><p>ご自身が権利を持つ文章、または適法な許諾を得た作品のみ投稿してください。自由公開にも同じルールが適用されます。参考文献を示すことと、他者の本文を転載する権利があることは別です。引用時は必要性・分量・出典を確認してください。</p><h2>新規性について</h2><p>新規性の説明は必須ではありません。「先行作品を知らない」と「先行作品が存在しない」は異なります。参考文献を載せたこと自体が、そこから直接影響を受けた証拠になるわけでもありません。</p><h2>表現と読者</h2><p>批評と異論を歓迎します。ただし個人への攻撃、嫌がらせ、差別的な扇動、個人情報の無断掲載、権利侵害、宣伝目的の大量投稿は禁止します。自殺・暴力などを扱う文学作品を一律排除するものではありませんが、具体的な危害を助長する投稿は制限する場合があります。</p><h2>審査</h2><p>作品は「審査付き公開」と「自由公開（未審査）」を選択できます。自由公開は事前審査なしで掲載され、表示上で区別されます。注釈と第三者の参考文献・解説は審査後に公開します。公開・差し戻し・非公開の判断は運営が行います。審査は作品の文学的価値を格付けするものではありません。</p></main>}
    {route==='privacy'&&<main className="container page prose-page"><div className="eyebrow">PRIVACY</div><h1 className="serif page-title">プライバシーポリシー（公開前要確認）</h1><p className="caution">この文章は公開準備用のひな型です。運営者、実際のデータの取扱い、委託先、保管場所、問い合わせ先を確認して確定してください。</p><h2>扱う情報</h2><p>登録メールアドレス、ログインに必要な認証情報、投稿した作品・筆名・参考文献・読者の文献提案・注釈・通報内容、アクセス時の技術的なログ等が処理されます。公開作品と公開注釈に登録した筆名・本文は、不特定多数が閲覧できます。</p><h2>利用目的</h2><p>認証、作品公開、審査、違反行為への対応、システムの運用・保護に利用します。認証にはSupabase、配信にはCloudflare Pagesを利用する想定です。各サービスの設定に応じた処理と保存が行われます。</p><h2>問い合わせ・削除</h2><p>投稿情報の修正・削除等については運営者へお問い合わせください。審査済み作品は運営への削除申請が必要です。自由公開作品は作者が直接編集・削除できます。{contact?<>連絡先：<a href={'mailto:'+contact}>{contact}</a></>:'連絡先：公開前に設定'}</p><p className="hint">運営者：{operator}</p></main>}
    {route==='terms'&&<main className="container page prose-page"><div className="eyebrow">TERMS OF USE</div><h1 className="serif page-title">利用規約（公開前要確認）</h1><p className="caution">一般公開前に運営者自身による確認と必要に応じた法的レビューが必要です。</p><h2>著作権と投稿許諾</h2><p>投稿作品の著作権は投稿者に帰属します。投稿者はサービス上での表示、保存、配信および運営に必要な範囲での処理を運営者に許諾するものとします。他者の権利を侵害する投稿はできません。</p><h2>審査・公開の判断</h2><p>運営は、ガイドライン違反、権利侵害のおそれ、運用上の問題等がある投稿について公開を見送り、非公開または削除することがあります。審査済みの表示は運営による掲載前の確認を示すもので、正確性・新規性・法的適合性を保証するものではありません。自由公開は運営の事前審査を受けていません。</p><h2>利用者の責任</h2><p>投稿内容の出典、事実、権利関係を確認してください。読者による批評は、その筆者の見解です。運営は不適切な利用や障害に対して必要な対応を行います。</p><h2>変更・連絡</h2><p>規約や運用に変更が生じる場合、サイト上で案内します。{contact?<>お問い合わせは <a href={'mailto:'+contact}>{contact}</a> へ。</>:'連絡先は公開前に設定します。'}</p></main>}
    <footer className="footer"><div className="container footer-inner"><div><strong className="serif footer-logo">余白。</strong><p>言葉を読み、文脈を辿り、異論を残す。</p></div><div className="footer-links"><button onClick={()=>navigate('rules')}>投稿ガイドライン</button><button onClick={()=>navigate('terms')}>利用規約</button><button onClick={()=>navigate('privacy')}>プライバシー</button>{contact&&<a href={'mailto:'+contact}>お問い合わせ</a>}</div></div><div className="container footer-note">© {new Date().getFullYear()} 余白。 — 作者の新規性の説明は仮説であり、運営による保証ではありません。</div></footer>
    {route!=='work'&&workDialog}
    {authOpen&&configured&&<AuthDialog isRecovery={recovery} onClose={()=>{setAuthOpen(false);setRecovery(false)}} onSuccess={msg=>{flash(msg);setAuthOpen(false)}}/>}
  </>
}

function WorkCard({work,onRead,onCompare,onParallel,demo,treeNodes=[],onOpenTreeWork}){return <article className="work-card"><div className="card-meta"><span className="pill">{categoryOf(work)} / {displayGenre(work.genre)}</span><PublicationLabel status={work.status}/>{demo&&<span className="pill green">架空のサンプル</span>}</div><h3 className="serif"><button type="button" className="work-title-link" onClick={onRead} aria-label={`${work.title}を読む`}>{work.title}</button></h3>{work.node_kind==='collection'&&<button type="button" className="pill group-read-link" onClick={onRead} title="このグループに収録された章・節を読む">グループ／目次 · 収録作品を読む</button>}<p className="byline">作者：{work.pen_name}{work.contributor_credit&&<> · 入力／構成：{work.contributor_credit}</>} · {work.theme||'主題未設定'}</p>{work.summary&&<p className="card-summary">{work.summary}</p>}{work.novelty&&<><div className="claim-label">{work.node_kind==='collection'?'このグループで試みること':'この投稿で試みること'}</div><p className="claim-text">{work.novelty}</p></>}<div className="card-bottom"><span>直接登録した参考文献 {work.work_references?.length||0} 件{work.node_kind==='collection'&&<small className="card-reference-tip"> ／ 下位作品分は開いて確認</small>}</span><div><button className="text-action" onClick={onCompare}>比較する <GitCompareArrows size={13}/></button><button className="text-action" onClick={onParallel}>並べて読む <BookOpen size={13}/></button>{!demo&&uuidPattern.test(work.id)?<a className="text-action" href={makeWorkUrl(work.id)} onClick={e=>{if(!e.defaultPrevented&&e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();onRead()}}}>読む <ArrowRight size={13}/></a>:<button className="text-action" onClick={onRead}>読む <ArrowRight size={13}/></button>}</div></div><ChildTree parentId={work.id} nodes={treeNodes} onSelect={onOpenTreeWork}/></article>}

function WorkDialog({asPage=false,work,user,notes,revisions,onClose,onCompare,onParallel,onLogin,onReload,flash,onEdit,onRevise,onRequest,onDelete,treeNodes=[],onOpenTreeWork,onCreateChild}){
  const [reportOpen,setReportOpen]=useState(false),[reason,setReason]=useState(reportReasons[0]),[detail,setDetail]=useState(''),[busy,setBusy]=useState(false)
  const [historyPreview,setHistoryPreview]=useState(null)
  const [readerSize,setReaderSize]=useState(()=>safeStoredSize('yohaku_reader_size',16,12,26))
  useEffect(()=>{try{localStorage.setItem('yohaku_reader_size',String(readerSize))}catch{}},[readerSize])
  const isOwn=Boolean(user?.id && work.author_id && user.id===work.author_id)
  const editable=isOwn&&['draft','pending','rejected','open'].includes(work.status)
  const doReport=async e=>{e.preventDefault();setBusy(true);let {error}=await supabase.from('reports').insert({work_id:work.id,reporter_id:user.id,reason,detail:detail.trim(),resolved:false});setBusy(false)
    if(error)flash(messageFor(error));else{setReportOpen(false);flash('通報を運営に送信しました。')}}
  const shareWork = async () => {
    const url=makeWorkUrl(work.id)
    try{
      if(navigator.share){await navigator.share({title:work.title,text:`${work.pen_name}『${work.title}』`,url});return}
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);flash('作品のURLをコピーしました。');return}
    }catch(e){if(e?.name==='AbortError')return}
    window.prompt('この作品のURLをコピーしてください',url)
  }
  useEffect(()=>{
    if(asPage)return
    const fn=e=>{if(e.key==='Escape')onClose()}
    window.addEventListener('keydown',fn)
    document.body.style.overflow='hidden'
    return()=>{window.removeEventListener('keydown',fn);document.body.style.overflow=''}
  },[asPage,onClose])
  return <div className={asPage?'standalone-reader':'overlay'} onMouseDown={e=>{if(!asPage&&e.target===e.currentTarget)onClose()}}><article className="dialog work-dialog" role={asPage?undefined:'dialog'} aria-modal={asPage?undefined:true} aria-labelledby="dialog-title"><button className="close" onClick={onClose} aria-label="閉じる"><X size={20}/></button><div className="eyebrow">READ / RELATE / RESPOND</div><h2 className="serif work-title" id="dialog-title">{work.title}</h2><div className="reader-publication"><PublicationLabel status={work.status}/>{work.status==='open'&&<span className="muted">この作品は運営の事前審査を受けていません。</span>}</div><div className="byline work-credits"><span>作者：<strong>{work.pen_name}</strong></span>{work.contributor_credit&&<span>入力／構成：<strong>{work.contributor_credit}</strong></span>}<span>分類：{categoryOf(work)} / {displayGenre(work.genre)}</span><span>主題：{work.theme||'未設定'}</span></div>{work.summary&&<p className="work-intro">{work.summary}</p>}
  {configured&&<nav className="work-breadcrumbs" aria-label="作品の階層"><button type="button" onClick={onClose}>作品一覧</button>{(()=>{
    const byId=new Map(treeNodes.map(n=>[n.id,n])), parents=[]
    let cursor=byId.get(work.parent_work_id),iterations=0
    while(cursor&&iterations++<12){parents.unshift(cursor);cursor=byId.get(cursor.parent_work_id)}
    return parents.map(p=><React.Fragment key={p.id}><span> › </span><button type="button" onClick={()=>onOpenTreeWork(p.id)}>{p.title}</button></React.Fragment>)
  })()}<span> › {work.title}</span></nav>}
  <div className="work-toolbar">{configured&&isPublicWork(work)&&uuidPattern.test(work.id)&&<button className="button primary small" onClick={shareWork}><LinkIcon size={15}/>作品のURLを共有</button>}<button className="button light small" onClick={onCompare}><GitCompareArrows size={15}/>この作品を比較</button>{isPublicWork(work)&&<button className="button light small" onClick={onParallel}><BookOpen size={15}/>並べて読む</button>}{editable&&<><button className="button light small" onClick={onEdit}><PenLine size={15}/>編集する</button><button className="button ghost-danger small" onClick={onDelete}>削除</button></>}{isOwn&&work.status==='published'&&<><button className="button light small" onClick={onRevise}><PenLine size={15}/>改訂版を書く</button><button className="button light small" onClick={()=>onRequest('hide')}><EyeOff size={15}/>公開停止申請</button><button className="button ghost-danger small" onClick={()=>onRequest('delete')}>削除申請</button></>}{configured&&isPublicWork(work)&&user&&!isOwn&&<button className="button light small" onClick={()=>setReportOpen(x=>!x)}><Flag size={14}/>通報</button>}</div>
  {reportOpen&&<form className="report-box" onSubmit={doReport}><label>通報理由<select value={reason} onChange={e=>setReason(e.target.value)}>{reportReasons.map(s=><option key={s}>{s}</option>)}</select></label><label>補足（任意）<textarea maxLength={1000} value={detail} onChange={e=>setDetail(e.target.value)}/></label><button className="button primary small" disabled={busy}>通報を送信</button></form>}
  <div className="reading-controls" aria-label="本文の文字サイズ"><span>本文の文字サイズ</span><button className="button light small" type="button" onClick={()=>setReaderSize(v=>Math.max(12,v-2))} disabled={readerSize<=12} aria-label="本文を小さく">A−</button><strong aria-live="polite">{readerSize}px</strong><button className="button light small" type="button" onClick={()=>setReaderSize(v=>Math.min(26,v+2))} disabled={readerSize>=26} aria-label="本文を大きく">A＋</button><button className="text-action" type="button" onClick={()=>setReaderSize(16)}>標準に戻す</button></div>
  <div className="work-layout"><section><div className="eyebrow">{work.node_kind==='collection'?'COLLECTION / INTRO':'TEXT / ARTICLE'}</div>{work.body?.trim() ? <ReaderPartBoundary key={`body-${work.id}`} fallback={<pre className="reader-raw-body">{work.body}</pre>}><RichBody source={work.body} fontSize={readerSize}/></ReaderPartBoundary> : !isPublicWork(work) && <p className="muted">この項目には本文がありません。</p>}<ReaderPartBoundary key={`desc-${work.id}`} fallback={<p role="alert">下位作品を表示できませんでした。ページを再読み込みしてください。</p>}><DescendantBodies rootWorkId={work.id} treeNodes={treeNodes} fontSize={readerSize} enabled={isPublicWork(work)}/></ReaderPartBoundary></section><aside className="work-sidebar"><h3>{work.node_kind==='collection'?'グループ全体が問うこと':'作品の問い'}</h3><p>{work.question||'未記載'}</p><h3>先行作品から受け継ぐもの</h3><p>{work.inheritance||'未記載'}</p><h3>新たに試みること</h3><p>{work.novelty||'未記載'}</p><h3>参考文献・関連作品</h3>{work.work_references?.length?work.work_references.map((r,i)=><div className="reference" key={r.id||i}><strong>{r.title}</strong>{r.relation&&<span>{r.relation}</span>}{safeUrl(r.url)&&<a href={safeUrl(r.url)} target="_blank" rel="noopener noreferrer">文献のリンク <ArrowUpRight size={12}/></a>}</div>):<p>登録されていません。</p>}<ReaderPartBoundary key={`community-${work.id}`}><CommunityReferences workId={isPublicWork(work)?work.id:null} user={user} onLogin={onLogin}/></ReaderPartBoundary><ReaderPartBoundary key={`references-${work.id}`}><DescendantReferences workId={work.id} enabled={isPublicWork(work)} /></ReaderPartBoundary><p className="hint">これらの記述は投稿者／入力・構成者による解釈や仮説であり、原著者の見解や独創性を運営が保証するものではありません。</p></aside></div>
  {configured&&<section className="toc-section"><h3><FolderTree size={18}/> この作品の目次・収録作品</h3><ChildTree parentId={work.id} nodes={treeNodes} onSelect={onOpenTreeWork}/>{!treeNodes.some(n=>n.parent_work_id===work.id)&&<p className="hint">収録作品はまだありません。</p>}{isOwn&&<div className="group-actions"><button className="button light small" onClick={()=>onCreateChild('collection')}><FolderTree size={15}/> 下位グループを作成</button><button className="button light small" onClick={()=>onCreateChild('work')}><Plus size={15}/> 作品・本文を追加</button></div>}</section>}
  {revisions?.some(v=>v.status==='approved')&&<section className="history-section"><h3 className="serif"><History size={21}/> 改訂履歴</h3><p className="hint">承認された各版の内容を保存しています。改訂審査中の原稿は一般公開されません。</p><div className="history-list">{revisions.filter(v=>v.status==='approved').sort((a,b)=>b.version_number-a.version_number).map(v=><div className="history-row" key={v.id}><span className="pill green">第{v.version_number}版</span><span>{dateFmt(v.reviewed_at||v.created_at)} · {v.change_note||'変更説明なし'}</span><button type="button" className="text-action" onClick={()=>setHistoryPreview(historyPreview?.id===v.id?null:v)}>本文を見る</button></div>)}</div>{historyPreview&&<div className="history-preview"><div className="history-preview-head"><strong>第{historyPreview.version_number}版 · {historyPreview.snapshot.title}</strong><button className="text-action" onClick={()=>setHistoryPreview(null)}>閉じる</button></div><p className="byline">作者：{historyPreview.snapshot.pen_name}{historyPreview.snapshot.contributor_credit&&<> · 入力／構成：{historyPreview.snapshot.contributor_credit}</>}</p><p className="multiline">{historyPreview.snapshot.summary}</p><RichBody source={historyPreview.snapshot.body} fontSize={readerSize} className="history-rich"/>{(historyPreview.snapshot.question||historyPreview.snapshot.inheritance||historyPreview.snapshot.novelty)&&<div className="history-positioning"><h4>思想・技法・知識の位置づけ</h4>{historyPreview.snapshot.question&&<p><strong>この作品が問うこと：</strong>{historyPreview.snapshot.question}</p>}{historyPreview.snapshot.inheritance&&<p><strong>先行作品から継承するもの：</strong>{historyPreview.snapshot.inheritance}</p>}{historyPreview.snapshot.novelty&&<p><strong>新たに試みること：</strong>{historyPreview.snapshot.novelty}</p>}</div>}<h4>文献・関連作品</h4>{historyPreview.refs?.map((r,i)=><p key={i}>{r.title}{r.relation?' — '+r.relation:''}</p>)}</div>}</section>}
  <div className="annotations"><h3 className="serif">読者の注釈・異論</h3>
    <ReaderPartBoundary key={`notes-${work.id}`}><CommunityNoteList notes={(Array.isArray(notes)?notes:[]).filter(n=>n.status==='published'||(n.status==='pending'&&n.author_id===user?.id))} fontSize={readerSize}/></ReaderPartBoundary>
    {configured&&isPublicWork(work)&&<CommunityNoteForm workId={work.id} user={user} onLogin={onLogin} onSubmitted={onReload}/>}
  </div></article></div>
}

function WorkForm({initial,initialParent=null,initialKind='work',parentOptions=[],user,onSubmit,disabled,onCancel,revisionMode=false,initialChangeNote=''}){
  const [fields,setFields]=useState(()=>initial?{...emptyWork,...initial,section:categoryOf(initial),contributor_credit:initial.contributor_credit||''}:{...emptyWork,node_kind:initialKind,...(initialParent?{parent_work_id:initialParent.id,pen_name:initialParent.pen_name,contributor_credit:initialParent.contributor_credit||'',section:categoryOf(initialParent),genre:initialParent.genre}:{} )})
  const [refs,setRefs]=useState(()=>initial?.work_references?.map(({title,relation,url})=>({title,relation:relation||'',url:url||''}))||[])
  const [changeNote,setChangeNote]=useState(initialChangeNote)
  const [editorSize,setEditorSize]=useState(()=>safeStoredSize('yohaku_editor_size',16,13,24))
  const [preview,setPreview]=useState(false)
  const [publicationMode,setPublicationMode]=useState(initial?.status==='pending'||initial?.status==='rejected'?'pending':'open')
  const editorRef=useRef(null)
  useEffect(()=>{try{localStorage.setItem('yohaku_editor_size',String(editorSize))}catch{}},[editorSize])
  const insertMarkup=(before,after='',placeholder='文章')=>{
    const field=editorRef.current
    const start=field?.selectionStart ?? fields.body.length
    const end=field?.selectionEnd ?? start
    const chosen=fields.body.slice(start,end)||placeholder
    update('body',fields.body.slice(0,start)+before+chosen+after+fields.body.slice(end))
    requestAnimationFrame(()=>{field?.focus();field?.setSelectionRange(start+before.length,start+before.length+chosen.length)})
  }
  const update=(key,value)=>setFields(o=>({...o,[key]:value}))
  const setRef=(index,key,value)=>setRefs(old=>old.map((ref,i)=>i===index?{...ref,[key]:value}:ref))
  const submit=async (e,status)=>{e.preventDefault();const valid=refs.every(r=>r.title.trim()&&(!r.url.trim()||safeUrl(r.url)));if(!valid){alert('文献名とURLを確認してください。外部リンクはhttps://から始めてください。');return}
    await onSubmit({p_id:initial?.id||null,p_pen_name:fields.pen_name.trim(),p_contributor_credit:fields.contributor_credit.trim(),p_section:fields.section,p_title:fields.title.trim(),p_genre:fields.genre,p_theme:fields.theme.trim(),p_summary:fields.summary.trim(),p_body:fields.body.trim(),p_question:fields.question.trim(),p_inheritance:fields.inheritance.trim(),p_novelty:fields.novelty.trim(),p_status:status,p_parent_work_id:fields.parent_work_id||null,p_order_index:Number(fields.order_index)||0,p_node_kind:fields.node_kind,p_references:refs.map(r=>({title:r.title.trim(),relation:r.relation.trim(),url:r.url.trim()||null})),...(revisionMode?{p_change_note:changeNote.trim()}:{})})}
  return <form className="editor" onSubmit={e=>submit(e,revisionMode?'pending':publicationMode)}><div className="editor-section"><div className="section-small">01 / 基本情報</div><div className="two-col"><Field label="作品名 *"><input required maxLength={180} value={fields.title} onChange={e=>update('title',e.target.value)}/></Field><Field label="作者（原著者） *"><input required maxLength={80} value={fields.pen_name} onChange={e=>update('pen_name',e.target.value)}/></Field><Field label="入力／構成（任意）"><input maxLength={120} value={fields.contributor_credit} onChange={e=>update('contributor_credit',e.target.value)}/></Field><Field label="分野 *"><select value={fields.section} onChange={e=>{const section=e.target.value;setFields(o=>({...o,section,genre:categoryTree[section][0]}))}}>{categorySections.map(c=><option key={c} value={c}>{c}</option>)}</select></Field><Field label="小分類 *"><select value={fields.genre} onChange={e=>update('genre',e.target.value)}>{!categoryTree[fields.section].includes(fields.genre)&&<option value={fields.genre}>{displayGenre(fields.genre)}（既存作品）</option>}{categoryTree[fields.section].map(c=><option key={c} value={c}>{c}</option>)}</select></Field><Field label="登録するもの"><select value={fields.node_kind||'work'} onChange={e=>update('node_kind',e.target.value)}><option value="work">作品・本文（10〜200,000文字）</option><option value="collection">グループ／部／章（本文不要・下位グループ可）</option></select></Field><Field label="収録先の作品（任意）"><select value={fields.parent_work_id||''} onChange={e=>update('parent_work_id',e.target.value||null)}><option value="">最上位の作品として掲載</option>{parentOptions.map(({work,depth,path})=><option key={work.id} value={work.id}>{'　'.repeat(depth)}{depth?'↳ ':''}{path}（{statusText[work.status]||'作品'}）</option>)}</select></Field>
  <Field label="同じ階層内の並び順"><input type="number" min="0" max="9999" value={fields.order_index??0} onChange={e=>update('order_index',e.target.value)} /></Field>
  <Field label="主題"><input maxLength={200} value={fields.theme} onChange={e=>update('theme',e.target.value)}/></Field></div><Field label={fields.node_kind==='collection'?'グループの説明（任意）':'作品紹介（任意）'}><textarea maxLength={1000} rows={3} value={fields.summary} onChange={e=>update('summary',e.target.value)}/></Field>{fields.node_kind==='work'&&<><div className="writing-toolbar" aria-label="執筆ツール">
    <strong>書式・数式</strong>
    <button type="button" className="button light small" onClick={()=>insertMarkup('## ','','小見出し')}>見出し</button>
    <button type="button" className="button light small" onClick={()=>insertMarkup('**','**','強調')}>太字</button>
    <button type="button" className="button light small" onClick={()=>insertMarkup('$','$','E=mc^2')}>数式（行内）</button>
    <button type="button" className="button light small" onClick={()=>insertMarkup('\n$$\n','\n$$\n',String.raw`\int_0^1 x^2\,dx=\frac{1}{3}`)}>数式（独立行）</button>
    <span className="toolbar-spacer" />
    <button type="button" className="button light small" onClick={()=>setEditorSize(v=>Math.max(13,v-1))} disabled={editorSize<=13}>A−</button><strong>{editorSize}px</strong><button type="button" className="button light small" onClick={()=>setEditorSize(v=>Math.min(24,v+1))} disabled={editorSize>=24}>A＋</button>
    <button type="button" className="button light small" aria-pressed={preview} onClick={()=>setPreview(v=>!v)}>{preview?'プレビューを閉じる':'プレビューを表示'}</button>
  </div>
  <p className="hint">MarkdownとLaTeXに対応： <code>## 見出し</code> ・ <code>**太字**</code> ・ <code>$E=mc^2$</code> ・ <code>$$...$$</code>。本文の大きさは読者も変更できます。</p>
  <Field label="本文 *"><textarea required minLength={10} maxLength={200000} rows={15} className="body-editor" value={fields.body} onChange={e=>update('body',e.target.value)} ref={editorRef} style={{fontSize:editorSize}}/>
    <span className="hint">{fields.body.length.toLocaleString()} / 200,000文字</span></Field>{preview&&<div className="editor-preview"><div className="eyebrow">LIVE PREVIEW / 公開時の表示</div><RichBody source={fields.body} fontSize={editorSize}/></div>}</>}{fields.node_kind==='collection'&&fields.body.trim()&&<p className="hint">このグループには旧版の案内本文が保存されています。グループの編集でその本文は消えません。本文を編集する場合は種類を「作品・本文」に切り替えてください。</p>}</div>
  <div className="editor-section"><div className="section-small">02 / 思想・技法・知識の位置づけ</div><p className="muted">記載は任意です。確証がない場合は「仮説」として記述してください。</p><Field label="この作品が問うこと"><textarea maxLength={2000} rows={3} value={fields.question} onChange={e=>update('question',e.target.value)}/></Field><Field label="先行作品から継承するもの"><textarea maxLength={2000} rows={3} value={fields.inheritance} onChange={e=>update('inheritance',e.target.value)}/></Field><Field label="新たに試みること"><textarea maxLength={2000} rows={3} value={fields.novelty} onChange={e=>update('novelty',e.target.value)}/></Field></div>
  <div className="editor-section"><div className="section-small">03 / 参考文献・関連作品</div><p className="muted">書誌情報、関連の理由、任意のhttpsリンクを記録できます。上限20件。</p>{refs.map((r,i)=><div className="ref-edit" key={i}><div className="ref-edit-head"><strong>文献 {i+1}</strong><button className="text-action dangerous" type="button" onClick={()=>setRefs(a=>a.filter((_,j)=>j!==i))}><Trash2 size={13}/> 削除</button></div><div className="two-col"><Field label="書名・著者など *"><input required maxLength={300} value={r.title} onChange={e=>setRef(i,'title',e.target.value)}/></Field><Field label="関連の理由"><input maxLength={200} value={r.relation} onChange={e=>setRef(i,'relation',e.target.value)}/></Field></div><Field label="出典・文献のURL"><input type="url" maxLength={1000} value={r.url} onChange={e=>setRef(i,'url',e.target.value)}/></Field></div>)}<button type="button" disabled={refs.length>=20} className="button light small" onClick={()=>setRefs(x=>[...x,{title:'',relation:'',url:''}])}><Plus size={15}/>文献を追加</button></div>
  {revisionMode&&<div className="editor-section"><div className="section-small">04 / 改訂の説明</div><Field label="今回変更した内容（任意）"><textarea rows={3} maxLength={1000} value={changeNote} onChange={e=>setChangeNote(e.target.value)}/></Field><p className="hint">承認後、この説明は改訂履歴に掲載されます。公開中の旧版は審査完了まで変更されません。</p></div>}
  {!revisionMode&&<div className="editor-section publish-choice"><div className="section-small">04 / 公開方法</div><div className="publish-choice-options"><label className={publicationMode==='open'?'publish-option active':'publish-option'}><input type="radio" name="publication-mode" checked={publicationMode==='open'} onChange={()=>setPublicationMode('open')}/><span><strong>自由公開（審査なし）</strong><small>新規性・厳密さの説明なしで、すぐ公開。未審査と明示し、作者が直接編集できます。</small></span></label><label className={publicationMode==='pending'?'publish-option active':'publish-option'}><input type="radio" name="publication-mode" checked={publicationMode==='pending'} onChange={()=>setPublicationMode('pending')}/><span><strong>審査付き公開</strong><small>管理者の確認後に公開。改訂時も再審査を行います。</small></span></label></div></div>}
  <div className="editor-actions"><p className="hint">{revisionMode?'改訂案は承認まで非公開です。差し戻された場合は再編集できます。':'自由公開は運営による事前審査・品質保証ではありません。著作権・個人情報・利用規約を守ってください。'}</p><div><button className="button light" type="button" onClick={onCancel}>キャンセル</button><button className="button light" type="button" disabled={disabled} onClick={e=>submit(e,'draft')}>下書き保存</button><button className="button primary" disabled={disabled} type="submit"><PenLine size={15}/>{disabled?'保存中…':revisionMode||publicationMode==='pending'?'審査へ提出':'審査なしで公開'}</button></div></div></form>
}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}

function AuthDialog({isRecovery,onClose,onSuccess}){
 const [mode,setMode]=useState(isRecovery?'recover-new':'login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[captcha,setCaptcha]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[captchaCycle,setCaptchaCycle]=useState(0)
 useEffect(()=>{if(isRecovery)setMode('recover-new')},[isRecovery])
 const changeMode=next=>{setMode(next);setMessage('');setCaptcha(null)}
 const handle=async e=>{e.preventDefault();if(busy)return;if(turnstileKey&&mode!=='recover-new'&&!captcha){setMessage('認証チェックを完了してください。');return}setBusy(true);setMessage('');let error
   if(mode==='signup')({error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,...(captcha?{captchaToken:captcha}:{})}}))
   if(mode==='login')({error}=await supabase.auth.signInWithPassword({email,password,options:captcha?{captchaToken:captcha}:{}}))
   if(mode==='reset')({error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname,...(captcha?{captchaToken:captcha}:{})}))
   if(mode==='recover-new')({error}=await supabase.auth.updateUser({password}))
   setBusy(false);setCaptcha(null);setCaptchaCycle(x=>x+1)
   if(error){setMessage(messageFor(error));return}
   if(mode==='login')onSuccess('ログインしました。')
   else if(mode==='recover-new'){onSuccess('パスワードを変更しました。')}
   else setMessage('メールを送信しました。届いた案内を確認してください。メール認証の設定によっては受信まで時間がかかることがあります。')
 }
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-label="ログイン・アカウント"><button className="close" onClick={onClose} aria-label="閉じる"><X/></button><div className="eyebrow">ACCOUNT</div><h2 className="serif">{mode==='signup'?'アカウントをつくる':mode==='reset'?'パスワードの再設定':mode==='recover-new'?'新しいパスワード':'おかえりなさい。'}</h2><p className="muted">投稿・注釈・通報にはログインが必要です。読むだけなら登録は不要です。</p><form onSubmit={handle}>
 {mode!=='recover-new'&&<Field label="メールアドレス"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></Field>}
 {mode!=='reset'&&<Field label={mode==='recover-new'?'新しいパスワード':'パスワード'}><input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'}/></Field>}
 {turnstileKey&&mode!=='recover-new'&&<div className="captcha"><Turnstile key={captchaCycle} siteKey={turnstileKey} onSuccess={setCaptcha} onExpire={()=>setCaptcha(null)} onError={()=>setMessage('認証チェックに失敗しました。再試行してください。')}/></div>}
 {message&&<p role="status" className="auth-message">{message}</p>}
 <button type="submit" className="button primary full" disabled={busy}>{busy?'処理中…':mode==='signup'?'登録メールを送信':mode==='reset'?'再設定メールを送信':mode==='recover-new'?'パスワードを変更':'ログイン'}</button></form><div className="auth-switch">{mode!=='login'&&<button onClick={()=>changeMode('login')}>ログインへ</button>}{mode==='login'&&<><button onClick={()=>changeMode('signup')}>新規登録</button><button onClick={()=>changeMode('reset')}>パスワードを忘れた</button></>}</div></section></div>
}

createRoot(document.getElementById('root')).render(<App/>)
