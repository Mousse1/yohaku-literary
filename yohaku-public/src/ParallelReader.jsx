import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, X, Plus, ArrowUpRight, RefreshCw, Type, Search, ChevronDown, Folder, FileText, Check } from 'lucide-react'
import { configured, supabase, demoWorks, dateFmt, safeUrl, messageFor } from './client'
import RichBody from './RichBody'
import DescendantReferences from './DescendantReferences'
import ReaderErrorBoundary, { ReaderPartBoundary } from './ReaderErrorBoundary'
import CollapsibleBody from './CollapsibleBody'
import { hierarchyEntries } from './workHierarchy'
import { searchParallelWorks, otherPanelWorks } from './parallelWorkSearch'
import DescendantBodies from './DescendantBodies'
import { CommunityReferences, CommunityNoteForm, CommunityNoteList } from './CommunityContributions'
import { unpackReference, referenceForNumber, normalizeReferences, readableText } from './referenceAnnotations'

const MAX_PANES = 4
const types = [
  ['body', '本文'],
  ['notes', '注釈・異論'],
  ['refs', '参考文献・関連作品']
]
const validSize = () => {
  try {
    const n = Number(localStorage.getItem('yohaku_reader_size'))
    return n >= 12 && n <= 26 ? n : 16
  } catch { return 16 }
}

export default function ParallelReader({ initialPanes=[], publishedWorks=[], publishedIndex=[], user=null, onLogin, onExit, onOpenSingle }) {
  const available = useMemo(() => {
    const found = new Map()
    for(const w of [...publishedIndex, ...publishedWorks, ...demoWorks.filter(w=>!configured)]) {
      if(w?.id && (!configured || ['published','open'].includes(w.status))) found.set(w.id,w)
    }
    return hierarchyEntries([...found.values()])
  },[publishedIndex,publishedWorks])
  const nextId = useRef(1)
  const [panes,setPanes] = useState(() => initialPanes.map(p=>({key:nextId.current++,workId:p.workId,kind:p.kind||'body',referenceNumber:p.referenceNumber||null})).slice(0,MAX_PANES))
  const [fontSize,setFontSize] = useState(validSize)
  useEffect(()=>{
    try {localStorage.setItem('yohaku_reader_size',String(fontSize))}catch{}
  },[fontSize])
  useEffect(()=>{
    if(!panes.length && available.length) {
      setPanes([{key:nextId.current++,workId:available[0].id,kind:'body'}, {key:nextId.current++,workId:available[0].id,kind:'body'}])
    }
  },[available,panes.length])
  const update = (key, patch) => setPanes(old=>old.map(p=>p.key===key?{...p,...patch}:p))
  const addPane = () => {
    if(panes.length>=MAX_PANES)return
    const prev=panes.at(-1)
    const workId=prev?.workId||available[0]?.id
    if(!workId)return
    setPanes(old=>[...old,{key:nextId.current++,workId,kind:'body'}])
  }
  const openReferenceNextTo = (sourceKey,workId,referenceNumber) => {
    const requested=Number(referenceNumber)
    setPanes(old => {
      const match=old.find(p=>p.workId===workId && p.kind==='refs' && p.key!==sourceKey)
      if(match) return old.map(p=>p.key===match.key?{...p,referenceNumber:requested}:p)
      if(old.length<MAX_PANES) return [...old,{key:nextId.current++,workId,kind:'refs',referenceNumber:requested}]
      // When at the four-panel cap, reuse a secondary panel, never the clicked body.
      const replace=old.findLast(p=>p.key!==sourceKey)
      return replace ? old.map(p=>p.key===replace.key?{...p,workId,kind:'refs',referenceNumber:requested}:p) : old
    })
  }
  const removePane = key => setPanes(old=>old.length<=1?old:old.filter(p=>p.key!==key))

  return <main className="parallel-page" aria-label="並列読書ワークスペース">
    <div className="parallel-top">
      <div><div className="eyebrow">PARALLEL READING / RESEARCH DESK</div><h1 className="serif">並べて、読む。</h1><p>本文と注釈、異なる作品を同時に開き、独立してスクロールできます。</p></div>
      <div className="parallel-actions">
        <div className="parallel-font-control" aria-label="本文の文字サイズ">
          <Type size={16}/><button type="button" onClick={()=>setFontSize(s=>Math.max(12,s-2))} disabled={fontSize<=12} aria-label="文字を小さく">A−</button><strong>{fontSize}px</strong><button type="button" onClick={()=>setFontSize(s=>Math.min(26,s+2))} disabled={fontSize>=26} aria-label="文字を大きく">A＋</button>
        </div>
        <button className="button light small" type="button" disabled={panes.length>=MAX_PANES||!available.length} onClick={addPane}><Plus size={16}/>パネルを追加</button>
        <button className="button light small" type="button" onClick={onExit}>作品を探す</button>
      </div>
    </div>
    {!available.length && !panes.length ? <div className="empty">公開作品の読み込みを待っています。作品がない場合は、公開後に利用できます。</div> :
      <div className="parallel-panels" role="group" aria-label="複数の読書パネル">
        {panes.map((pane,i)=><ReaderErrorBoundary key={pane.key} resetKey={`${pane.workId}:${pane.kind}`} work={available.find(w=>w.id===pane.workId)} onBack={onExit}><ParallelPane
          pane={pane} index={i} available={available} otherSelections={otherPanelWorks(panes,available,pane.key)} fontSize={fontSize} user={user} onLogin={onLogin}
          onChange={patch=>update(pane.key,patch)} onRemove={()=>removePane(pane.key)}
          canRemove={panes.length>1} onOpenSingle={onOpenSingle} onAnnotationClick={openReferenceNextTo}
        /></ReaderErrorBoundary>)}
      </div>}
    <p className="parallel-footnote">審査済み作品と自由公開作品を表示します。注釈・文献提案は承認済みのものだけ公開します。自分が提出した審査待ち投稿は本人にだけ表示します。最大4パネルまで利用できます。</p>
  </main>
}


