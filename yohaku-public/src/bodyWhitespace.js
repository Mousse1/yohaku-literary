// Markdown treats one to three ASCII spaces at the beginning of a block as
// optional block indentation, so they disappear before CSS can render them.
// Keep literal paragraph indents as non-breaking spaces in the *rendered*
// Markdown source only. The text persisted to Supabase stays byte-for-byte
// unchanged, and real Markdown block syntax remains intact.
//
// Fullwidth (U+3000) indentation needs no substitution; the save form must
// simply avoid .trim() on the original body.
const blockMarker = /^(?:#{1,6}(?:[ \t]|$)|>|[-+*][ \t]|[0-9]{1,9}[.)][ \t]|`{3,}|~{3,})/

export function preserveParagraphIndentation(source) {
  return String(source ?? '').replace(
    /(^|\r?\n(?:[ \t]*\r?\n)+)( {1,3})(?=\S)/g,
    (match, boundary, indent, offset, fullText) => {
      const rest = fullText.slice(offset + boundary.length + indent.length)
      // A list, quote, heading or fenced code block with optional whitespace
      // must retain its normal Markdown meaning.
      if (blockMarker.test(rest)) return match
      return boundary + '\u00a0'.repeat(indent.length)
    }
  )
}
