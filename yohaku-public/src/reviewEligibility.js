// Collections with legacy body text remain eligible; empty records never are.
export const hasReviewBody = work => typeof work?.body === 'string' && work.body.trim().length > 0
