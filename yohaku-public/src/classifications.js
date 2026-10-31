export const builtInClassifications={
  '文学':['純文学','実験文学','詩・散文'],
  '哲学':['理論哲学','実践哲学'],
  '評論':['文芸','映画','アニメ','ゲーム'],
  '科学':['数学','物理学','脳科学','心理学','精神医学'],
  'その他':['その他'],
}
const legacyLabels={'文芸評論':'文芸（旧分類）','ノベルゲーム':'ゲーム（旧分類）','哲学小説':'哲学小説（旧分類）','科学':'科学（旧分類）'}
export function decodeGenres(value) {
  if(typeof value==='string'){
    if(!value.trim())return []
    if(value.trim().startsWith('[')){try{value=JSON.parse(value)}catch{return []}}
    else value=[value]
  }
  return [...new Set((Array.isArray(value)?value:[]).filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean))]
}
export function encodeGenres(value) {
  const values=decodeGenres(value)
  return values.length===1&&!values[0].startsWith('[')?values[0]:JSON.stringify(values)
}
export const displayGenres=value=>decodeGenres(value).map(x=>legacyLabels[x]||x).join('・')||'未選択'
const alias=value=>({'文芸評論':'文芸','ノベルゲーム':'ゲーム'})[value]||value
export const matchesGenre=(value,target)=>decodeGenres(value).some(x=>alias(x)===alias(target))
export function classificationTree(rows=[]) {
  const result=Object.fromEntries(Object.entries(builtInClassifications).map(([key,values])=>[key,[...values]]))
  for(const row of rows)if(result[row.section]&&!row.is_legacy&&!result[row.section].includes(row.name))result[row.section].push(row.name)
  return result
}
