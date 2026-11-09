export function titleParts(value) {
  return String(value ?? '').split(/~~([^~\r\n]+?)~~/g)
}

export const plainTitle = value => titleParts(value).join('')

export function titleHtml(value,escape) {
  return titleParts(value).map((part,index)=>index%2 ? '<del>'+escape(part)+'</del>' : escape(part)).join('')
}
