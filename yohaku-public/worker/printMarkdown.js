import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server.edge'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkBreaks from 'remark-breaks'
import rehypeKatex from 'rehype-katex'
import {preserveParagraphIndentation} from '../src/bodyWhitespace.js'
import {prepareAnnotationSource,remarkAnnotationMarkers} from '../src/annotationMarkers.js'
import {remarkParagraphSpacing} from '../src/paragraphSpacing.js'
import {noteLinks,remarkNoteLinks} from '../src/noteLinks.js'
import {isScreenplay,screenplayDocument,remarkScreenplay} from '../src/screenplay.js'

function remarkPrintDestinations({scope,origin,included}) {
  return tree=>{
    const visit=node=>{
      if(node.data?.hProperties?.id)node.data.hProperties.id=scope+'-'+node.data.hProperties.id
      if(node.type==='link'){
        const target=/^\/works\/([0-9a-f-]{36})(?:#(note-[0-9a-f-]+))?$/i.exec(node.url||'')
        if(target)node.url=included.has(target[1])?(target[2]?'#'+target[1]+'-'+target[2]:'#work-'+target[1]):origin+node.url
      }
      for(const child of node.children||[])visit(child)
    }
    visit(tree)
  }
}

// The print route renders Markdown on the server, using the same annotation,
// paragraph and screenplay rules as the reader. No submitted HTML is executed.
export function renderPrintMarkdown(source,{work={},origin='',included=new Set()}={}) {
  const script=isScreenplay(work)
  const {characters,text}=script?screenplayDocument(source):{characters:[],text:String(source||'')}
  const plugins=[remarkGfm,remarkMath,remarkBreaks,[remarkAnnotationMarkers,{interactive:false}],remarkParagraphSpacing,[remarkNoteLinks,{links:noteLinks(source)}],
    ...(script?[[remarkScreenplay,{characters}]]:[]),[remarkPrintDestinations,{scope:work.id||'text',origin,included}]]
  const rendered=React.createElement(Markdown,{
    remarkPlugins:plugins,
    // Native MathML keeps mathematics self-contained in the saved PDF.
    rehypePlugins:[[rehypeKatex,{output:'mathml',trust:false,strict:'ignore',throwOnError:false,maxExpand:1000}]],
    skipHtml:true,
    components:{img:({alt})=>React.createElement('span',{className:'print-image-description'},alt?'［画像：'+alt+'］':'［画像］')},
  },prepareAnnotationSource(preserveParagraphIndentation(text)))
  return renderToStaticMarkup(React.createElement('div',{className:'print-markdown'},
    script&&characters.length?React.createElement('aside',{className:'screenplay-cast'},React.createElement('h3',null,'登場人物'),React.createElement('p',null,characters.join(' ／ '))):null,
    rendered))
}

export const printMarkdownCss=`
.print-markdown{line-height:1.6;overflow-wrap:anywhere}
.print-markdown p{white-space:pre-wrap;margin:9pt 0;orphans:3;widows:3}
.export-record .print-markdown h1{font-size:18pt}.export-record .print-markdown h2{font-size:16pt}.export-record .print-markdown h3{font-size:14pt}
.export-record .print-markdown h4,.export-record .print-markdown h5,.export-record .print-markdown h6{font-size:12pt}
.print-markdown h1,.print-markdown h2,.print-markdown h3,.print-markdown h4,.print-markdown h5,.print-markdown h6{margin:16pt 0 7pt;line-height:1.45;break-after:avoid-page}
.print-markdown ul,.print-markdown ol{padding-left:1.5em;margin:8pt 0}.print-markdown li{padding-left:.15em}
.print-markdown blockquote{border-left:2pt solid #c8beb1;margin:10pt 0;padding:1pt 0 1pt 14pt;color:#554d44}
.print-markdown pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f1eb;padding:9pt;font-size:10pt;line-height:1.5}
.print-markdown code{font-family:Consolas,monospace}.print-markdown :not(pre)>code{background:#f4f1eb;padding:1pt 3pt}
.print-markdown table{border-collapse:collapse;width:100%;table-layout:fixed;margin:10pt 0;font-size:10pt}
.print-markdown th,.print-markdown td{border:1px solid #c8beb1;padding:5pt;overflow-wrap:anywhere}.print-markdown tr{break-inside:avoid-page}
.print-markdown hr{border:0;border-top:1px solid #c8beb1;margin:16pt 0}.print-markdown a{color:#654a3b}
.print-markdown math[display="block"]{margin:12pt 0;overflow-wrap:anywhere}
.print-markdown .body-paragraph-gap-3{margin-bottom:1.5em}.print-markdown .body-paragraph-gap-4{margin-bottom:2em}
.print-markdown .body-paragraph-gap-5{margin-bottom:2.5em}.print-markdown .body-paragraph-gap-6{margin-bottom:3em}
.print-markdown .body-paragraph-gap-7{margin-bottom:3.5em}.print-markdown .body-paragraph-gap-8{margin-bottom:4em}
`
