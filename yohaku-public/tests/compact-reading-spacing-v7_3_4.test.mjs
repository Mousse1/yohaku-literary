import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
const reader = readFileSync(new URL('../src/RichBody.jsx', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../worker/publicPages.js', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp('(?:^|\\n)'+escaped+'\\{([^}]*)\\}'))
  assert.ok(match, `${selector} CSS rule not found`)
  return match[1]
}

test('one newline stays a line break rather than an extra paragraph', () => {
  assert.match(reader, /remarkBreaks/)
  assert.match(reader, /preserveParagraphIndentation\(source\)/)
})

test('normal, mobile, parallel and history body line height is compact', () => {
  for (const selector of ['.rich-body','.parallel-pane-scroll .rich-body','.history-preview .history-rich','.community-reference-item .rich-body']) {
    assert.match(rule(selector), /line-height:1\.75(?:;|$)/)
  }
  assert.ok(css.includes('.rich-body{line-height:1.75}}'), 'mobile paragraph spacing uses compact line-height')
})

test('paragraph separation remains distinct but compact', () => {
  assert.match(rule('.rich-body p'), /margin:0 0 \.62em/)
  assert.match(rule('.rich-body > p:last-child'), /margin-bottom:0/)
})

test('public HTML pages use the same compact line height', () => {
  assert.match(worker,/line-height:1\.75;font-family:serif/)
  assert.match(html,/v7\.3\.4/)
})
