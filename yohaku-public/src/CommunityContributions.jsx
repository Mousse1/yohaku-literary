import React, { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, Plus } from 'lucide-react'
import { configured, supabase, noteTypes, safeUrl, dateFmt, messageFor } from './client'
import RichBody from './RichBody'
import { normalizeReferenceUrl, validOptionalReferenceUrl } from './referenceUrl'

// Reader notes reuse the existing notes table and moderation workflow.
// Contributions are always tied to the target work, not written into its author-owned bibliography.
export function CommunityNoteForm({workId, user, onLogin, onSubmitted, compact=false}) {
  const [open,setOpen] = useState(false)
  const [name,setName] = useState('')
  const [type,setType] = useState(noteTypes[0])
  const [body,setBody] = useState('')
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  useEffect(()=>{setOpen(false);setMessage('');setBody('')},[workId])
  const submit=async e=>{
    e.preventDefault()
    if(!configured || !user){onLogin?.();return}
    if(busy)return
    setBusy(true);setMessage('')
    try{
      const {error}=await supabase.from('notes').insert({work_id:workId,author_id:user.id,pen_name:name.trim(),type,body:body.trim(),status:'pending'})
      if(error)throw error
      setBody('');setOpen(false);setMessage('注釈・異論を審査待ちとして送信しました。')
      onSubmitted?.()
    }catch(error){setMessage(messageFor(error))}finally{setBusy(false)}
  }
  if(!configured)return null
  return <div className={`community-contribution-box ${compact?'compact':''}`}>
    <button className="button light small" type="button" onClick={()=>user?setOpen(v=>!v):onLogin?.()}><Plus size={14}/> 注釈・異論を投稿</button>
    {message&&<p className="community-message" role="status">{message}</p>}
    {open&&user&&<form className="community-form" onSubmit={submit}>
      <div className="dual-controls"><label>筆名<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><label>種類<select value={type} onChange={e=>setType(e.target.value)}>{noteTypes.map(x=><option key={x} value={x}>{x}</option>)}</select></label></div>
      <label>注釈・異論<textarea required minLength={5} maxLength={2000} rows={compact?3:5} value={body} onChange={e=>setBody(e.target.value)}/></label>
      <p className="hint">5〜2,000文字。公開作品について投稿でき、管理者の承認後に公開されます。本文の書き換えは行いません。</p>
      <div className="community-form-actions"><button className="button light small" type="button" onClick={()=>setOpen(false)}>キャンセル</button><button disabled={busy} className="button primary small" type="submit">{busy?'送信中…':'審査へ提出'}</button></div>
    </form>}
  </div>
}

export function CommunityNoteList({notes=[],fontSize=16,compact=false}) {
  const readable=notes.filter(n=>n.status==='published'||n.status==='pending')
  if(!readable.length)return <p className="muted">公開された注釈・異論はまだありません。</p>
  return <div className={compact?'parallel-notes-list':'community-notes-list'}>{readable.map(n=><article className={compact?'parallel-note':'annotation'} key={n.id}>
    <div className="community-byline"><span className="pill">{n.type}</span><strong>{n.pen_name}</strong><span className="note-time">{dateFmt(n.created_at)}{n.status==='pending'?' · 審査待ち（投稿者のみ）':''}</span></div>
    <RichBody source={n.body} fontSize={fontSize}/>
  </article>)}</div>
}

