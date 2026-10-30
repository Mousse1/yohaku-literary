// Inline editorial note references: 本文*1 -> 本文<sup>*1</sup>.
// Shared by React Markdown and the initial, server-rendered public HTML.
// Neither Supabase records nor JSON API responses are rewritten.
const START = '\uE000'
const END = '\uE001'
const markerExpression = /\uE000([1-9][0-9]{0,5})\uE001/g

// Split into prose and note markers. Respect Markdown fenced/indented code,
// inline backticks, math delimiters, escaped asterisks and ordinary **bold**.
export function annotationSegments(source) {
  const input = String(source ?? '')
  const pieces = []
  let text = ''
  let fence = null
  let codeTicks = 0
  let mathDollars = 0
  let linkDestinationDepth = 0
  let inAutolink = false
  const flush = () => { if (text) { pieces.push({type:'text',value:text});text='' } }
  const lines = input.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? []
  for (const line of lines) {
    const content=line.replace(/\r?\n$|\r$/, '')
    const leading=content.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (fence) {
      text += line
      if (leading && leading[1][0]===fence.char && leading[1].length>=fence.size && /^\s*$/.test(leading[2])) fence=null
      continue
    }
    if (!codeTicks && !mathDollars && leading) {
      fence={char:leading[1][0],size:leading[1].length}
      text+=line
      continue
    }
    if (!codeTicks && !mathDollars && /^(?: {4,}|\t)/.test(content)) {
      text+=line
      continue
    }
    for (let i=0;i<line.length;) {
      const ch=line[i]
      // A Markdown escape must not turn into a note marker.
      if (ch==='\\' && i+1<line.length) {text+=line.slice(i,i+2);i+=2;continue}
      // Keep literal URL destinations and angle autolinks unmodified.
      if (linkDestinationDepth) {
        if(ch==='(')linkDestinationDepth++
        if(ch===')')linkDestinationDepth--
        text+=ch;i++;continue
      }
      if (inAutolink) {
        if(ch==='>')inAutolink=false
        text+=ch;i++;continue
      }
      if (!codeTicks && !mathDollars && ch===']' && line[i+1]==='(') {
        linkDestinationDepth=1;text+='](';i+=2;continue
      }
      if (!codeTicks && !mathDollars && ch==='<' && /^(?:https?:\/\/|mailto:)/i.test(line.slice(i+1))) {
        inAutolink=true;text+=ch;i++;continue
      }
      if (ch==='`' && !mathDollars) {
        let end=i+1
        while(line[end]==='`')end++
        const run=end-i
        if (!codeTicks) codeTicks=run
        else if (codeTicks===run) codeTicks=0
        text+=line.slice(i,end);i=end;continue
      }
      if (ch==='$' && !codeTicks) {
        const run=line[i+1]==='$'?2:1
        // An unmatched dollar sign (e.g. a price) is prose, not inline math.
        if (!mathDollars && run===1 && !line.slice(i+1).includes('$')) {text+=ch;i++;continue}
        if (!mathDollars)mathDollars=run
        else if (mathDollars===run)mathDollars=0
        text+=line.slice(i,i+run);i+=run;continue
      }
      if (!codeTicks && !mathDollars && ch==='*' && line[i-1]!=='*' && !/[0-9]/.test(line[i-1]||'') && line[i+1]!=='*') {
        const found=/^\*([1-9][0-9]{0,5})(?![0-9*])/.exec(line.slice(i))
        if(found){flush();pieces.push({type:'marker',number:found[1]});i+=found[0].length;continue}
      }
      text+=ch;i++
    }
  }
  flush()
  return pieces
}

// Use private-use delimiters so Markdown's emphasis parser never interprets
// the asterisks belonging to two nearby note references as *italic*.
export function prepareAnnotationSource(source) {
  return annotationSegments(source).map(p=>p.type==='marker'?START+p.number+END:p.value).join('')
}

// Remark transformer (no extra dependency). Convert only our reserved tokens,
// leaving literal code, math and ordinary Markdown formatting untouched.
export function remarkAnnotationMarkers() {
  return tree => {
    const visit = node => {
      if (!Array.isArray(node.children)) return
      for (let i=0;i<node.children.length;i++) {
        const child=node.children[i]
        if (child.type==='text' && child.value.includes(START)) {
          const parts=[]
          let last=0
          markerExpression.lastIndex=0
          for (const match of child.value.matchAll(markerExpression)) {
            if(match.index>last)parts.push({type:'text',value:child.value.slice(last,match.index)})
            parts.push({
              type:'emphasis',
              data:{hName:'sup',hProperties:{className:['annotation-marker'],'aria-label':`注釈 ${match[1]}`}},
              children:[{type:'text',value:'*'+match[1]}]
            })
            last=match.index+match[0].length
          }
          if (last) {
            if(last<child.value.length)parts.push({type:'text',value:child.value.slice(last)})
            node.children.splice(i,1,...parts)
            i+=parts.length-1
            continue
          }
        }
        if (child.type!=='inlineCode' && child.type!=='code' && child.type!=='inlineMath' && child.type!=='math')visit(child)
      }
    }
    visit(tree)
  }
}

export function renderAnnotatedPlainText(source, escapeHtml) {
  return annotationSegments(source).map(part=>part.type==='marker'
    ? `<sup class="annotation-marker" aria-label="注釈 ${part.number}" style="font-size:.7em;vertical-align:super;line-height:0">*${part.number}</sup>`
    : escapeHtml(part.value)
  ).join('')
}
