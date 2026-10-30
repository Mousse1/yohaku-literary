import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, X, Plus, ArrowUpRight, RefreshCw, Type } from 'lucide-react'
import { configured, supabase, demoWorks, dateFmt, safeUrl, messageFor } from './client'
import RichBody from './RichBody'
import DescendantReferences from './DescendantReferences'
import ReaderErrorBoundary from './ReaderErrorBoundary'
import { hierarchyEntries, descendantsOf, hierarchicalLabel } from './workHierarchy'

const MAX_PANES = 4
const DESCENDANT_PAGE_SIZE = 6
const types = [
  ['body', '本文'],
  ['notes', '注釈・異論'],
  ['refs', '参考文献・解説']
]
const validSize = () => {
  try {
    const n = Number(localStorage.getItem('yohaku_reader_size'))
    return n >= 12 && n <= 26 ? n : 16
  } catch { return 16 }
}

export default function ParallelReader({ initialPanes=[], publishedWorks=[], publishedIndex=[], onExit, onOpenSingle }) {
  const available = useMemo(() => {
    const found = new Map()
    for(const w of [...publishedIndex, ...publishedWorks, ...demoWorks.filter(w=>!configured)]) {
      if(w?.id && (!configured || w.status === 'published')) found.set(w.id,w)
    }
    return hierarchyEntries([...found.values()])
  },[publishedIndex,publishedWorks])
  const nextId = useRef(1)
  const [panes,setPanes] = useState(() => initialPanes.map(p=>({key:nextId.current++,workId:p.workId,kind:p.kind||'body'})).slice(0,MAX_PANES))
  const [fontSize,setFontSize] = useState(validSize)
  useEffect(()=>{
    try {localStorage.setItem('yohaku_reader_size',String(fontSize))}catch{}
  },[fontSize])
  useEffect(()=>{
    if(!panes.length && available.length) {
      setPanes([{key:nextId.current++,workId:available[0].id,kind:'body'}, {key:nextId.current++,workId:available[0].id,kind:'notes'}])
    }
  },[available,panes.length])
  const update = (key, patch) => setPanes(old=>old.map(p=>p.key===key?{...p,...patch}:p))
  const addPane = () => {
    if(panes.length>=MAX_PANES)return
    const prev=panes.at(-1)
    const workId=prev?.workId||available[0]?.id
    if(!workId)return
    setPanes(old=>[...old,{key:nextId.current++,workId,kind:old.length===1?'notes':'body'}])
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
          pane={pane} index={i} available={available} fontSize={fontSize}
          onChange={patch=>update(pane.key,patch)} onRemove={()=>removePane(pane.key)}
          canRemove={panes.length>1} onOpenSingle={onOpenSingle}
        /></ReaderErrorBoundary>)}
      </div>}
    <p className="parallel-footnote">公開済みの本文と承認済みの注釈のみを表示します。未公開の原稿・審査待ち注釈は表示しません。最大4パネルまで利用できます。</p>
  </main>
}

