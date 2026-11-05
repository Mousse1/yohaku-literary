import React from 'react'
import {hasReviewBody, publicationText} from './reviewEligibility.js'

export default function PublicationLabel({work}) {
  if (!hasReviewBody(work) || !['published','open'].includes(work.status)) return null
  return <span className={'publication-label '+(work.status==='published'?'reviewed':'unreviewed')}>
    {publicationText(work)}
  </span>
}