export function CommunityReferences({workId,user,onLogin,compact=false,showForm=true}) {
  const [rows,setRows]=useState([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [opened,setOpened]=useState(false)
  const [name,setName]=useState('')
  const [title,setTitle]=useState('')
  const [explanation,setExplanation]=useState('')
  const [url,setUrl]=useState('')
  const [posting,setPosting]=useState(false)
  const [result,setResult]=useState('')
  const [refresh,setRefresh]=useState(0)
  const reload=useCallback(()=>setRefresh(v=>v+1),[])
  useEffect(()=>{setOpened(false);setResult('')},[workId])
  useEffect(()=>{
    let active=true
    setRows([]);setError('');setLoading(false)
    if(!configured||!workId)return ()=>{active=false}
    setLoading(true)
    ;(async()=>{
      const {data,error:loadError}=await supabase.from('community_references')
        .select('id,work_id,author_id,pen_name,title,explanation,url,status,created_at')
        .eq('work_id',workId).order('created_at',{ascending:false}).limit(200)
      if(!active)return
      if(loadError)throw loadError
      setRows((data||[]).filter(r=>r.status==='published'||(r.status==='pending'&&r.author_id===user?.id)))
    })().catch(err=>{if(active)setError(messageFor(err))}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[workId,user?.id,refresh])
  const submit=async e=>{
    e.preventDefault()
    if(!configured||!user){onLogin?.();return}
    if(posting)return
    if(!validOptionalReferenceUrl(url)){setResult('URLは任意です。入力する場合は https:// から始まる正しいURLにしてください。');return}
    setPosting(true);setResult('')
    try{
      const {error:submitError}=await supabase.from('community_references').insert({
        work_id:workId,author_id:user.id,pen_name:name.trim(),title:title.trim(),
        explanation:explanation.trim(),url:normalizeReferenceUrl(url),status:'pending'
      })
      if(submitError)throw submitError
      setTitle('');setExplanation('');setUrl('');setOpened(false)
      setResult('参考文献・解説を審査待ちとして送信しました。')
      reload()
    }catch(err){setResult(messageFor(err))}finally{setPosting(false)}
  }
  if(!configured||!workId)return null
  return <section className={`community-references ${compact?'compact':''}`} aria-label="第三者からの参考文献・解説">
    <h3>読者による参考文献・解説</h3>
    <p className="hint">作者が登録した参考文献とは別枠です。承認後に公開され、誰が提案したかを表示します。文献提案は1日20件まで、毎日0:00（日本時間）に更新します。</p>
    {loading&&<p className="muted" role="status">読み込み中…</p>}
    {error&&<p className="reference-load-error" role="alert">参考文献の読み込みに失敗しました：{error}。v6.8の追加SQLをご確認ください。</p>}
    {!loading&&!error&&!rows.length&&<p className="muted">第三者が追加した公開文献はまだありません。</p>}
    {rows.map(r=><div className="community-reference-item" key={r.id}>
      <strong>{r.title}</strong>
      <div className="community-byline">提案者：{r.pen_name} · {dateFmt(r.created_at)}{r.status==='pending'&&<span> · 審査待ち（本人のみ）</span>}</div>
      {r.explanation&&<RichBody source={r.explanation} fontSize={compact?13:14}/>}
      {safeUrl(r.url)&&<a href={safeUrl(r.url)} rel="noopener noreferrer" target="_blank">出典を開く <ArrowUpRight size={12}/></a>}
    </div>)}
    {showForm&&<div className="community-contribution-box">
      <button className="button light small" type="button" onClick={()=>user?setOpened(v=>!v):onLogin?.()}><Plus size={14}/> 参考文献・解説を追加</button>
      {result&&<p className="community-message" role="status">{result}</p>}
      {opened&&user&&<form className="community-form" onSubmit={submit}>
        <label>提案者の筆名<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>文献名・著者・資料名<input required maxLength={300} value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label>解説・関連性（5〜4,000文字）<textarea required minLength={5} maxLength={4000} rows={compact?4:6} value={explanation} onChange={e=>setExplanation(e.target.value)}/></label>
        <label>参考URL（任意・空欄で登録できます）<input type="url" maxLength={1000} value={url} onChange={e=>setUrl(e.target.value)}/></label>
        <p className="hint">パンフレット・配布資料などURLのない文献も提案できます。第三者の提案として審査後に公開され、作者の文献20件枠には含めません。</p>
        <div className="community-form-actions"><button className="button light small" type="button" onClick={()=>setOpened(false)}>キャンセル</button><button disabled={posting} className="button primary small" type="submit">{posting?'送信中…':'審査へ提出'}</button></div>
      </form>}
    </div>}
  </section>
}
