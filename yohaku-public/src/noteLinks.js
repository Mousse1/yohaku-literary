const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const definition=/^\[yohaku-note-([1-9][0-9]*)\]: \/works\/([0-9a-f-]{36})(?:#(note-[0-9a-f-]+))? ("(?:[^"\\]|\\.)*")\s*$/i
export const plainHeading=value=>String(value||'').replace(/\*\*|__|`/g,'').replace(/\s+#+\s*$/,'').trim()
export const noteAnchor=value=>'note-'+Array.from(plainHeading(value)).map(c=>c.codePointAt(0).toString(16)).join('-')
export const validNoteLabel=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=60&&!/[\r\n\u0000-\u001f\uE000\uE001]/.test(value)
export function noteLinks(source='') {
  const links=[];let fence=null
  for(const line of String(source).split(/\r?\n/)){
    const code=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if(fence){if(code&&code[1][0]===fence[0]&&code[1].length>=fence.length&&!code[2].trim())fence=null;continue}
    if(code){fence=code[1];continue}
    const m=definition.exec(line);if(!m||!uuid.test(m[2]))continue
    let label;try{label=JSON.parse(m[4])}catch{continue}
    if(!validNoteLabel(label)||links.some(l=>l.label===label)||links.length>=100)continue
    links.push({label,workId:m[2],anchor:m[3]||'',key:Number(m[1]),line,url:`/works/${m[2]}${m[3]?'#'+m[3]:''}`})
  }
  return links
}
export function registerNoteLink(source,{label,workId,heading=''}) {
  label=String(label||'').replace(/^\*\*(.+)\*\*$/,'$1')
  if(!validNoteLabel(label)||!uuid.test(workId))throw Error('注記とリンク先を確認してください。')
  const links=noteLinks(source),old=links.find(l=>l.label===label)
  if(!old&&links.length>=100)throw Error('注釈リンクは100件まで登録できます。')
  const key=old?.key||Math.max(0,...links.map(l=>l.key))+1
  const line=`[yohaku-note-${key}]: /works/${workId}${heading?'#'+noteAnchor(heading):''} ${JSON.stringify(label)}`
  return old?source.replace(old.line,line):source.trimEnd()+'\n\n'+line+'\n'
}
export const removeNoteLink=(source,link)=>source.split(/\r?\n/).filter(line=>line!==link.line).join('\n')
export function noteHeadings(source) {
  let fence=null;const result=[]
  for(const line of String(source||'').split(/\r?\n/)){
    const code=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if(fence){if(code&&code[1][0]===fence[0]&&code[1].length>=fence.length&&!code[2].trim())fence=null;continue}
    if(code){fence=code[1];continue}
    const match=/^ {0,3}#{1,6}\s+(.+)$/.exec(line)
    if(match){const label=plainHeading(match[1]);if(label&&!result.includes(label))result.push(label)}
  }
  return result
}
export function remarkNoteLinks({links=[]}={}) {
  return tree=>{
    const seen=new Set()
    const visit=node=>{
      if(node.data?.hName==='button')return
      if(['link','linkReference','image','imageReference','code','inlineCode','math','inlineMath','html'].includes(node.type))return
      if(node.type==='heading'){
        const text=n=>n.value||n.children?.map(text).join('')||''
        const id=noteAnchor(text(node))
        if(!seen.has(id)){node.data||={};node.data.hProperties={...node.data.hProperties,id,tabIndex:-1};seen.add(id)}
      }
      if(!node.children)return
      node.children=node.children.flatMap(child=>{
        if(child.type!=='text'){visit(child);return [child]}
        const parts=[];let remaining=child.value
        while(remaining){
          let chosen=null,index=Infinity
          for(const link of links){const at=remaining.indexOf(link.label);if(at>=0&&(at<index||(at===index&&link.label.length>chosen.label.length))){chosen=link;index=at}}
          if(!chosen){parts.push({type:'text',value:remaining});break}
          if(index)parts.push({type:'text',value:remaining.slice(0,index)})
          parts.push({type:'link',url:chosen.url,data:{hProperties:{className:['annotation-jump','note-link'],'data-note-work-id':chosen.workId,'data-note-anchor':chosen.anchor,'data-note-label':chosen.label}},children:[{type:'text',value:chosen.label}]})
          remaining=remaining.slice(index+chosen.label.length)
        }
        return parts
      })
    }
    visit(tree)
  }
}

// Plain-text server/export counterpart; never turn code, LaTeX, escaped text
// or an existing Markdown link destination into a note link.
export function noteLinkSegments(source='',providedLinks=null) {
  const links=providedLinks||noteLinks(source),definitions=new Set(links.map(l=>l.line)),pieces=[]
  const ordered=[...links].sort((a,b)=>b.label.length-a.label.length)
  let text='',fence=null,ticks=0,math=0
  const flush=()=>{if(text){pieces.push({type:'text',value:text});text=''}}
  for(const line of String(source).match(/[^\n]*(?:\n|$)/g).filter(Boolean)){
    if(definitions.has(line.replace(/\r?\n$/,'')))continue
    const code=line.match(/^ {0,3}(`{3,}|~{3,})(.*)/)
    if(fence){text+=line;if(code&&code[1][0]===fence[0]&&code[1].length>=fence.length&&!code[2].trim())fence=null;continue}
    if(!ticks&&!math&&code){fence=code[1];text+=line;continue}
    if(!ticks&&!math&&/^(?: {4}|\t)/.test(line)){text+=line;continue}
    for(let i=0;i<line.length;){
      const ch=line[i]
      if(ch==='\\'&&i+1<line.length){text+=line.slice(i,i+2);i+=2;continue}
      if(ch==='`'&&!math){let end=i+1;while(line[end]==='`')end++;const count=end-i;if(!ticks)ticks=count;else if(ticks===count)ticks=0;text+=line.slice(i,end);i=end;continue}
      if(ch==='$'&&!ticks){const count=line[i+1]==='$'?2:1;if(math===count)math=0;else if(!math&&(count===2||line.slice(i+1).includes('$')))math=count;text+=line.slice(i,i+count);i+=count;continue}
      if(!ticks&&!math){
        const existing=/^!?\[[^\]\n]*\](?:\([^\n]*?\)|\[[^\]\n]*\])|^<https?:\/\/[^>]*>|^https?:\/\/[^\s]+/.exec(line.slice(i))
        if(existing){text+=existing[0];i+=existing[0].length;continue}
        const link=ordered.find(l=>line.startsWith(l.label,i))
        if(link){flush();pieces.push({type:'link',link});i+=link.label.length;continue}
      }
      text+=ch;i++
    }
  }
  flush();return pieces
}
export function renderNoteHtml(source,renderText,linkUrl=link=>link.url,scope='',providedLinks=null) {
  const known=new Set(noteHeadings(source)),seen=new Set()
  const text=value=>value.split(/(\n)/).map(line=>{
    const match=/^ {0,3}#{1,6}\s+(.+)$/.exec(line)
    const heading=match?plainHeading(match[1]):''
    const anchor=heading&&known.has(heading)?scope+noteAnchor(heading):''
    const prefix=anchor&&!seen.has(anchor)?`<span id="${anchor}" tabindex="-1"></span>`:''
    if(anchor)seen.add(anchor)
    return prefix+renderText(line)
  }).join('')
  return noteLinkSegments(source,providedLinks).map(p=>p.type==='link'?`<a class="note-link" href="${linkUrl(p.link)}">${renderText(p.link.label)}</a>`:text(p.value)).join('')
}
