import React from 'react'
import {isReviewedBody} from './workLabels.js'

export default function ReviewMark({work}) {
  return isReviewedBody(work) ? <small className="tree-review-mark">審査済</small> : null
}
