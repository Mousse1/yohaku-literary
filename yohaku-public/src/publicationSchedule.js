export function jstDateInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Date(date.getTime()+9*60*60*1000).toISOString().slice(0,16) : ''
}
export function scheduledInstant(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('公開日時を入力してください。')
  const date = new Date(value+':00+09:00')
  if (!Number.isFinite(date.getTime()) || jstDateInput(date)!==value || date.getTime()<=Date.now()) throw new Error('未来の公開日時を指定してください。')
  return date.toISOString()
}
