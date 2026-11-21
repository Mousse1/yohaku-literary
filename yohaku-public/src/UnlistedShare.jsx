import React,{useEffect,useState} from 'react'
import {supabase,messageFor} from './client'

export default function UnlistedShare({work,onSaved,disabled}) {
  const [token,setToken]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    setToken(null)
    if(work.owner_unlisted) supabase.rpc('get_my_work_share',{p_work_id:work.id}).then(({data,error})=>{
      if(active){setToken(data);if(error)setError(messageFor(error))}
    })
    return()=>{active=false}
  },[work.id,work.owner_unlisted])
  async function enable(){
    setBusy(true);setError('')
    try {
      const {data,error}=await supabase.rpc('set_my_work_unlisted',{p_work_id:work.id})
      if(error)throw error
      setToken(data)
      await onSaved()
    } catch(error){setError(messageFor(error))} finally {setBusy(false)}
  }
  const url=token?window.location.origin+'/share/'+token:null
  return <div className="unlisted-share">
    {!work.owner_unlisted&&<button type="button" className="text-action" disabled={disabled||busy} onClick={enable}>限定公開にする</button>}
    {url&&<details><summary>限定公開URL・ファイル共有</summary>
      <input aria-label="限定公開URL" readOnly value={url} onFocus={e=>e.target.select()}/>
      <a href={url} target="_blank" rel="noopener noreferrer">限定公開ページを開く</a>{' ／ '}
      <a href={url+'/print'} target="_blank" rel="noopener noreferrer">PDF印刷</a>{' ／ '}
      <a href={url+'.md'}>Markdownを保存</a>{' ／ '}<a href={url+'.txt'}>テキストを保存</a>
      <p className="hint">このURLを知っている人が閲覧・保存できます。配下の公開可能な作品を含みます。個別に非公開・限定公開・予約中の作品は含みません。</p>
    </details>}
    {error&&<p role="alert">{error}</p>}
  </div>
}