// The picker stays local to each panel. It searches full ancestor paths, while
// tree-ordered results display only the current title to avoid repeated names.
function ParallelWorkPicker({workId,available,otherSelections,missingName,onSelect}) {
  const [open,setOpen] = useState(false)
  const [query,setQuery] = useState('')
  const [activeIndex,setActiveIndex] = useState(0)
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)
  const toggleRef = useRef(null)
  const current=available.find(w=>w.id===workId)
  const matches=useMemo(()=>searchParallelWorks(available,query,50),[available,query])
  const related=otherSelections.filter(({work})=>work?.id && (!query || searchParallelWorks([work],query).length))
  const relatedIds=new Set(related.map(x=>x.work.id))
  const remainder=matches.filter(w=>!relatedIds.has(w.id))
  const options=[...related.map(x=>x.work),...remainder]
  useEffect(()=>{
    if(!open)return
    const onPointerDown=e=>{if(!wrapperRef.current?.contains(e.target)){setOpen(false);setQuery('')}}
    document.addEventListener('pointerdown',onPointerDown)
    inputRef.current?.focus()
    return ()=>document.removeEventListener('pointerdown',onPointerDown)
  },[open])
  const choose=(id)=>{
    onSelect(id)
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
    toggleRef.current?.focus()
  }
  const onKeys=e=>{
    if(e.key==='Escape'){e.preventDefault();setOpen(false);setQuery('');toggleRef.current?.focus()}
    if(e.key==='ArrowDown'&&options.length){e.preventDefault();setActiveIndex(i=>Math.min(options.length-1,i+1))}
    if(e.key==='ArrowUp'&&options.length){e.preventDefault();setActiveIndex(i=>Math.max(0,i-1))}
    if(e.key==='Enter'&&options.length){e.preventDefault();choose(options[Math.max(0,Math.min(activeIndex,options.length-1))].id)}
  }
  const renderOption=(w,i,prefix='')=><button
    type="button" role="option" aria-selected={w.id===workId}
    key={prefix+w.id}
    className={'parallel-work-option '+(i===activeIndex?'keyboard-active ':'')+(w.id===workId?'selected':'')}
    onMouseEnter={()=>setActiveIndex(i)} onClick={()=>choose(w.id)}
    title={w.path||w.title}
  ><span className="parallel-work-option-main" style={{paddingLeft:!query?Math.min(w.depth||0,6)*10:0}}>
      {w.node_kind==='collection'?<Folder size={14} aria-hidden="true"/>:<FileText size={14} aria-hidden="true"/>}
      <span>{w.title||'（無題）'}</span>{w.id===workId&&<Check size={14} aria-label="選択中"/>}
    </span>{query&&w.path&&w.path!==w.title&&<small>{w.path}</small>}
  </button>
  return <div className="parallel-work-picker" ref={wrapperRef}>
    <label>作品を検索・選択</label>
    <button type="button" className="parallel-work-trigger" aria-expanded={open} aria-haspopup="dialog"
      aria-label={`作品を変更：${current?.title||missingName||'未選択'}`}
      ref={toggleRef} onClick={()=>{setOpen(x=>!x);setQuery('');setActiveIndex(0)}}>
      <Search size={14} aria-hidden="true"/><span>{current?.title||missingName||'作品を検索'}</span><ChevronDown size={14} aria-hidden="true"/>
    </button>
    {!!otherSelections.length&&<div className="parallel-quick-works" aria-label="ほかのパネルの作品">
      <span className="parallel-quick-heading">ほかのパネル</span>
      {otherSelections.map(({index,work})=><button type="button" key={work.id} title={`パネル${index+1}と同じ作品：${work.path||work.title}`}
        className={'parallel-quick-button '+(work.id===workId?'current':'')}
        onClick={()=>choose(work.id)}>{String(index+1).padStart(2,'0')} {work.title}{work.id===workId?' ✓':''}</button>)}
    </div>}
    {open&&<div className="parallel-work-dropdown" role="dialog" aria-label="作品の検索と選択">
      <div className="parallel-work-search"><Search size={15} aria-hidden="true"/>
        <input ref={inputRef} type="search" value={query} onChange={e=>{setQuery(e.target.value);setActiveIndex(0)}}
          onKeyDown={onKeys} placeholder="題名・グループ名で検索" aria-label="題名・グループ名で検索" autoComplete="off"/>
      </div>
      <div className="parallel-work-results" role="listbox" aria-label="作品の検索結果">
        {!!related.length&&<><div className="parallel-work-group-label">ほかのパネルで開いている作品</div>
        {related.map(({work},i)=>renderOption(work,i,'related-'))}</>}
        {!!remainder.length&&<div className="parallel-work-group-label">{query?'検索結果':'作品（階層順・先頭50件）'}</div>}
        {remainder.map((w,i)=>renderOption(w,i+related.length))}
        {!options.length&&<div className="parallel-work-empty">該当する作品がありません。</div>}
        {!query&&available.length>50&&<p className="parallel-work-hint">ほかの作品は名前や上位グループ名で検索できます。</p>}
      </div>
    </div>}
  </div>
}

