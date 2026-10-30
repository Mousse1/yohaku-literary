import assert from 'node:assert/strict'
import fs from 'node:fs'
import { hierarchyEntries, descendantsOf, readingPageEntries } from '../src/workHierarchy.js'
const mk=(id, parent_work_id, kind='collection',status='published',order_index=0)=>({id,title:id,parent_work_id,node_kind:kind,status,order_index})
const rows=[
 mk('ethica',null),
 mk('part1','ethica'),
 mk('chapter','part1'),
 mk('axioms','chapter','work'),
 mk('part2','ethica'),
 mk('definitions','part2','work'),
 mk('private','ethica','work','pending'),
 mk('part3','ethica'),
 mk('empty','part3'),
 mk('part4','ethica'),
 mk('conclusion','part4','work')
]
const entries=hierarchyEntries(rows.filter(w=>w.status==='published'))
const children=descendantsOf(entries,'ethica')
const first=readingPageEntries(children,2)
assert.deepEqual(first.map(x=>x.id),['part1','chapter','axioms','part2','definitions'])
assert.ok(first.some(x=>x.id==='axioms'))
assert.ok(first.some(x=>x.id==='definitions'))
assert.ok(!first.some(x=>x.id==='private'))
assert.deepEqual(readingPageEntries(children,1).map(x=>x.id),['part1','chapter','axioms'])
assert.deepEqual(readingPageEntries(descendantsOf(entries,'part1'),6).map(x=>x.id),['chapter','axioms'])
assert.ok(readingPageEntries(children,6).some(x=>x.id==='conclusion'))
const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const descendant=fs.readFileSync(new URL('../src/DescendantBodies.jsx',import.meta.url),'utf8')
assert.match(main,/className="pill group-read-link" onClick=\{onRead\}/)
assert.match(main,/<DescendantBodies rootWorkId=\{work.id\}/)
assert.ok(main.indexOf('  <div className="work-layout"><section>',main.indexOf('function WorkDialog(')) < main.indexOf('  {configured&&<section className="toc-section">',main.indexOf('function WorkDialog(')), 'reader must appear before TOC')
assert.match(descendant,/readingPageEntries\(descendants, limit\)/)
assert.match(descendant,/PUBLIC_STATUSES = \['published', 'open'\]/)
console.log('階層からの本文読書・グループのリンク・公開制御: OK')
