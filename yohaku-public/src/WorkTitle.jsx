import React from 'react'
import {titleParts} from './titleFormat.js'

export default function WorkTitle({children}) {
  return titleParts(children).map((part,index)=>index%2 ? <del key={index}>{part}</del> : part)
}
