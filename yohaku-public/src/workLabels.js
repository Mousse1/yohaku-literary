export const authorLabel = work => work?.contributor_credit?.trim() ? '原作者' : '作者'
export const isReviewedBody = work => work?.status === 'published' && work.node_kind !== 'collection'
