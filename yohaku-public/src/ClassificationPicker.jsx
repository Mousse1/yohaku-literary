import React, {useEffect,useState,useCallback} from 'react'
import {configured,supabase,messageFor} from './client'
import {builtInClassifications,classificationTree,decodeGenres,encodeGenres} from './classifications.js'

export function useClassificationCatalog() {
  const [tree,setTree]=useState(builtInClassifications)
  const [error,setError]=useState('')
  const reload=useCallback(async()=>{
    if(!configured)return
    try{
      const {data,error}=await supabase.from('work_classifications').select('section,name,is_legacy').order('name',{ascending:true})
      if(error)throw error
      setTree(classificationTree(data||[]));setError('')
    }catch(error){setError(messageFor(error))}
  },[])
  useEffect(()=>{reload();window.addEventListener('focus',reload);window.addEventListener('yohaku:classifications-updated',reload);return()=>{window.removeEventListener('focus',reload);window.removeEventListener('yohaku:classifications-updated',reload)}},[reload])
  return {tree,error,reload}
}
export function ClassificationPicker({section,value,onChange,user}) {
  const {tree,error}=useClassificationCatalog()
  const [name,setName]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const selected=decodeGenres(value)
  const options=[...new Set([...(tree[section]||[]),...selected])]
  const toggle=name=>onChange(encodeGenres(selected.includes(name)?selected.filter(x=>x!==name):[...selected,name]))
  async function propose(){
    if(busy)return
    if(!user){setMessage('分類の申請にはログインしてください。');return}
    if(!name.trim()){setMessage('希望する小分類名を入力してください。');return}
    setBusy(true);setMessage('')
    try{
      const {error}=await supabase.rpc('propose_work_classification',{p_section:section,p_name:name.trim(),p_reason:reason.trim()})
      if(error)throw error
      setName('');setReason('');setMessage('申請しました。管理者の承認後、全員の選択肢に追加されます。')
    }catch(error){setMessage(messageFor(error))}finally{setBusy(false)}
  }
  return <fieldset className="classification-picker"><legend>小分類（複数選択可・未選択可）</legend>
    <div className="classification-options">{options.map(name=><label key={name}><input type="checkbox" checked={selected.includes(name)} onChange={()=>toggle(name)}/><span>{name}</span></label>)}</div>
    <button type="button" className="text-action" disabled={!selected.length} onClick={()=>onChange('[]')}>選択をすべて外す</button>
    <p className="hint">選ばなくても保存・公開できます。複数選んだ場合は、どの小分類からも作品を探せます。</p>
    {error&&<p role="alert" className="hint">分類一覧を取得できませんでした。更新用SQLの適用と接続を確認してください。</p>}
    <details className="classification-proposal"><summary>欲しい小分類がない場合は申請する</summary>
      <label>希望する小分類名<input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label>説明・追加を希望する理由（任意）<textarea maxLength={500} rows={2} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button type="button" className="button light small" disabled={busy||Boolean(error)} onClick={propose}>管理者に追加を申請</button>
    </details>
    {message&&<p role="status">{message}</p>}
  </fieldset>
}

export function ClassificationModeration() {
  const [rows,setRows]=useState([]),[notes,setNotes]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const reload=useCallback(async()=>{
    const {data,error}=await supabase.from('classification_requests').select('id,section,name,reason,created_at').eq('status','pending').order('created_at',{ascending:true})
    if(error){setError(messageFor(error));return}setRows(data||[]);setError('')
  },[])
  useEffect(()=>{reload()},[reload])
  async function review(id,approve){
    if(busy)return
    setBusy(true);setError('')
    try{
      const {error}=await supabase.rpc('review_work_classification',{p_request_id:id,p_approve:approve,p_note:notes[id]||''})
      if(error)throw error
      await reload();window.dispatchEvent(new Event('yohaku:classifications-updated'))
    }catch(error){setError(messageFor(error))}finally{setBusy(false)}
  }
  return <section className="admin-row"><h2>新しい小分類の申請 <span>{rows.length}</span></h2>
    {error&&<p role="alert">{error}</p>}{!rows.length&&!error&&<p className="muted">審査待ちの申請はありません。</p>}
    {rows.map(row=><article className="moderation-item" key={row.id}><div><strong>{row.section} / {row.name}</strong><p>{row.reason||'説明なし'}</p><label>審査コメント（任意）<input maxLength={500} value={notes[row.id]||''} onChange={e=>setNotes(old=>({...old,[row.id]:e.target.value}))}/></label></div><div className="buttons"><button type="button" className="button primary small" disabled={busy} onClick={()=>review(row.id,true)}>承認して全員に追加</button><button type="button" className="button light small" disabled={busy} onClick={()=>review(row.id,false)}>却下</button></div></article>)}
  </section>
}
