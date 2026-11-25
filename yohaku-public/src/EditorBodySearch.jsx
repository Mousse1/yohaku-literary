import React,{useEffect,useMemo,useRef,useState} from 'react'
import {findBodyMatches,revealBodyMatch} from './editorSearch.js'

export default function EditorBodySearch({body,editorRef}) {
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState(-1);
  const input=useRef(null);
  const matches=useMemo(()=>findBodyMatches(body,query),[body,query]);
  useEffect(()=>setSelected(-1),[body,query]);
  useEffect(()=>{
    const editor=editorRef.current;
    const onKey=event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){
        event.preventDefault();
        const text=editor.value.slice(editor.selectionStart,editor.selectionEnd);
        if(text)setQuery(text);
        input.current?.focus();input.current?.select();
      }
    };
    editor?.addEventListener('keydown',onKey);
    return()=>editor?.removeEventListener('keydown',onKey);
  },[editorRef]);
  function jump(direction) {
    if(!matches.length)return;
    const next=selected<0?(direction<0?matches.length-1:0):(selected+direction+matches.length)%matches.length;
    setSelected(next);
    revealBodyMatch(editorRef.current,matches[next],query.length);
  }
  return <div className="editor-body-search" role="search" aria-label="編集中の本文を検索">
    <label>本文内を検索<input ref={input} type="search" value={query} placeholder="探したい文章を入力" onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{
      if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();jump(e.shiftKey?-1:1)}
    }}/></label>
    <div className="editor-search-actions">
      <button type="button" className="button light small" disabled={!matches.length} onClick={()=>jump(-1)}>前へ</button>
      <button type="button" className="button light small" disabled={!matches.length} onClick={()=>jump(1)}>次へ</button>
      <span className="hint" role="status" aria-live="polite">{!query?'Enterで次へ・Shift＋Enterで前へ':!matches.length?'見つかりません':selected<0?matches.length+'件':(selected+1)+' / '+matches.length+'件'}</span>
    </div>
  </div>
}
