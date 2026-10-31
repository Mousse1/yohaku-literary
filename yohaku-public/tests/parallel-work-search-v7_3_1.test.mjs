import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hierarchyEntries } from '../src/workHierarchy.js'
import { searchParallelWorks, otherPanelWorks, normalizeParallelSearch } from '../src/parallelWorkSearch.js'

const entries = hierarchyEntries([
  {id:'root',title:'エチカ',node_kind:'collection'},
  {id:'p1',title:'第一部 神について',parent_work_id:'root',node_kind:'collection'},
  {id:'a',title:'本文',parent_work_id:'p1',node_kind:'work'},
  {id:'n',title:'注釈',parent_work_id:'p1',node_kind:'work'},
  {id:'p2',title:'第二部',parent_work_id:'root',node_kind:'collection'},
  {id:'b',title:'本文',parent_work_id:'p2',node_kind:'work'},
])

assert.equal(normalizeParallelSearch(' ＥＴＨＩＣＳ　 > 第一部 '),'ethics 第一部')
assert.deepEqual(searchParallelWorks(entries,'エチカ 第一部 本文').map(w=>w.id),['a'])
assert.deepEqual(searchParallelWorks(entries,'第二部　本文').map(w=>w.id),['b'])
assert.deepEqual(searchParallelWorks(entries,'定義').map(w=>w.id),[])
assert.deepEqual(searchParallelWorks(entries,'本文').map(w=>w.id),['a','b'])
assert.deepEqual(searchParallelWorks(entries,'',2).map(w=>w.id),['root','p1'])
assert.deepEqual(searchParallelWorks([...entries,...Array.from({length:400},(_,i)=>({id:'extra'+i,title:'哲学論考'+i,path:'哲学 › 哲学論考'+i}))],'哲学論考399').map(w=>w.id),['extra399'])
const panes=[{key:10,workId:'a',kind:'body'},{key:11,workId:'b',kind:'notes'},{key:12,workId:'a',kind:'refs'}]
assert.deepEqual(otherPanelWorks(panes,entries,11).map(({index,work})=>[index,work.id]),[[0,'a']])
assert.deepEqual(otherPanelWorks(panes,entries,10).map(({index,work})=>[index,work.id]),[[1,'b'],[2,'a']])
assert.deepEqual(otherPanelWorks([...panes,{key:20,workId:'private'}],entries,10).map(x=>x.work.id),['b','a'])

const ui=readFileSync(new URL('../src/ParallelReader.jsx',import.meta.url),'utf8')
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8')
assert.ok(ui.includes('ほかのパネルで開いている作品'), '他パネルの選択を先頭に表示')
assert.ok(ui.includes('ほかのパネル') && ui.includes('parallel-quick-button'), 'ワンクリックの同作品指定')
assert.ok(ui.includes('placeholder="題名・グループ名で検索"'), '階層名でも検索')
assert.ok(ui.includes('const workId=prev?.workId||available[0]?.id'), '新規パネルが現在の作品を引き継ぐ')
assert.ok(ui.includes("['notes', '注釈・異論']"), '同作品の注釈を表示可能')
assert.ok(ui.includes("if(e.key==='Escape')"), 'キーボードでも検索を閉じられる')
assert.ok(!main.includes("['parallel','並べて読む']"), 'ヘッダーから並列読書を削除')
assert.ok(!main.includes("['about','サイトについて']"), 'ヘッダーからサイト情報を削除')
assert.ok(main.includes("<button onClick={()=>navigate('about')}>サイトについて</button>"), 'フッターにサイト情報')
assert.ok(main.includes('onParallel={()=>parallelWork('), '作品からの並列読書導線は維持')
assert.ok(css.includes('.parallel-work-dropdown'), '検索候補のスタイル')
console.log('v7.3.1: 階層検索、他パネル優先、ヘッダー・フッター移設 OK')
