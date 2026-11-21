// A reference may have no web URL (e.g., printed pamphlets or handouts).
// PostgreSQL stores missing links as NULL. A provided URL must be HTTPS.
export const normalizeReferenceUrl = value => {
  const trimmed = String(value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

export const validOptionalReferenceUrl = value => {
  const url = normalizeReferenceUrl(value)
  if (url === null) return true
  if (url.length > 1000 || !/^https:\/\/[^\s]+$/.test(url)) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && Boolean(parsed.hostname)
  } catch {
    return false
  }
}
