import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
const reader = readFileSync(new URL('../src/RichBody.jsx', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

function rule(selector) {
  // Find rules, including rules inserted after compacted one-line sections.
  const pos = css.indexOf(`${selector}{`)
  assert.ok(pos >= 0, `${selector} CSS rule not found`)
  return css.slice(pos + selector.length + 1, css.indexOf('}', pos))
}

test('one newline uses remark-breaks and only one line-height, never white-space pre-wrap', () => {
  assert.match(reader, /remarkBreaks/)
  assert.match(reader, /preserveParagraphIndentation\(source\)/)
  const paragraph = rule('.rich-body p')
  assert.match(paragraph, /white-space:normal/)
  assert.doesNotMatch(paragraph, /pre-wrap/)
  // Ensure the rule at the end of the stylesheet cannot override it with pre-wrap.
  assert.match(css, /\.rich-body p \{ white-space: normal; \}/)
  assert.doesNotMatch(css, /\.rich-body p\s*\{\s*white-space:\s*pre-wrap/)
})

test('paragraphs have a small but nonzero visual separation', () => {
  const paragraph = rule('.rich-body p')
  assert.match(paragraph, /margin:0 0 \.35em/)
  assert.match(rule('.rich-body > p:last-child'), /margin-bottom:0/)
  const singleNewlineBaseline = 1.45
  const paragraphBaseline = singleNewlineBaseline + 0.35
  assert.ok(singleNewlineBaseline < paragraphBaseline)
  assert.ok(paragraphBaseline < 2)
})

test('main, descendant, parallel, history, community and mobile display use the same 1.45 line-height', () => {
  for (const selector of [
    '.rich-body',
    '.descendant-reader-item .rich-body',
    '.parallel-pane-scroll .rich-body',
    '.history-preview .history-rich',
    '.community-reference-item .rich-body',
  ]) {
    assert.match(rule(selector), /line-height:1\.45(?:;|$)/, `${selector} is not using the tight line-height`)
  }
  assert.ok(css.includes('.rich-body{line-height:1.45}}'), 'mobile reading should remain compact')
  assert.match(rule('.reader-recovery .reader-raw-body'), /font:16px\/1\.45/)
  assert.match(rule('.novel'), /line-height:1\.45/)
})

test('JSON-only Worker preserves compact reader styles and version', () => {
  assert.match(html,/v7\.(?:5|6)/)
})
