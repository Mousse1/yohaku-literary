import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {createServer} from 'vite';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.window={location:{origin:'https://example.org'},addEventListener(){},removeEventListener(){}};
globalThis.location={origin:'https://example.org',pathname:'/',hash:''};
globalThis.confirm=()=>true;globalThis.alert=message=>{throw Error(message)};
test('owner action opens review choice; editor submits current content under the existing ID',async()=>{
 const server=await createServer({optimizeDeps:{noDiscovery:true,entries:[]},plugins:[{name:'editor-test-export',enforce:'pre',transform(source,id){if(id.replaceAll('\\','/').endsWith('/src/main.jsx'))return source.replace("createRoot(document.getElementById('root')).render(<App/>)",'export {WorkForm};');}}],server:{middlewareMode:true,hmr:false},appType:'custom'});
 let library,editor;
 try{
  const {default:Library}=await server.ssrLoadModule('/src/MyWorkLibrary.jsx');
  const {WorkForm}=await server.ssrLoadModule('/src/main.jsx');
  const work={id:'10000000-0000-4000-8000-000000000001',author_id:'owner',status:'open',freely_published_once:true,title:'章',pen_name:'作者',body:'元の本文を保持します。',summary:'紹介文を十分な長さで記載します。',section:'文学',genre:'純文学',work_references:[{title:'参考資料',relation:'引用元',url:'https://example.org/source#one'}]};
  let opened,submitted;
  await act(async()=>{library=create(React.createElement(Library,{works:[work],onEdit:(w,requestReview)=>opened={...w,requestReview}}))});
  const request=library.root.findAllByType('button').find(b=>b.children.includes('審査して公開'));
  await act(async()=>request.props.onClick());assert.equal(opened.id,work.id);assert.equal(opened.requestReview,true);
  await act(async()=>{editor=create(React.createElement(WorkForm,{initial:opened,user:{id:'owner'},onSubmit:async p=>{submitted=p;return true}}))});
  const radio=editor.root.findAllByType('input').find(i=>i.props.type==='radio'&&i.props.checked);
  assert.equal(radio.props.disabled,false);
  assert.match(JSON.stringify(editor.toJSON()),/審査中・差し戻し後も自由公開を続けます/);
  const body=editor.root.findAllByType('textarea').find(i=>i.props.maxLength===200000);
  await act(async()=>body.props.onChange({target:{value:'編集した本文です。\n\n[資料1] https://example.org/link'}}));
  globalThis.confirm=()=>{throw Error('Review submission must not request taking free publication offline')};
  await act(async()=>editor.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(submitted.p_id,work.id);assert.equal(submitted.p_status,'pending');assert.equal(submitted.p_body,'編集した本文です。\n\n[資料1] https://example.org/link');assert.equal(submitted.p_references[0].url,work.work_references[0].url);
  await act(async()=>{editor.unmount();library.unmount()});editor=null;library=null;
  const group={...work,id:'20000000-0000-4000-8000-000000000001',node_kind:'collection',body:' \n　',requestReview:true};
  await act(async()=>{library=create(React.createElement(Library,{works:[group]}))});
  assert.equal(library.root.findAllByType('button').some(b=>b.children.includes('審査して公開')),false);
  let mode;submitted=undefined;globalThis.confirm=()=>{throw Error('Empty group should not request moderation confirmation')};
  await act(async()=>{editor=create(React.createElement(WorkForm,{initial:group,user:{id:'owner'},onPublicationModeChange:m=>mode=m,onSubmit:async p=>{submitted=p;return true}}))});
  assert.equal(mode,'open');
  assert.equal(editor.root.findAllByType('input').filter(i=>i.props.type==='radio'&&i.props.disabled).length,1);
  assert.match(JSON.stringify(editor.toJSON()),/本文のないグループは審査不要/);
  await act(async()=>editor.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(submitted.p_status,'open');assert.equal(submitted.p_node_kind,'collection');assert.equal(submitted.p_body,group.body);
  for(const state of ['pending','rejected']){
   await act(async()=>{library.unmount();library=create(React.createElement(Library,{works:[{...work,review_state:state}]}))});
   assert.match(JSON.stringify(library.toJSON()),state==='pending'?/自由公開（審査中）/:/自由公開（差し戻し）/);
   assert.equal(library.root.findAllByType('a').some(a=>a.props.href===`https://example.org/works/${work.id}`),true);
   assert.equal(library.root.findAllByType('button').some(b=>b.children.includes('再審査を申請')),state==='rejected');
  }
  await act(async()=>{library.unmount();library=create(React.createElement(Library,{works:[{...work,status:'pending'}],onEdit:w=>opened=w}))});
  await act(async()=>library.root.findAllByType('button').find(b=>b.children.includes('自由公開する')).props.onClick());
  assert.equal(opened.freePublication,true);
  await act(async()=>{editor.unmount();editor=create(React.createElement(WorkForm,{initial:opened,user:{id:'owner'},onPublicationModeChange:m=>mode=m,onSubmit:async p=>{submitted=p;return true}}))});
  assert.equal(mode,'open');submitted=undefined;
  await act(async()=>editor.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(submitted.p_status,'open');assert.equal(submitted.p_id,work.id);
 }finally{if(editor)await act(async()=>editor.unmount());if(library)await act(async()=>library.unmount());await server.close()}
});
