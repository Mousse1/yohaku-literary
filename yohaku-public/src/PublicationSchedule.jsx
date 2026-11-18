import React,{useState} from 'react'
import {supabase,messageFor} from './client'
import {jstDateInput,scheduledInstant} from './publicationSchedule.js'

export default function PublicationSchedule({work,onSaved,disabled=false}) {
  const [date,setDate]=useState(()=>jstDateInput(work.scheduled_publish_at))
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function save(cancel=false) {
    setError('');setBusy(true)
    try {
      const instant=cancel?null:scheduledInstant(date)
      const {error}=await supabase.rpc('schedule_my_work',{p_work_id:work.id,p_publish_at:instant})
      if(error) throw error
      await onSaved()
    } catch(error){setError(messageFor(error))} finally {setBusy(false)}
  }
  return <details className="publication-schedule">
    <summary>{work.scheduled_publish_at?'予約 '+jstDateInput(work.scheduled_publish_at).replace('T',' ')+'（日本時間）':'公開日時を予約'}</summary>
    <label>公開日時（日本時間）<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} disabled={busy||disabled}/></label>
    <p className="hint">1年後などの日時も指定できます。予約すると公開まで非公開になります。審査付き作品は承認後、親グループが公開されてから公開されます。</p>
    <button type="button" className="button small" disabled={busy||disabled||!date} onClick={()=>save()}>予約を保存</button>
    {work.scheduled_publish_at&&<button type="button" className="button small" disabled={busy||disabled} onClick={()=>save(true)}>予約を取り消して非公開にする</button>}
    {error&&<p role="alert">{error}</p>}
  </details>
}
