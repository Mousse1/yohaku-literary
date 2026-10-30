import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {preserveParagraphIndentation} from '../src/bodyWhitespace.js'
import {renderHtml} from '../worker/publicPages.js'

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const main = read('../src/main.jsx')
const richBody = read('../src/RichBody.jsx')
const css = read('../src/style.css')

test('form stores the original body, never .trim()s it before RPC', () => {
  assert.match(main, /p_body:fields\.body(?=,)/)
  assert.doesNotMatch(main, /p_body:fields\.body\.trim\(\)/)
  assert.match(main, /className="body-editor" value=\{fields\.body\}/)
  // Trimming is allowed as a nonmutating blank-content check on display.
})

test('leading Japanese fullwidth spaces are preserved by Markdown preparation', () => {
  const body='　冒頭の一字下げ。\n次の行。\n\n　次の段落。'
  assert.equal(preserveParagraphIndentation(body), body)
})

test('one to three ASCII leading spaces are rendered as visible indents', () => {
  assert.equal(preserveParagraphIndentation('  冒頭'), '\u00a0\u00a0冒頭')
  assert.equal(preserveParagraphIndentation('　冒頭'), '　冒頭')
  assert.equal(preserveParagraphIndentation('本文\n\n 一字下げ'), '本文\n\n\u00a0一字下げ')
  assert.equal(preserveParagraphIndentation('本文\r\n\r\n  一字下げ'), '本文\r\n\r\n\u00a0\u00a0一字下げ')
  assert.equal(preserveParagraphIndentation('   **太字**'), '\u00a0\u00a0\u00a0**太字**')
})

test('Markdown lists, headings, quotations, code, and 4-space indentation are left alone', () => {
  for (const line of ['  # 見出し', ' - リスト', '  1. 番号', ' > 引用', ' ```js', '    コード', '  ~~~']) {
    assert.equal(preserveParagraphIndentation(line), line)
  }
  assert.equal(preserveParagraphIndentation('本文\n\n  - リスト'), '本文\n\n  - リスト')
})

test('prose renderer uses the whitespace-preserving input and CSS', () => {
  assert.match(richBody, /preserveParagraphIndentation\(source\)/)
  assert.match(css, /\.rich-body p\s*\{\s*white-space:\s*pre-wrap/)
})

test('public non-JS HTML preserves leading indentation safely', () => {
  const text='　冒頭の段落。\n 続き。'
  const html=renderHtml({id:'00000000-0000-4000-8000-000000000001',title:'試験',pen_name:'作者',body:text,status:'open'}, [], {items:[],truncated:false}, {selected:[],limited:false}, 'https://example.org', '<!doctype html><html><head><title>旧</title></head><body><div id="root"></div></body></html>')
  assert.ok(html.includes(text))
  assert.match(html, /white-space:pre-wrap/)
})