function ParallelPane({pane,index,available,otherSelections,fontSize,user,onLogin,onChange,onRemove,canRemove,onOpenSingle,onAnnotationClick}){
  const [work,setWork] = useState(null)
  const [notes,setNotes] = useState([])
  const [loadState,setLoadState] = useState('loading')
  const [error,setError] = useState('')
  const [refresh,setRefresh] = useState(0)
  const [showSource,setShowSource] = useState(Boolean(pane.referenceNumber))
  const scrollRef = useRef(null)
  useEffect(()=>{
    setShowSource(Boolean(pane.referenceNumber))
    if (pane.kind === 'refs' && pane.referenceNumber) scrollRef.current?.scrollTo?.({top:0,behavior:'smooth'})
  },[pane.workId,pane.kind,pane.referenceNumber])
  useEffect(()=>{
    let active=true
    setLoadState('loading');setError('');setNotes([]);setWork(null)
    if(!pane.workId) {setLoadState('empty');return ()=>{active=false}}
    if(!configured){
      const sample=demoWorks.find(w=>w.id===pane.workId&&w.status==='published')
      setWork(sample||null);setLoadState(sample?'ready':'notfound')
      return ()=>{active=false}
    }
    ;(async()=>{
      const {data,error:workError}=await supabase.from('works')
        .select('*,work_references(*)').eq('id',pane.workId).in('status',['published','open']).maybeSingle()
      if(!active)return
      if(workError||!data){setError(workError?messageFor(workError):'作品が見つからないか、非公開です。');setLoadState('notfound');return}
      setWork({...data,work_references:normalizeReferences(data.work_references)})
      if(pane.kind==='notes'){
        const {data:noteRows,error:noteError}=await supabase.from('notes')
          .select('id,work_id,author_id,pen_name,type,body,created_at,status')
          .eq('work_id',pane.workId).order('created_at',{ascending:true}).limit(100)
        if(!active)return
        if(noteError){setError(messageFor(noteError));setLoadState('error');return}
        setNotes(noteRows||[])
      }
      setLoadState('ready')
    })().catch(error=>{if(active){setError(messageFor(error));setLoadState('error')}})
    return ()=>{active=false}
  },[pane.workId,pane.kind,user?.id,refresh])
  const selectedExists=available.some(w=>w.id===pane.workId)
  const name=work?.title||available.find(w=>w.id===pane.workId)?.title||'作品を選ぶ'
  return <section className="parallel-pane" aria-label={`読書パネル${index+1}`}>
    <div className="parallel-pane-heading">
      <span className="parallel-pane-num">{index+1 < 10 ? `0${index+1}` : index+1}</span>
      <strong className="serif" title={name}>{name}</strong>
      {canRemove&&<button className="parallel-icon-button" type="button" onClick={onRemove} title="このパネルを閉じる" aria-label={`パネル${index+1}を閉じる`}><X size={17}/></button>}
    </div>
    <div className="parallel-pane-settings">
      <ParallelWorkPicker
        workId={pane.workId} available={available} otherSelections={otherSelections}
        missingName={!selectedExists?name:null} onSelect={workId=>onChange({workId,referenceNumber:null})}
      />
      <label>表示<select value={pane.kind} onChange={e=>onChange({kind:e.target.value,referenceNumber:null})}>
        {types.map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select></label>
    </div>
    <div ref={scrollRef} className="parallel-pane-scroll" tabIndex={0} aria-label={`${name}の${types.find(t=>t[0]===pane.kind)?.[1]}。この領域をスクロールできます`}>
      {loadState==='loading' ? <p className="muted">読み込み中…</p> : loadState==='notfound'||loadState==='error' ? <div className="parallel-error"><p>{error||'作品を表示できません。'}</p><button className="button light small" onClick={()=>setRefresh(n=>n+1)}>再読み込み</button></div> :
        work && <>
          <div className="parallel-work-info"><div className="eyebrow">{pane.kind==='body'?'TEXT':pane.kind==='notes'?'ANNOTATIONS':'REFERENCES'}</div><h2 className="serif">{work.title}</h2><p><span className={work.status==='open'?'publication-label unreviewed':'publication-label reviewed'}>{work.status==='open'?'自由公開・未審査':'審査済み公開'}</span>　作者：{work.pen_name}{work.contributor_credit&&<>　／　入力・構成：{work.contributor_credit}</>}</p></div>
          {pane.kind==='body' && <>
            {work.body?.trim() && <CollapsibleBody key={work.id}><RichBody source={work.body} fontSize={fontSize} onAnnotationClick={number=>onAnnotationClick(pane.key,work.id,number)}/></CollapsibleBody>}
            <DescendantBodies rootWorkId={work.id} treeNodes={available} fontSize={fontSize} compact enabled={pane.kind==='body'} onAnnotationClick={(id,number)=>onAnnotationClick(pane.key,id,number)}/>
          </>}
          {pane.kind==='notes' && <><CommunityNoteList notes={notes.filter(n=>n.status==='published'||(n.status==='pending'&&n.author_id===user?.id))} fontSize={fontSize} compact/><CommunityNoteForm workId={work.id} user={user} onLogin={onLogin} compact onSubmitted={()=>setRefresh(n=>n+1)}/></>}
          {pane.kind==='refs' && <ParallelReferences key={`${work.id}:${pane.referenceNumber||''}`} work={work} referenceNumber={pane.referenceNumber} showSource={showSource} onToggleSource={()=>setShowSource(x=>!x)} user={user} onLogin={onLogin}/>}
        </>}
    </div>
    <div className="parallel-pane-footer">
      <button type="button" className="text-action" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={13}/> 更新</button>
      {work && <button type="button" className="text-action" onClick={()=>onOpenSingle(work.id)}><BookOpen size={13}/> 単独で読む</button>}
    </div>
  </section>
}

// Kept separate so missing bibliography data can be tested at render time.
export function AnnotationReferenceFocus({references,referenceNumber,showSource,onToggleSource}) {
  const match=referenceForNumber(references,referenceNumber)
  const ref=match?unpackReference(match):null
  const link=ref && safeUrl(ref.url)
  return <section className="parallel-reference-focus" aria-live="polite">
    <div className="eyebrow">ANNOTATION / *{referenceNumber}</div>
    <h3>注釈 *{referenceNumber} に対応する参考文献</h3>
    {ref?<>
      <strong>{ref.title}</strong>
      {ref.relation&&<p>{ref.relation}</p>}
      {link&&<>
        <div className="parallel-source-actions">
          <button type="button" className="button light small" onClick={onToggleSource}>{showSource?'リンクのプレビューを閉じる':'リンク先を並べて表示'}</button>
          <a href={link} target="_blank" rel="noopener noreferrer">新しいタブで開く <ArrowUpRight size={12}/></a>
        </div>
        {showSource&&<div className="parallel-source-preview">
          <iframe title={`${ref.title}の出典ページ`} src={link} loading="lazy" sandbox="allow-forms allow-scripts allow-popups" referrerPolicy="no-referrer"/>
          <p className="hint">サイトの設定によっては埋め込み表示できません。その場合は「新しいタブで開く」を利用してください。</p>
        </div>}
      </>}
    </>:<p className="muted">注釈 *{referenceNumber} に対応する文献はまだ登録されていません。作者は編集画面の参考文献欄で「対応する注釈番号」を指定できます。</p>}
  </section>

}

// Keep optional community widgets from discarding the author's bibliography.
export function ParallelReferences({work,referenceNumber,showSource,onToggleSource,user,onLogin}) {
  const references=normalizeReferences(work.work_references)
  return <div className="parallel-references">
    {Boolean(referenceNumber) && <AnnotationReferenceFocus references={references} referenceNumber={referenceNumber} showSource={showSource} onToggleSource={onToggleSource}/>}
    {[['作品の問い',work.question],['継承するもの',work.inheritance],['新たに試みること',work.novelty]].map(([label,value])=><section key={label}><h3>{label}</h3><p className="multiline">{readableText(value)||'未記載'}</p></section>)}
    <section><h3>参考文献・関連作品</h3>{references.length?references.map((r,i)=>{
      const ref=unpackReference(r)
      return <div key={r.id||i} className="reference"><strong>{ref.annotationNumber?`*${ref.annotationNumber}　`:''}{ref.title}</strong>{ref.relation&&<p>{ref.relation}</p>}{safeUrl(ref.url)&&<a href={safeUrl(ref.url)} target="_blank" rel="noopener noreferrer">文献リンク <ArrowUpRight size={12}/></a>}</div>
    }):<p className="muted">登録されていません。</p>}</section>
    <ReaderPartBoundary resetKey={work.id} fallback={<p role="alert">読者による参考文献を表示できませんでした。</p>}><CommunityReferences workId={work.id} user={user} onLogin={onLogin} compact/></ReaderPartBoundary>
    <ReaderPartBoundary resetKey={work.id} fallback={<p role="alert">下位作品の参考文献を表示できませんでした。</p>}><DescendantReferences workId={work.id} enabled={['published','open'].includes(work.status)}/></ReaderPartBoundary>
  </div>
}