function ParallelPane({pane,index,available,fontSize,onChange,onRemove,canRemove,onOpenSingle}){
  const [work,setWork] = useState(null)
  const [notes,setNotes] = useState([])
  const [loadState,setLoadState] = useState('loading')
  const [error,setError] = useState('')
  const [refresh,setRefresh] = useState(0)
  const [shownDescendants,setShownDescendants] = useState(DESCENDANT_PAGE_SIZE)
  const descendants = useMemo(() => descendantsOf(available, pane.workId), [available,pane.workId])
  const visibleDescendants = useMemo(() => descendants.slice(0, shownDescendants), [descendants,shownDescendants])
  const [childWorks,setChildWorks] = useState([])
  const [childLoading,setChildLoading] = useState(false)
  const [childError,setChildError] = useState('')
  useEffect(() => { setShownDescendants(DESCENDANT_PAGE_SIZE) }, [pane.workId])
  // Public descendants only. Each batch is limited, so a large book cannot
  // download hundreds of 200k-character chapters when one panel is opened.
  useEffect(() => {
    let active = true
    const ids = pane.kind === 'body' ? visibleDescendants.map(entry => entry.id) : []
    if (!ids.length) { setChildWorks([]);setChildLoading(false);setChildError('');return () => { active=false } }
    setChildLoading(true);setChildError('')
    if(!configured) {
      setChildWorks(ids.map(id=>demoWorks.find(w=>w.id===id&&w.status==='published')).filter(Boolean))
      setChildLoading(false)
      return () => {active=false}
    }
    ;(async()=>{
      try {
        const {data,error}=await supabase.from('works')
          .select('id,title,body,node_kind,status,parent_work_id').in('id',ids).eq('status','published')
        if(!active)return
        if(error)throw error
        const byId=new Map((data||[]).map(work=>[work.id,work]))
        setChildWorks(ids.map(id=>byId.get(id)).filter(Boolean))
        setChildLoading(false)
      } catch(err) {
        if(active){setChildError(messageFor(err));setChildLoading(false)}
      }
    })()
    return () => { active=false }
  }, [pane.kind,pane.workId,shownDescendants,visibleDescendants,refresh])
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
        .select('*,work_references(*)').eq('id',pane.workId).eq('status','published').maybeSingle()
      if(!active)return
      if(workError||!data){setError(workError?messageFor(workError):'作品が見つからないか、非公開です。');setLoadState('notfound');return}
      setWork(data)
      if(pane.kind==='notes'){
        const {data:noteRows,error:noteError}=await supabase.from('notes')
          .select('id,work_id,pen_name,type,body,created_at,status')
          .eq('work_id',pane.workId).eq('status','published').order('created_at',{ascending:true}).limit(100)
        if(!active)return
        if(noteError){setError(messageFor(noteError));setLoadState('error');return}
        setNotes(noteRows||[])
      }
      setLoadState('ready')
    })()
    return ()=>{active=false}
  },[pane.workId,pane.kind,refresh])
  const selectedExists=available.some(w=>w.id===pane.workId)
  const name=work?.title||available.find(w=>w.id===pane.workId)?.title||'作品を選ぶ'
  return <section className="parallel-pane" aria-label={`読書パネル${index+1}`}>
    <div className="parallel-pane-heading">
      <span className="parallel-pane-num">{index+1 < 10 ? `0${index+1}` : index+1}</span>
      <strong className="serif" title={name}>{name}</strong>
      {canRemove&&<button className="parallel-icon-button" type="button" onClick={onRemove} title="このパネルを閉じる" aria-label={`パネル${index+1}を閉じる`}><X size={17}/></button>}
    </div>
    <div className="parallel-pane-settings">
      <label>作品（最上位 › 部 › 章）<select value={pane.workId||''} onChange={e=>onChange({workId:e.target.value})}>
        {!selectedExists&&pane.workId&&<option value={pane.workId}>{name}</option>}
        {available.map(w=><option key={w.id} value={w.id}>{hierarchicalLabel(w)}</option>)}
      </select></label>
      <label>表示<select value={pane.kind} onChange={e=>onChange({kind:e.target.value})}>
        {types.map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select></label>
    </div>
    <div className="parallel-pane-scroll" tabIndex={0} aria-label={`${name}の${types.find(t=>t[0]===pane.kind)?.[1]}。この領域をスクロールできます`}>
      {loadState==='loading' ? <p className="muted">読み込み中…</p> : loadState==='notfound'||loadState==='error' ? <div className="parallel-error"><p>{error||'作品を表示できません。'}</p><button className="button light small" onClick={()=>setRefresh(n=>n+1)}>再読み込み</button></div> :
        work && <>
          <div className="parallel-work-info"><div className="eyebrow">{pane.kind==='body'?'TEXT':pane.kind==='notes'?'ANNOTATIONS':'REFERENCES'}</div><h2 className="serif">{work.title}</h2><p>作者：{work.pen_name}{work.contributor_credit&&<>　／　入力・構成：{work.contributor_credit}</>}</p></div>
          {pane.kind==='body' && <>
            {work.body?.trim() ? <RichBody source={work.body} fontSize={fontSize}/>
              : !descendants.length ? <p className="muted">この作品には本文がありません。</p> : null}
            {!!descendants.length && <section className="parallel-descendants" aria-label="下位グループ・下位作品の本文">
              <h3 className="serif">下位作品の本文 <small>全{descendants.length}項目</small></h3>
              <p className="hint">公開済みの部・章・節を目次順に表示します。各作品は個別URLからも読めます。</p>
              {visibleDescendants.map(entry=>{
                const bodyRow=childWorks.find(row=>row.id===entry.id)
                return <article className="parallel-descendant" key={entry.id}>
                  <div className="parallel-descendant-title" style={{paddingLeft:Math.min(entry.depth,7)*8}}>
                    <span>{entry.node_kind==='collection'?'▣':'§'}</span>
                    <a href={`/works/${encodeURIComponent(entry.id)}`} title={entry.path}>{entry.path}</a>
                  </div>
                  {!childLoading && !childError && bodyRow?.body?.trim() && <RichBody source={bodyRow.body} fontSize={fontSize}/>} 
                </article>
              })}
              {childLoading && <p className="muted" role="status">下位作品の本文を読み込んでいます…</p>}
              {childError && <p className="parallel-error" role="alert">下位本文の読み込みに失敗しました：{childError}</p>}
              {shownDescendants < descendants.length && <button type="button" className="button light small" onClick={()=>setShownDescendants(n=>n+DESCENDANT_PAGE_SIZE)}>さらに{Math.min(DESCENDANT_PAGE_SIZE,descendants.length-shownDescendants)}項目を表示</button>}
            </section>}
          </>}
          {pane.kind==='notes' && (notes.length?notes.map(n=><article className="parallel-note" key={n.id}><div className="parallel-note-meta"><span className="pill">{n.type}</span><strong>{n.pen_name}</strong><time>{dateFmt(n.created_at)}</time></div><RichBody source={n.body} fontSize={fontSize}/></article>):<p className="muted">公開された注釈・異論はまだありません。</p>)}
          {pane.kind==='refs' && <div className="parallel-references">
            { [['作品の問い',work.question],['継承するもの',work.inheritance],['新たに試みること',work.novelty]].map(([label,value])=><section key={label}><h3>{label}</h3><p className="multiline">{value||'未記載'}</p></section>)}
            <section><h3>参考文献・関連作品</h3>{work.work_references?.length?work.work_references.map((r,i)=><div key={r.id||i} className="reference"><strong>{r.title}</strong>{r.relation&&<p>{r.relation}</p>}{safeUrl(r.url)&&<a href={safeUrl(r.url)} target="_blank" rel="noopener noreferrer">文献リンク <ArrowUpRight size={12}/></a>}</div>):<p className="muted">登録されていません。</p>}</section>
            <DescendantReferences workId={work.id} enabled={pane.kind==='refs' && work.status==='published'} />
          </div>}
        </>}
    </div>
    <div className="parallel-pane-footer">
      <button type="button" className="text-action" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={13}/> 更新</button>
      {work && <button type="button" className="text-action" onClick={()=>onOpenSingle(work.id)}><BookOpen size={13}/> 単独で読む</button>}
    </div>
  </section>
}
