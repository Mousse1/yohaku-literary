import React from 'react'
import {readingNeighbors} from './readingNeighbors'

export default function ReadingNavigation({work,nodes=[],onOpen}) {
  const {previous,next}=readingNeighbors(nodes,work)
  if(!previous&&!next)return null
  const step=(item,label,direction)=>item?<a className={`reading-step ${direction}`} href={`/works/${encodeURIComponent(item.id)}`} rel={direction==='previous'?'prev':'next'} aria-label={`${label}：${item.title||'本文'}`} onClick={event=>{
    if(onOpen&&!event.defaultPrevented&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onOpen(item.id)}
  }}><span>{direction==='previous'?'← ':''}{label}{direction==='next'?' →':''}</span><strong>{item.title||'本文'}</strong></a>:<span className={`reading-step is-disabled ${direction}`} aria-disabled="true"><span>{label}</span><small>{direction==='previous'?'最初の項目です':'最後の項目です'}</small></span>
  return <nav className="reading-navigation" aria-label="前後の章・話へ移動">{step(previous,'前を読む','previous')}{step(next,'次を読む','next')}</nav>
}
