// Keep the author's visual separation between paragraphs without changing
// the source saved in Supabase. Markdown collapses 2+ successive newlines to a
// single paragraph boundary; record their count on the preceding paragraph.
// A single newline remains a normal <br> via remark-breaks.
const MAX_GAP_LINES = 8

export function remarkParagraphSpacing() {
  return (tree, file) => {
    // ReactMarkdown passes the already-prepared Markdown to the VFile.
    const source = String(file?.value ?? '')
    const visit = node => {
      if (!Array.isArray(node?.children)) return
      const children = node.children
      for (let i = 0; i < children.length - 1; i++) {
        const current = children[i]
        const next = children[i + 1]
        if (current.type !== 'paragraph' || next.type !== 'paragraph') continue
        const end = current.position?.end?.offset
        const start = next.position?.start?.offset
        if (!Number.isInteger(end) || !Number.isInteger(start) || start < end) continue
        const gap = source.slice(end, start)
        // Do not count a Markdown divider, heading, or other non-whitespace.
        if (!/^[\t \r\n]*$/.test(gap)) continue
        const count = (gap.match(/\r\n|\r|\n/g) || []).length
        if (count < 2) continue
        const className = `body-paragraph-gap-${Math.min(count, MAX_GAP_LINES)}`
        current.data ||= {}
        current.data.hProperties ||= {}
        const old = current.data.hProperties.className || []
        current.data.hProperties.className = [...(Array.isArray(old) ? old : [old]), className]
      }
      for (const child of children) visit(child)
    }
    visit(tree)
  }
}
