// Store an explicit bibliography-to-footnote association in the existing title
// field. No schema/RPC change is required, including for approved revisions.
// The prefix is visible in JSON/export; the reader/editor separate it for display.
const PREFIX = /^【\*([1-9][0-9]{0,5})】\s*/u
const validNumber = value => /^[1-9][0-9]{0,5}$/.test(String(value ?? '').trim())

export function unpackReference(reference = {}) {
  const title = String(reference.title || '')
  const match = PREFIX.exec(title)
  return {
    ...reference,
    title: match ? title.slice(match[0].length) : title,
    annotationNumber: match ? match[1] : '',
  }
}
export function packReference(reference = {}) {
  const {title, annotationNumber, ...rest} = unpackReference(reference)
  const rawNumber = String(reference.annotationNumber ?? annotationNumber ?? '').trim()
  const number = validNumber(rawNumber) ? String(Number(rawNumber)) : ''
  return { ...rest, title: `${number ? `【*${number}】 ` : ''}${String(title).trim()}` }
}
export function referenceForNumber(references = [], value) {
  const number = String(Number(value))
  return references.find(ref => unpackReference(ref).annotationNumber === number) || null
}
export function validateReferenceNumbers(references = []) {
  const seen = new Set()
  for(const ref of references){
    const number = String(ref.annotationNumber ?? unpackReference(ref).annotationNumber ?? '').trim()
    if (!number) continue
    if (!validNumber(number) || seen.has(String(Number(number)))) return false
    seen.add(String(Number(number)))
  }
  return true
}
export function packedTitleLength(ref) {
  return packReference(ref).title.length
}
