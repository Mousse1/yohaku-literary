import React,{useState} from 'react'
import {noteLinks,noteHeadings,registerNoteLink,removeNoteLink} from './noteLinks'

export default function NoteLinkEditor({source,parentId,works=[],onChange}) {
  const [label,setLabel]=useState('[資料1]'),[target,setTarget]=useState(''),[heading,setHeading]=useState(''),[message,setMessage]=useState('')
  const candidates=works.filter(w=>w.parent_work_id===parentId&&w.node_kind!=='collection')
  const selected=candidates.find(w=>w.id===target)
  const links=noteLinks(source)
  return <details className="note-link-editor"><summary>本文の注記を「注釈・補足」につなぐ</summary>
    <p className="hint">同じグループの「注釈・補足」などを選びます。本文中の同じ表記を押すと、並べて読む画面でリンク先が開きます。太字の中の注記にも対応します。太字にする「**」は登録欄に入力しなくても構いません。</p>
    <label>本文中の注記（表記をそのまま入力）<input maxLength={60} value={label} onChange={e=>setLabel(e.target.value)} placeholder="[資料1]、【注A】、※1 など"/></label>
    <label>リンク先<select value={selected?target:''} onChange={e=>{setTarget(e.target.value);setHeading('')}}><option value="">選択してください</option>{candidates.map(w=><option key={w.id} value={w.id}>{w.title}{['open','published'].includes(w.status)?'':'（未公開）'}</option>)}</select></label>
    <label>リンク先の見出し<select value={heading} onChange={e=>setHeading(e.target.value)}><option value="">本文の先頭</option>{noteHeadings(selected?.body).map(h=><option key={h}>{h}</option>)}</select></label>
    <button type="button" className="button light small" disabled={!selected||!label.trim()} onClick={()=>{
      try{const next=registerNoteLink(source,{label:label.trim(),workId:target,heading});if(next.length>200000)throw Error('本文の文字数上限を超えます。');onChange(next);setMessage('登録しました。本文に同じ表記を入力してください。')}catch(e){setMessage(e.message)}
    }}>注釈リンクを登録・更新</button>
    <ul>{links.map(link=><li key={link.label}>{link.label} → {works.find(w=>w.id===link.workId)?.title||'登録した作品'} <button type="button" className="text-action" onClick={()=>onChange(removeNoteLink(source,link))}>解除</button></li>)}</ul>
    {!candidates.length&&<p className="hint">リンク先を同じグループ内に作成してから、編集画面を開き直してください。</p>}
    <p className="hint">細かい位置へ移動したい場合は、リンク先に「## [資料1]」などの見出しを作って選択してください。リンク先が非公開・下書きの場合、読者には開けません。</p>
    {message&&<p role="status">{message}</p>}
  </details>
}
