import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source=fs.readFileSync(new URL('../src/main.jsx', import.meta.url),'utf8')
const styles=fs.readFileSync(new URL('../src/style.css', import.meta.url),'utf8')

test('the submit editor shows the upper publish action alongside exit without exposing it on the revision screen',()=>{
  assert.match(source,/route==='submit'&&editing&&<button type="submit" form="yohaku-editor-form"/)
  assert.match(source,/editor-header-publish" disabled=\{loading\}/)
  assert.match(source,/執筆を終える<\/button><\/div> :/)
})

test('the upper button submits the same validated form as the lower publish button',()=>{
  assert.match(source,/<form id="yohaku-editor-form" className="editor" onKeyDown={editorShortcuts} onSubmit=\{e=>submit\(e,revisionMode\?'pending':publicationMode\)\}/)
  assert.match(source,/<button className="button primary" disabled=\{disabled\} type="submit">/)
  assert.match(source,/const submit=async \(e,status\)=>\{\s*e\.preventDefault\(\)/)
  assert.match(source,/const valid=refs\.every\(r=>r\.title\.trim\(\)&&packedTitleLength\(r\)<=300&&validOptionalReferenceUrl\(r\.url\)\)&&validateReferenceNumbers\(refs\)/)
})

test('upper button reflects selected publication mode instead of publishing while pending mode is chosen',()=>{
  assert.match(source,/onPublicationModeChange=\{setEditorPublicationMode\}/)
  assert.match(source,/useEffect\(\(\)=>\{onPublicationModeChange\?\.\(publicationMode\)\},\[publicationMode,onPublicationModeChange\]\)/)
  assert.match(source,/editorPublicationMode==='pending'\?'審査へ提出':'審査なしで公開'/)
  assert.match(source,/onChange=\{\(\)=>setPublicationMode\('pending'\)\}/)
})

test('upper action stays usable in a narrow editor header',()=>{
  assert.match(styles,/\.editor-header-publish\{white-space:nowrap/)
  assert.match(styles,/@media\(max-width:560px\)\{\.editor-header-label\{display:none\}/)
})
