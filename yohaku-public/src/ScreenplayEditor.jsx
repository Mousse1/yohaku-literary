import React,{useState} from 'react'
import {screenplayDocument,setCharacters,validCharacter} from './screenplay'

export default function ScreenplayEditor({source,onChange,onInsert}) {
  const {characters}=screenplayDocument(source)
  const [name,setName]=useState(''),[speaker,setSpeaker]=useState(''),[dialogue,setDialogue]=useState(''),[message,setMessage]=useState('')
  const selected=characters.includes(speaker)?speaker:characters[0]||''
  const register=()=>{
    const value=name.trim()
    if(!validCharacter(value)){setMessage('名前は40文字以内で、改行やコロンなどを使わずに入力してください。');return}
    if(characters.includes(value)||characters.length>=100){setMessage('登録済み、または登場人物が100人に達しています。');return}
    const next=setCharacters(source,[...characters,value])
    if(next.length>200000){setMessage('本文の文字数上限を超えます。');return}
    onChange(next);setSpeaker(value);setName('');setMessage('')
  }
  return <section className="screenplay-editor"><h3>登場人物と台詞</h3>
    <div className="two-col"><label>登場人物の名前<input maxLength={40} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();register()}}} value={name} onChange={e=>setName(e.target.value)}/></label><div><button type="button" className="button light small" onClick={register}>名前を登録</button></div></div>
    <p className="hint">登録した名前は本文冒頭の「登場人物」欄に保存されます。名前を削除しても、挿入済みの台詞は残ります。</p>
    <ul>{characters.map(character=><li key={character}>{character} <button type="button" className="text-action" onClick={()=>onChange(setCharacters(source,characters.filter(n=>n!==character)))}>登録を外す</button></li>)}</ul>
    <label>話す人<select value={selected} onChange={e=>setSpeaker(e.target.value)}><option value="">選択してください</option>{characters.map(n=><option key={n}>{n}</option>)}</select></label>
    <label>台詞<textarea rows={2} value={dialogue} onChange={e=>setDialogue(e.target.value)}/></label>
    <button type="button" className="button light small" disabled={!selected||!dialogue.trim()} onClick={()=>{onInsert(`\n\n${selected}：${dialogue.trim().replace(/\r?\n/g,`\n${selected}：`)}\n\n`);setDialogue('')}}>本文のカーソル位置に台詞を挿入</button>
    <p className="hint">台詞は「名前：台詞」として挿入されます。「（窓を開ける）」のような行はト書き、それ以外は通常の地の文になります。本文へ直接書くこともできます。</p>
    {message&&<p role="status">{message}</p>}
  </section>
}
