import {screenplayDocument,remarkScreenplay} from './screenplay'
import React, { useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { preserveParagraphIndentation } from './bodyWhitespace'
import { prepareAnnotationSource, remarkAnnotationMarkers } from './annotationMarkers'
import { remarkParagraphSpacing } from './paragraphSpacing'

// HTML in submitted Markdown is not executed. KaTeX is used without trusted commands.
// Use $...$ for inline mathematics and $$...$$ for displayed equations.
const rehypePlugins = [[rehypeKatex, { trust: false, strict: 'ignore', throwOnError: false, maxExpand: 1000 }]]

export default function RichBody({ source='', fontSize=16, className='', onAnnotationClick, screenplay=false }) {
  const {characters,text}=screenplay?screenplayDocument(source):{characters:[],text:source}
  const plugins = useMemo(() => [remarkGfm, remarkMath, remarkBreaks, [remarkAnnotationMarkers, {interactive: Boolean(onAnnotationClick)}], remarkParagraphSpacing, ...(screenplay?[[remarkScreenplay,{characters}]]:[])], [Boolean(onAnnotationClick),screenplay,characters.join('\n')])
  const handleClick = event => {
    const marker=event.target.closest?.('button[data-annotation-number]')
    if (!marker || !event.currentTarget.contains(marker) || !onAnnotationClick) return
    const number=Number(marker.getAttribute('data-annotation-number'))
    if (Number.isSafeInteger(number) && number > 0) onAnnotationClick(number)
  }
  return <div className={'rich-body serif '+className} onClick={handleClick} style={{'--reading-size':`${fontSize}px`}}>
    {screenplay&&characters.length>0&&<aside className="screenplay-cast"><h3>登場人物</h3><p>{characters.join(' ／ ')}</p></aside>}
    <Markdown remarkPlugins={plugins} rehypePlugins={rehypePlugins} skipHtml>
      {prepareAnnotationSource(preserveParagraphIndentation(text))}
    </Markdown>
  </div>
}
