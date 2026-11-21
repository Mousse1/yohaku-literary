import {decodeGenres} from './classifications.js'

export const isScreenplay = work => work?.section==='文学' && decodeGenres(work.genre).includes('戯曲／脚本')
const castPattern=/^:::登場人物\r?\n([\s\S]*?)\r?\n:::(?:\r?\n|$)/
export const validCharacter = name => typeof name==='string' && name.trim()===name && name.length>0 && name.length<=40 && !/[\r\n：:<>\[\]`*_~\\$]/.test(name)
export function screenplayDocument(source='') {
  const match=String(source).match(castPattern)
  return {characters:[...new Set((match?.[1]||'').split(/\r?\n/).filter(validCharacter))].slice(0,100),text:match?source.slice(match[0].length):String(source)}
}
export function setCharacters(source,characters) {
  const names=[...new Set(characters.filter(validCharacter))].slice(0,100)
  return (names.length?`:::登場人物\n${names.join('\n')}\n:::\n\n`:'')+screenplayDocument(source).text.replace(/^\n/,'')
}
export function screenplayLine(text,characters) {
  const line=text.trim()
  for(const name of [...characters].sort((a,b)=>b.length-a.length)) {
    for(const separator of ['：',': '])if(line.startsWith(name+separator))return {type:'dialogue',name,prefix:line.indexOf(separator)+separator.length}
  }
  if(/^[（(].*[）)]$/.test(line))return {type:'direction'}
  return {type:'prose'}
}

// Run after remark-breaks. Only ordinary top-level paragraphs are styled;
// code, equations, lists and quotes retain their Markdown structure.
export function remarkScreenplay({characters=[]}={}) {
  return tree=>{
    tree.children=tree.children.flatMap(node=>{
      if(node.type!=='paragraph')return [node]
      const lines=[[]]
      for(const child of node.children)child.type==='break'?lines.push([]):lines.at(-1).push(child)
      return lines.filter(line=>line.length).map(children=>{
        const text=children.map(n=>n.type==='text'?n.value:'').join('')
        const kind=screenplayLine(text,characters)
        if(kind.type==='dialogue' && children[0]?.type==='text'){
          const first=children[0].value
          const leading=first.length-first.trimStart().length
          children=[{type:'strong',data:{hProperties:{className:['screenplay-speaker']}},children:[{type:'text',value:kind.name}]},{...children[0],value:first.slice(leading+kind.prefix).trimStart()},...children.slice(1)]
        }
        return {type:'paragraph',children,data:{hProperties:{className:[`screenplay-${kind.type}`]}}}
      })
    })
  }
}

export const screenplayCss='.screenplay-dialogue{display:grid;grid-template-columns:7em minmax(0,1fr);gap:1em;align-items:baseline;margin:.65em 0;white-space:pre-wrap}.screenplay-speaker{font-weight:600;overflow-wrap:anywhere}.screenplay-direction{margin:.7em 0 .7em 2em;color:#6b6258;font-size:.92em;white-space:pre-wrap}.screenplay-prose{margin:.8em 0;white-space:pre-wrap}.screenplay-cast{margin:1em 0;padding:.8em;border-left:2px solid #c7bcad}.screenplay-cast h3{font-size:1em;margin:0 0 .4em}.screenplay-cast p{margin:0}'

export function screenplayHtml(source,renderText) {
  const {characters,text}=screenplayDocument(source)
  const cast=characters.length?`<aside class="screenplay-cast"><h3>登場人物</h3><p>${characters.map(renderText).join(' ／ ')}</p></aside>`:''
  return cast+text.split(/\r?\n/).map(line=>{
    const kind=screenplayLine(line,characters)
    return kind.type==='dialogue'?`<div class="screenplay-dialogue"><strong class="screenplay-speaker">${renderText(kind.name)}</strong><span>${renderText(line.trim().slice(kind.prefix).trimStart())}</span></div>`:`<div class="screenplay-${kind.type}">${line?renderText(line):'<br>'}</div>`
  }).join('')
}
