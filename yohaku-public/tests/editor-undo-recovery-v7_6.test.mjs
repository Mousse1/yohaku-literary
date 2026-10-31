import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  editorSnapshot, editorSafetyKey, snapshotEquals, isLargeDeletion,
  recordEdit, undoEdit, redoEdit, readSafetySnapshot, storeSafetySnapshot,
} from '../src/editorRecovery.js'

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8')
const s=(body, title='原稿')=>editorSnapshot({body,title,summary:''},[{title:'引用',url:'',relation:''}],'説明')

test('undo and redo recover a whole-body deletion even if it is a rapid consecutive edit',()=>{
  const original=s('あ'.repeat(200)),changed=s('あ'.repeat(201)),deleted=s('')
  let history={past:[],future:[],lastKind:null,lastAt:0}
  history=recordEdit(history,original,changed,1000)
  history=recordEdit(history,changed,deleted,1100)
  assert.equal(history.past.length,2,'large deletion must form its own undo checkpoint')
  const undone=undoEdit(history,deleted)
  assert.equal(undone.snapshot.fields.body,changed.fields.body)
  const redone=redoEdit(undone.history,undone.snapshot)
  assert.equal(redone.snapshot.fields.body,'')
})

test('normal consecutive keystrokes group and change across fields separates checkpoints',()=>{
  let history={past:[],future:[],lastKind:null,lastAt:0}
  const v0=s('本文'),v1=s('本文あ'),v2=s('本文あい'),v3=s('本文あい','別題')
  history=recordEdit(history,v0,v1,1000)
  history=recordEdit(history,v1,v2,1100)
  assert.equal(history.past.length,1)
  history=recordEdit(history,v2,v3,1200)
  assert.equal(history.past.length,2)
  assert.equal(undoEdit(history,v3).snapshot.fields.title,'原稿')
})

test('large text deletion creates a recoverable local snapshot, retained across refresh',()=>{
  const saved=new Map()
  globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,val)=>saved.set(key,val)}
  const key=editorSafetyKey('yohaku:edit:user:work')
  const original=s('ある文章です。'.repeat(50)),blank=s('')
  assert.equal(isLargeDeletion(original,blank),true)
  assert.equal(storeSafetySnapshot(key,original),true)
  assert.equal(snapshotEquals(readSafetySnapshot(key),original),true)
  assert.equal(isLargeDeletion(s('短い'),s('')),false)
  delete globalThis.localStorage
})

test('discard waits for autosave, then restores the entry snapshot to the cloud',()=>{
  assert.match(source,/const discardChanges=async\(\)=>/)
  assert.match(source,/await pendingSave\.current\.catch\(\(\)=>\{\}\)/)
  assert.match(source,/const snapshot=initialSnapshot\.current/)
  assert.match(source,/await autoSaveCallback\.current\(payload\)/)
  assert.match(source,/localStorage\.removeItem\(cacheKey\);localStorage\.removeItem\(safetyKey\)/)
  assert.match(source,/onCancel\(\)/)
})

test('undo redo discard and safety restore are clickable form controls, no new SQL',()=>{
  for(const label of ['元に戻す','やり直す','変更を破棄する','誤削除から復元'])assert.ok(source.includes(label))
  assert.match(source,/onKeyDown=\{editorShortcuts\}/)
  assert.match(source,/type="button" className="button light small editor-recovery-discard"/)
  assert.match(css,/\.editor-recovery-bar\{position:sticky/)
  assert.match(source,/onAutoSave=\{async payload=>/)
})
