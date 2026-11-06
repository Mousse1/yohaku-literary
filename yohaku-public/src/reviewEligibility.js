// Collections with legacy body text remain eligible; empty records never are.
export const hasReviewBody = work => typeof work?.body === 'string' && work.body.trim().length > 0
export const publicationText = work => work?.status === 'published' ? (hasReviewBody(work) ? '審査済み公開' : '公開')
  : !hasReviewBody(work) ? '公開'
  : work?.review_state === 'pending' ? '自由公開・審査中'
  : work?.review_state === 'rejected' ? '自由公開・差し戻し' : '自由公開（未審査）'
