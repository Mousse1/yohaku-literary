import React from 'react'
import Markdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { preserveParagraphIndentation } from './bodyWhitespace'
import { prepareAnnotationSource, remarkAnnotationMarkers } from './annotationMarkers'

// HTML in submitted Markdown is not executed. KaTeX is used without trusted commands.
// Use $...$ for inline mathematics and $$...$$ for displayed equations.
const remarkPlugins = [remarkGfm, remarkMath, remarkBreaks, remarkAnnotationMarkers]
const rehypePlugins = [[rehypeKatex, { trust: false, strict: 'ignore', throwOnError: false, maxExpand: 1000 }]]

export default function RichBody({ source='', fontSize=16, className='' }) {
  return <div className={'rich-body serif '+className} style={{'--reading-size':`${fontSize}px`}}>
    <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} skipHtml>
      {prepareAnnotationSource(preserveParagraphIndentation(source))}
    </Markdown>
  </div>
}
