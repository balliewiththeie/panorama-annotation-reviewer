'use strict';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg',W=1920,H=1080;
const clone=x=>JSON.parse(JSON.stringify(x));
const colors={valve:'#00bfff',flange:'#00ffdf',elbow:'#ff55ff',pipe:'#5cff57',tank:'#ff9f24',pump:'#aa7dff',strainer:'#ed8cff',tee:'#ff6240',reducer:'#ff5ca8'};
const key='pano-editor-v2-'+DATA.source_sha256+'-'+DATA.revision;
let state={reviews:clone(INITIAL_REVIEWS),annotations:Object.fromEntries(DATA.views.map(v=>[v.view_index,clone(v.annotations)]))};
let index=0,selected=null,mode='edit',scale=1,tx=0,ty=0,fitScale=1,space=false,drag=null,undoStack=[],redoStack=[],tempQuad=null;
const vp=$('viewport');
// UI preferences are separate from annotation autosave, preserving existing exports.
const uiKey=key+'-ui';let nextClass=null,lastLeftClick=null,lastRightClick=null;
try{const ui=JSON.parse(localStorage.getItem(uiKey)||'null');if(ui&&Number.isInteger(ui.index)&&ui.index>=0&&ui.index<DATA.views.length)index=ui.index;if(ui&&DATA.class_names.includes(ui.nextClass))nextClass=ui.nextClass;}catch(e){}
function saveUI(){try{localStorage.setItem(uiKey,JSON.stringify({index,nextClass}));}catch(e){}}
function newBoxClass(){return nextClass||$('filter').value||$('selectedClass').value||'pipe';}
function updateAddButton(){$('addMode').textContent=mode==='add'?'+ Box: '+newBoxClass():'+ Box';}
function chooseClass(cls){
 if(mode==='add'){nextClass=cls;if($('filter').value&&$('filter').value!==cls){$('filter').value='';renderSidebar();draw();}saveUI();updateAddButton();notice('Next box: '+cls+' · drag to draw');return;}
 const a=active();if(!a){notice('Select a box first, or press B to add one.');return;}
 if(a.proposed_class===cls&&!a.uncertain)return;
 if($('filter').value&&$('filter').value!==cls)$('filter').value='';
 mutate(()=>{a.proposed_class=cls;a.uncertain=false;normalise(a);});
}
vp.addEventListener('mousedown',e=>{if(e.button===1)e.preventDefault();});
vp.addEventListener('auxclick',e=>{if(e.button===1||e.button===2)e.preventDefault();});
// The image owns right-click so the browser menu cannot interrupt the second click.
vp.addEventListener('contextmenu',e=>e.preventDefault());
function notice(s,error=false){$('notice').textContent=s;$('notice').style.color=error?'#a04c43':'';}
function validQuad(q){if(!Array.isArray(q)||q.length!==4||!q.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=-.01&&p[0]<=W+.01&&p[1]>=-.01&&p[1]<=H+.01))return false;
 const e=q.map((p,i)=>[q[(i+1)%4][0]-p[0],q[(i+1)%4][1]-p[1]]),lens=e.map(v=>Math.hypot(...v));
 if(Math.min(...lens)<1)return false;
 if(Math.abs(lens[0]-lens[2])>.06||Math.abs(lens[1]-lens[3])>.06)return false;
 return e.every((v,i)=>Math.abs(v[0]*e[(i+1)%4][0]+v[1]*e[(i+1)%4][1])/(lens[i]*lens[(i+1)%4])<.003);
}
function validateState(s){if(!s||!s.reviews||!s.annotations)throw Error('Missing review or annotation data.');
 for(const v of DATA.views){const list=s.annotations[v.view_index];if(!Array.isArray(list))throw Error('Missing view '+v.view_index);const ids=new Set();
  for(const a of list){if(!Number.isInteger(a.id)||a.id<1||ids.has(a.id)||!DATA.class_names.includes(a.proposed_class)||!validQuad(a.quad_pixels))throw Error('Invalid box in view '+v.view_index);ids.add(a.id);}
  const r=s.reviews[v.view_index];if(r&&r.class_decisions){r.decision=DATA.class_names.every(c=>r.class_decisions[c]==='looks_correct')?'looks_correct':'not_reviewed';delete r.class_decisions;}if(r&&(!['not_reviewed','needs_changes','looks_correct','exclude'].includes(r.decision)||typeof r.notes!=='string'))throw Error('Invalid review in view '+v.view_index);
 }return s;
}
// Autosave: lossless baseline-relative records, with IndexedDB fallback.
let savedAt=0,saveGeneration=0,savePending=false,saveFailed=false,dbPromise=null,saveQueue=Promise.resolve();
function packState(s){
 const annotations={};
 for(const v of DATA.views){
  const a=s.annotations[v.view_index];
  if(JSON.stringify(a)!==JSON.stringify(v.annotations))annotations[v.view_index]=a.map((box,i)=>JSON.stringify(box)===JSON.stringify(v.annotations[i])?i:box);
 }
 return {schema:'panorama-autosave/v1',baseline:DATA.base_annotation_sha256,savedAt:Math.max(Date.now(),savedAt+1),reviews:s.reviews,annotations};
}
function unpackState(record){
 if(record.schema!=='panorama-autosave/v1')return validateState(record);
 if(record.baseline!==DATA.base_annotation_sha256)throw Error('Autosave baseline does not match.');
 const annotations={};
 for(const v of DATA.views){
  const rows=record.annotations[v.view_index];
  annotations[v.view_index]=rows===undefined?clone(v.annotations):rows.map(a=>{
   if(typeof a!=='number')return clone(a);
   if(!Number.isInteger(a)||!v.annotations[a])throw Error('Invalid autosave reference.');
   return clone(v.annotations[a]);
  });
 }
 return validateState({reviews:clone(record.reviews),annotations});
}
function openSaveDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  let settled=false,request;
  const timer=setTimeout(()=>finish(Error('Browser storage did not respond.')),4000);
  function finish(error,db){if(settled){if(db)db.close();return;}settled=true;clearTimeout(timer);error?reject(error):resolve(db);}
  try{
   if(typeof indexedDB==='undefined')throw Error('IndexedDB unavailable.');
   request=indexedDB.open('panorama-review-autosave',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('states'))request.result.createObjectStore('states');};
   request.onerror=()=>finish(request.error||Error('Browser database denied.'));
   request.onblocked=()=>finish(Error('Browser database blocked.'));
   request.onsuccess=()=>finish(null,request.result);
  }catch(e){finish(e);}
 });
 return dbPromise;
}
async function databaseRecord(record){
 const db=await openSaveDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('states',record===undefined?'readonly':'readwrite');
  const store=tx.objectStore('states');const request=record===undefined?store.get(key):store.put(record,key);
  tx.oncomplete=()=>resolve(request.result);
  tx.onabort=tx.onerror=()=>reject(tx.error||request.error||Error('Browser database save failed.'));
 });
}
try{
 const saved=localStorage.getItem(key);
 if(saved){const record=JSON.parse(saved);state=unpackState(record);savedAt=record.savedAt||0;notice('Restored your saved edits.');}
}catch(e){notice('Saved state could not load. Original review is shown; import your JSON if needed.',true);}
function persist(){
 const generation=++saveGeneration,record=packState(state);savedAt=record.savedAt;
 try{localStorage.setItem(key,JSON.stringify(record));savePending=false;saveFailed=false;notice('Saved in browser · download to send back');return Promise.resolve(true);}
 catch(e){savePending=true;notice('Saving in browser database…');}
 // Snapshot now; serialize fallback writes so the newest edit always wins.
 const snapshot=clone(record);
 saveQueue=saveQueue.catch(()=>{}).then(()=>databaseRecord(snapshot)).then(()=>{
  if(generation===saveGeneration){savePending=false;saveFailed=false;notice('Saved in browser database · download to send back');}return true;
 },error=>{
  if(generation===saveGeneration){savePending=false;saveFailed=true;notice('Browser storage blocked or full. Download edits to keep your work. ('+(error.name||'Storage error')+')',true);}return false;
 });
 return saveQueue;
}
let recoveringSave=typeof indexedDB!=='undefined';
// Prevent edits until the asynchronous fallback has been checked, never overwrite live edits.
for(const event of ['pointerdown','click','keydown','input','change'])document.addEventListener(event,e=>{
 if(recoveringSave){e.preventDefault();e.stopImmediatePropagation();}
},true);
async function recoverDatabaseSave(){
 if(!recoveringSave)return;
 notice('Checking browser autosave…');
 try{
  const record=await databaseRecord();
  if(record&&(record.savedAt||0)>savedAt&&saveGeneration===0){state=unpackState(record);savedAt=record.savedAt;renderView(false);notice('Restored your saved edits from browser database.');}
  else notice(savedAt?'Restored your saved edits.':'Ready · edits will save automatically');
 }catch(e){notice('Ready · browser save will be checked when you edit.');}
 finally{recoveringSave=false;}
}
window.addEventListener('beforeunload',e=>{if(savePending||saveFailed){e.preventDefault();e.returnValue='';}});
// End autosave.

function view(){return DATA.views[index];}function list(){return state.annotations[view().view_index];}function active(){return list().find(a=>a.id===selected&&!a.deleted);}
function review(){const id=view().view_index;return state.reviews[id]||(state.reviews[id]={decision:'not_reviewed',notes:'',exclusion_reason:null});}
function snapshot(){return {state:clone(state),index,selected};}
function checkpoint(before){undoStack.push(before);if(undoStack.length>70)undoStack.shift();redoStack=[];buttons();}
function restore(s){lastRightClick=null;state=clone(s.state);index=s.index;selected=s.selected;renderView(false);persist();buttons();}
function buttons(){$('undo').disabled=!undoStack.length;$('redo').disabled=!redoStack.length;}
function renderReviewButtons(){const decision=review().decision;$('reviewNotReviewed').setAttribute('aria-pressed',String(decision==='not_reviewed'||decision==='needs_changes'));$('reviewReviewed').setAttribute('aria-pressed',String(decision==='looks_correct'));}
function edited(){review().decision='not_reviewed';review().exclusion_reason=null;review().updated=new Date().toISOString();renderReviewButtons();}
function normalise(a){a.class_id=DATA.class_names.indexOf(a.proposed_class);a.normalized_corners=a.quad_pixels.map(p=>[+(p[0]/W).toFixed(8),+(p[1]/H).toFixed(8)]);a.status=a.deleted?'deleted_by_user':a.uncertain?'uncertain_review_only':'edited_pending_review';a.user_edited=true;}
function mutate(fn){lastRightClick=null;const before=snapshot();fn();edited();checkpoint(before);persist();renderSidebar();draw();progress();}
function node(tag,attrs){const e=document.createElementNS(NS,tag);Object.entries(attrs||{}).forEach(([k,v])=>e.setAttribute(k,String(v)));return e;}
function screen(p){return [tx+p[0]*scale,ty+p[1]*scale];}function world(p){return [(p[0]-tx)/scale,(p[1]-ty)/scale];}
function local(e){const b=vp.getBoundingClientRect();return [e.clientX-b.left-vp.clientLeft,e.clientY-b.top-vp.clientTop];}
function visible(a){return !a.deleted&&(!$('filter').value||a.proposed_class===$('filter').value);}
function rectangle(q){const center=q.reduce((s,p)=>[s[0]+p[0]/4,s[1]+p[1]/4],[0,0]);const dx=q[1][0]-q[0][0],dy=q[1][1]-q[0][1],width=Math.hypot(dx,dy),height=Math.hypot(q[2][0]-q[1][0],q[2][1]-q[1][1]);return {cx:center[0],cy:center[1],width,height,angle:Math.atan2(dy,dx),u:[dx/width,dy/width],v:[(q[3][0]-q[0][0])/height,(q[3][1]-q[0][1])/height]};}
function makeQuad(cx,cy,w,h,a){const u=[Math.cos(a),Math.sin(a)],v=[-Math.sin(a),Math.cos(a)];return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[cx+x*w*u[0]/2+y*h*v[0]/2,cy+x*w*u[1]/2+y*h*v[1]/2]);}
function rotationHandle(q){const c=q.reduce((s,p)=>[s[0]+p[0]/4,s[1]+p[1]/4],[0,0]),mid=[(q[0][0]+q[1][0])/2,(q[0][1]+q[1][1])/2],len=Math.hypot(mid[0]-c[0],mid[1]-c[1])||1,m=screen(mid);return {base:m,point:[m[0]+(mid[0]-c[0])/len*25,m[1]+(mid[1]-c[1])/len*25]};}
function draw(){
 $('world').setAttribute('transform',`translate(${tx} ${ty}) scale(${scale})`);$('polygons').replaceChildren();$('screenOverlay').replaceChildren();
 const shown=list().filter(visible).sort((a,b)=>{const area=q=>Math.abs((q[1][0]-q[0][0])*(q[3][1]-q[0][1])-(q[1][1]-q[0][1])*(q[3][0]-q[0][0]));return area(b.quad_pixels)-area(a.quad_pixels);});
 if($('show').checked)for(const a of shown){const color=a.uncertain?'#ffbf66':colors[a.proposed_class],sel=a.id===selected;
  $('polygons').append(node('polygon',{points:a.quad_pixels.map(p=>p.join(',')).join(' '),fill:'none',stroke:'#071019','stroke-width':sel?3.7:2.9,'stroke-opacity':.85,'vector-effect':'non-scaling-stroke','pointer-events':'none','stroke-dasharray':a.uncertain?'5 4':'none'}));
  const p=node('polygon',{points:a.quad_pixels.map(p=>p.join(',')).join(' '),fill:sel?color+'15':'transparent',stroke:color,'stroke-width':sel?2.5:2,'vector-effect':'non-scaling-stroke','stroke-dasharray':a.uncertain?'5 4':'none','data-box-id':a.id});
  const title=node('title');title.textContent=`${a.id} ${a.proposed_class}${a.uncertain?' (uncertain)':''}`;p.append(title);$('polygons').append(p);
  if(!a.uncertain&&($('ids').value==='all'||($('ids').value==='selected'&&sel))){
   const coords=a.quad_pixels.map(screen),anchor=coords.reduce((b,p)=>p[1]<b[1]?p:b),x=Math.max(3,Math.min(vp.clientWidth-23,anchor[0]+3)),y=Math.max(12,Math.min(vp.clientHeight-3,anchor[1]-5));
   const t=node('text',{x,y,fill:color,'font-size':10,'font-family':'system-ui','font-weight':600,stroke:'#08101a','stroke-width':2.5,'paint-order':'stroke','pointer-events':'none','data-label-id':a.id});t.textContent=a.id+(a.uncertain?'?':'');$('screenOverlay').append(t);
  }
 }
 const a=active();if(a&&$('show').checked&&visible(a)&&mode==='edit'){
  const rh=rotationHandle(a.quad_pixels);$('screenOverlay').append(node('line',{x1:rh.base[0],y1:rh.base[1],x2:rh.point[0],y2:rh.point[1],stroke:'#e8f4ff','stroke-width':1}));
  a.quad_pixels.forEach((p,i)=>{const s=screen(p);$('screenOverlay').append(node('circle',{cx:s[0],cy:s[1],r:4.5,fill:'#eaf6ff',stroke:'#12304a','stroke-width':1.5,'data-handle':i}));});
  $('screenOverlay').append(node('circle',{cx:rh.point[0],cy:rh.point[1],r:5,fill:'#91cbff',stroke:'#10304b','stroke-width':1.5,'data-handle':'rotate'}));
 }
 if(tempQuad)$('polygons').append(node('polygon',{points:tempQuad.map(p=>p.join(',')).join(' '),fill:'#5cff5722',stroke:'#b7ffd0','stroke-width':1.5,'stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke'}));
 drawUncertainMarkers();drawErasePreview();
 $('zoom').textContent=Math.round(scale/fitScale*100)+'%';
 $('counts').textContent=list().filter(a=>!a.deleted).length+' boxes · '+list().filter(a=>!a.deleted&&a.uncertain).length+' unsure';
}
function constrainPan(){tx=Math.max(28-W*scale,Math.min(vp.clientWidth-28,tx));ty=Math.max(28-H*scale,Math.min(vp.clientHeight-28,ty));}
function fit(){fitScale=Math.min(vp.clientWidth/W,vp.clientHeight/H);scale=fitScale;tx=(vp.clientWidth-W*scale)/2;ty=(vp.clientHeight-H*scale)/2;draw();}
function zoom(f,p=[vp.clientWidth/2,vp.clientHeight/2]){const w=world(p);scale=Math.max(fitScale*.5,Math.min(fitScale*40,scale*f));tx=p[0]-w[0]*scale;ty=p[1]-w[1]*scale;constrainPan();draw();}
function focusBox(){const a=active();if(!a)return;const r=rectangle(a.quad_pixels);scale=Math.min(fitScale*40,Math.max(fitScale,Math.min(vp.clientWidth/(r.width*1.6+80),vp.clientHeight/(r.height*1.6+80))));tx=vp.clientWidth/2-r.cx*scale;ty=vp.clientHeight/2-r.cy*scale;draw();}
function setMode(m){if(drag)finishDrag(null,true);lastLeftClick=null;lastRightClick=null;if(mode==='paste'&&m!=='paste')tempQuad=null;mode=m;for(const x of ['edit','pan','add','erase'])$(x+'Mode').classList.toggle('active',x===m);vp.className=m;updateAddButton();draw();}
function select(id){selected=id;renderSidebar();draw();}
function classOptions(sel,value){sel.replaceChildren();DATA.class_names.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.append(o);});sel.value=value;}
function renderSidebar(){
 clipboardButtons();
 const a=active();$('selection').hidden=!a;$('emptySelection').hidden=!!a;$('focus').disabled=!a;
 if(a){$('selectedTitle').textContent='Box '+a.id;$('selectedClass').value=a.proposed_class;$('uncertain').checked=!!a.uncertain;$('selectedNote').textContent=a.note||'';const r=rectangle(a.quad_pixels);for(const [id,val] of Object.entries({cx:r.cx,cy:r.cy,bw:r.width,bh:r.height,angle:r.angle*180/Math.PI}))$(id).value=val.toFixed(1);}
 $('boxList').replaceChildren();for(const a of list().filter(visible)){
  const row=document.createElement('div');row.className='box-row'+(a.id===selected?' active':'');const b=document.createElement('button');b.textContent=a.id;b.title='Select box '+a.id;b.onclick=()=>select(a.id);b.ondblclick=()=>{select(a.id);focusBox();};
  const sel=document.createElement('select');classOptions(sel,a.proposed_class);sel.setAttribute('aria-label','Class for box '+a.id);sel.dataset.boxClass=a.id;sel.onchange=()=>{selected=a.id;mutate(()=>{a.proposed_class=sel.value;a.uncertain=false;normalise(a);});};
  const flag=document.createElement('span');flag.className='flag';flag.textContent=a.uncertain?'?':'';row.append(b,sel,flag);$('boxList').append(row);
 }
 const r=review();renderReviewButtons();$('notes').value=r.notes||'';
 $('pending').textContent=(PENDING[view().view_index]||[]).join('\n\n')||'No additional positioning request recorded. Check any uncertain boxes before final approval.';
 $('issues').replaceChildren();view().review_issues.forEach(t=>{const li=document.createElement('li');li.textContent=t;$('issues').append(li);});
}
// Counts are derived from the live session, never the saved DATA counts.
let lastUncertainView=null;
function uncertainViews(){
 return DATA.views.map((v,i)=>({index:i,view:v.view_index,boxes:state.annotations[v.view_index].filter(a=>!a.deleted&&a.uncertain).sort((a,b)=>a.id-b.id)})).filter(v=>v.boxes.length);
}
function renderUncertaintyCards(){
 const views=uncertainViews(),total=views.reduce((sum,v)=>sum+v.boxes.length,0),button=$('uncertainCard');
 $('uncertainTotal').textContent=String(total);
 $('uncertainScope').textContent=total?`${views.length} ${views.length===1?'view':'views'} · Click for next view →`:'All clear · no uncertain boxes';
 button.disabled=total===0;button.classList.toggle('has-uncertainty',total>0);
 button.setAttribute('aria-label',`${total} uncertain ${total===1?'box':'boxes'} across ${views.length} views. ${total?'Go to the next affected view.':'No uncertain boxes.'}`);
 $('reviewedTotal').textContent=Object.values(state.reviews).filter(r=>r.decision==='looks_correct').length+'/'+DATA.views.length;
}
function revealUncertain(id){
 cancelPendingChord();lastLeftClick=null;lastRightClick=null;lastPointer=null;
 $('filter').value='';$('show').checked=true;selected=id;tempQuad=null;
 setMode('edit');renderSidebar();focusBox();
 const boxes=list().filter(a=>!a.deleted&&a.uncertain).sort((a,b)=>a.id-b.id),position=boxes.findIndex(a=>a.id===id)+1;
 notice(`View ${String(view().view_index).padStart(2,'0')} · uncertain box ${position}/${boxes.length} (ID ${id}). Use Next uncertain box to check this view.`);
}
function nextUncertainView(){
 if(drag)return;
 const views=uncertainViews();if(!views.length){renderUncertaintyCards();notice('No uncertain boxes remain.');return;}
 const current=views.find(v=>v.index===index);
 const target=current&&lastUncertainView!==index?current:(views.find(v=>v.index>index)||views[0]);
 const previousSelected=selected,sameView=target.index===index,alreadyVisited=lastUncertainView===index;
 if(!sameView)change(target.index);
 const oldPosition=target.boxes.findIndex(a=>a.id===previousSelected);
 const box=target.boxes[views.length===1&&sameView&&alreadyVisited?(oldPosition+1)%target.boxes.length:0];
 lastUncertainView=index;revealUncertain(box.id);
}
function nextUncertainBox(){
 if(drag)return;
 const boxes=list().filter(a=>!a.deleted&&a.uncertain).sort((a,b)=>a.id-b.id);if(!boxes.length)return;
 revealUncertain(boxes[(boxes.findIndex(a=>a.id===selected)+1)%boxes.length].id);
}
function drawUncertainMarkers(){
 const boxes=list().filter(a=>!a.deleted&&a.uncertain);
 $('nextUncertainBox').disabled=boxes.length===0;
 $('nextUncertainBox').textContent=`Next uncertain box (${boxes.length})`;
 if(!$('show').checked)return;
 for(const a of boxes.filter(visible)){
  const r=rectangle(a.quad_pixels),center=screen([r.cx,r.cy]);
  if(center[0]<0||center[0]>vp.clientWidth||center[1]<0||center[1]>vp.clientHeight)continue;
  if(Math.max(r.width,r.height)*scale<28)$('screenOverlay').append(node('circle',{cx:center[0],cy:center[1],r:15,fill:'none',stroke:'#ffd083','stroke-width':2,'stroke-dasharray':'3 3','pointer-events':'none','data-uncertain-marker':a.id}));
  const points=a.quad_pixels.map(screen),top=points.reduce((best,p)=>p[1]<best[1]?p:best);
  const label=node('text',{x:Math.max(5,Math.min(vp.clientWidth-80,top[0])),y:Math.max(15,Math.min(vp.clientHeight-5,top[1]-8)),fill:'#ffda91','font-size':13,'font-weight':700,stroke:'#071019','stroke-width':4,'paint-order':'stroke','pointer-events':'none','data-uncertain-label':a.id});
  label.textContent=`? Box ${a.id}`;$('screenOverlay').append(label);
 }
}
$('uncertainCard').onclick=nextUncertainView;
$('nextUncertainBox').onclick=nextUncertainBox;

function progress(){renderUncertaintyCards();[...$('grid').children].forEach((b,i)=>{const r=state.reviews[i+1]||{};b.classList.toggle('active',i===index);b.style.boxShadow=({looks_correct:'inset 0 -3px #a3af98',needs_changes:'inset 0 -3px #b49462',exclude:'inset 0 -3px #aaa99f'})[r.decision]||'none';});$('progress').textContent=Object.values(state.reviews).filter(r=>r.decision==='looks_correct').length+'/'+DATA.views.length+' reviewed';}
function renderView(reset=true){saveUI();const v=view();$('view').value=index;$('photo').setAttribute('href',v.image);$('viewTitle').textContent=`View ${String(v.view_index).padStart(2,'0')} · ${v.pitch_band}`;renderSidebar();progress();if(reset)fit();else draw();buttons();}
function change(i){if(drag)return;lastUncertainView=null;cancelPendingChord();lastPointer=null;lastRightClick=null;lastLeftClick=null;index=(i+DATA.views.length)%DATA.views.length;selected=null;tempQuad=null;renderView();}

// Sweep a six-screen-pixel eraser across edges, including between pointer events.
const eraserRadius=6;
function pointSegmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/len)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function segmentDistance(a,b,c,d){
 const cross=(u,v)=>u[0]*v[1]-u[1]*v[0],r=[b[0]-a[0],b[1]-a[1]],s=[d[0]-c[0],d[1]-c[1]],q=[c[0]-a[0],c[1]-a[1]],den=cross(r,s);
 if(Math.abs(den)>1e-12){const t=cross(q,s)/den,u=cross(q,r)/den;if(t>=0&&t<=1&&u>=0&&u<=1)return 0;}
 return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}
function eraseSweep(d,end){
 if($('show').checked)for(const a of list().filter(visible)){
  if(a.quad_pixels.some((p,i)=>segmentDistance(d.end,end,p,a.quad_pixels[(i+1)%4])<=eraserRadius/scale)){
   a.deleted=true;normalise(a);d.erased++;if(selected===a.id)selected=null;
  }
 }
 d.end=end;renderSidebar();draw();
}
function drawErasePreview(){
 if(mode!=='erase'||!lastPointer)return;
 const p=screen(lastPointer);$('screenOverlay').append(node('circle',{cx:p[0],cy:p[1],r:eraserRadius,fill:'#ff565633',stroke:'#ff9999','stroke-width':1.5,'pointer-events':'none'}));
}
function beginErase(){cancelPendingChord();chordHeld=false;setMode('erase');notice('Eraser: hold left-click and brush across box edges. Ctrl+Z undoes one stroke; Esc cancels. Class filter applies.');}

function contains(p,q){let sign=0;for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],z=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);if(Math.abs(z)<1e-6)continue;if(sign&&Math.sign(z)!==sign)return false;sign=Math.sign(z);}return true;}
function hit(p){const a=active();if(a&&visible(a)&&contains(p,a.quad_pixels))return a;const found=list().filter(a=>visible(a)&&contains(p,a.quad_pixels));found.sort((a,b)=>{const x=rectangle(a.quad_pixels),y=rectangle(b.quad_pixels);return x.width*x.height-y.width*y.height;});return found[0];}
vp.addEventListener('wheel',e=>{e.preventDefault();lastRightClick=null;lastLeftClick=null;if(drag)return;if(e.shiftKey){tx-=e.deltaY||e.deltaX;constrainPan();draw();}else zoom(Math.exp(-Math.max(-150,Math.min(150,e.deltaY))*.0025),local(e));},{passive:false});
// Box clipboard stays inside this editor tab; no system clipboard permission needed.
let boxClipboard=null,lastPointer=null,chordHeld=false,pendingChord=null;
const chordDelay=650;
function cancelPendingChord(){if(pendingChord){clearTimeout(pendingChord.timer);pendingChord=null;}}
function clipboardButtons(){
 $('copyBox').disabled=!active();$('pasteBox').disabled=!boxClipboard;
 $('pasteBox').classList.toggle('active',mode==='paste');
 $('pasteBox').textContent=boxClipboard?'Paste '+boxClipboard.proposed_class+' #'+boxClipboard.source_id:'Paste box';
 $('pasteBox').title=boxClipboard?'Copied from view '+String(boxClipboard.source_view).padStart(2,'0')+'. Press both mouse buttons twice at the destination, or click here, then left-click the image to place a preview.':'Copy a box first (both mouse buttons once, or Copy box).';
}
function rememberBox(a,sourceView=view().view_index){
 if(!a||a.deleted){notice('Select a box to copy.');return false;}
 boxClipboard={proposed_class:a.proposed_class,quad_pixels:clone(a.quad_pixels),uncertain:!!a.uncertain,geometry_pending:!!a.geometry_pending,source_view:sourceView,source_id:a.id};
 clipboardButtons();notice('Copied box '+a.id+' · press both mouse buttons twice at the destination to paste');return true;
}
function copyBox(){if(drag)finishDrag(null,true);cancelPendingChord();rememberBox(active());}
function copyPlacement(point){
 if(!boxClipboard)return null;
 const q=boxClipboard.quad_pixels,r=rectangle(q);let dx=point[0]-r.cx,dy=point[1]-r.cy;
 dx=Math.max(-Math.min(...q.map(p=>p[0])),Math.min(W-Math.max(...q.map(p=>p[0])),dx));
 dy=Math.max(-Math.min(...q.map(p=>p[1])),Math.min(H-Math.max(...q.map(p=>p[1])),dy));
 return q.map(p=>[p[0]+dx,p[1]+dy]);
}
function beginPaste(){
 if(drag)finishDrag(null,true);cancelPendingChord();
 if(!boxClipboard){notice('Select a box and click Copy box first.');return;}
 $('show').checked=true;$('filter').value='';setMode('paste');
 tempQuad=copyPlacement(lastPointer||[W/2,H/2]);renderSidebar();draw();
 notice('Move over the image, then left-click to place the copy. Right-click or Esc cancels.');
}
function pasteBox(point=null){
 if(drag)return;if(!boxClipboard){notice('Copy a box first.');return false;}
 const c=boxClipboard,q=clone(c.quad_pixels),r=rectangle(q),target=point||lastPointer||[r.cx+24,r.cy+24];
 let dx=target[0]-r.cx,dy=target[1]-r.cy;
 dx=Math.max(-Math.min(...q.map(p=>p[0])),Math.min(W-Math.max(...q.map(p=>p[0])),dx));
 dy=Math.max(-Math.min(...q.map(p=>p[1])),Math.min(H-Math.max(...q.map(p=>p[1])),dy));
 const moved=q.map(p=>[p[0]+dx,p[1]+dy]);if(!validQuad(moved)){notice('This box cannot fit inside the image.',true);return false;}
 if($('filter').value&&$('filter').value!==c.proposed_class)$('filter').value='';
 mutate(()=>{const a={id:Math.max(0,...list().map(x=>x.id))+1,proposed_class:c.proposed_class,quad_pixels:moved,uncertain:c.uncertain,geometry_pending:c.geometry_pending,deleted:false,origin:'user_copied',copied_from:{view:c.source_view,id:c.source_id},note:'Copied box; check placement and class.'};normalise(a);list().push(a);selected=a.id;});
 setMode('edit');clipboardButtons();return true;
}
function mouseChord(e){
 if(mode==='erase')return false;
 if(chordHeld&&(e.buttons&3)===0)chordHeld=false;
 if((e.buttons&3)!==3||e.pointerType&&e.pointerType!=='mouse')return false;
 if(space||!$('show').checked||!$('help').hidden)return false;
 e.preventDefault();if(chordHeld)return true;chordHeld=true;
 const p=local(e);if(drag)finishDrag(null,true);lastLeftClick=null;lastRightClick=null;vp.focus();
 const w=world(p),a=hit(w)||active(),now=performance.now();lastPointer=w;
 if(pendingChord&&pendingChord.viewIndex===index&&now-pendingChord.time<=chordDelay&&Math.hypot(p[0]-pendingChord.p[0],p[1]-pendingChord.p[1])<=24){
  const source=pendingChord.pasteSource;cancelPendingChord();
  if(source){boxClipboard=clone(source);pasteBox(w);}else notice('Copy a box first.');
  return true;
 }
 cancelPendingChord();
 // Copy now; a later pointer cancellation must never discard the clipboard.
 // Keep the prior copy for a second press over a different destination box.
 const previousCopy=boxClipboard?clone(boxClipboard):null;
 if(a)rememberBox(a);
 else if(boxClipboard)notice('Press both buttons once more here to paste the copied box.');
 else notice('Press both buttons over a box to copy it, or select a box and click Copy box.');
 const request={time:now,p,viewIndex:index,pasteSource:previousCopy||(boxClipboard?clone(boxClipboard):null),timer:null};pendingChord=request;
 request.timer=setTimeout(()=>{if(pendingChord===request)pendingChord=null;},chordDelay);
 return true;
}
// Mouse pointerdown fires only for the first button. The second button may
// arrive as pointermove or mousedown, so both paths detect buttons===3.
vp.addEventListener('mousedown',e=>{if(mouseChord(e))e.stopImmediatePropagation();},true);
vp.addEventListener('mousemove',e=>{if((e.buttons&3)===3)mouseChord(e);});
function releaseMouseChord(e){if((e.buttons&3)===0)chordHeld=false;}
// Pointer release is authoritative: preventDefault can suppress mouseup.
window.addEventListener('pointerup',releaseMouseChord,true);
window.addEventListener('mouseup',releaseMouseChord,true);
window.addEventListener('pointercancel',()=>{chordHeld=false;},true);
window.addEventListener('pointermove',e=>{if(chordHeld&&(e.buttons&3)===0)chordHeld=false;},true);
// Retain the image destination when the pointer moves to the Paste button.
$('copyBox').onclick=copyBox;
$('pasteBox').onclick=beginPaste;

vp.addEventListener('pointerdown',e=>{
 if(mode==='erase'&&e.button===2){e.preventDefault();if(drag)finishDrag(null,true);setMode('edit');return;}
 if(mode==='erase'&&e.button===0&&!space){
  e.preventDefault();if(drag||!$('show').checked)return;vp.focus();const p=local(e),w=world(p);
  if(w[0]<0||w[0]>W||w[1]<0||w[1]>H)return;
  lastLeftClick=null;lastRightClick=null;drag={kind:'erase',p,w,end:w,pointerId:e.pointerId,button:0,before:snapshot(),erased:0};lastPointer=w;vp.setPointerCapture(e.pointerId);eraseSweep(drag,w);return;
 }
 if(mouseChord(e)||chordHeld){e.preventDefault();return;}
 if(mode==='paste'&&e.button===0&&!space){
  e.preventDefault();vp.focus();const p=local(e),w=world(p);
  if(w[0]<0||w[0]>W||w[1]<0||w[1]>H)return;
  drag={kind:'pasteClick',p,pointerId:e.pointerId,button:0,moved:false};vp.setPointerCapture(e.pointerId);return;
 }
 if(mode==='paste'&&e.button===2){e.preventDefault();tempQuad=null;setMode('edit');notice('Paste canceled. The copied box is still available.');return;}
 if(e.button===2){
  e.preventDefault();lastLeftClick=null;
  if(drag||space||!$('show').checked){lastRightClick=null;return;}
  vp.focus();const p=local(e),a=hit(world(p));
  if(!a){lastRightClick=null;return;}
  select(a.id);
  drag={kind:'deleteClick',id:a.id,viewIndex:index,p,pointerId:e.pointerId,moved:false};
  vp.setPointerCapture(e.pointerId);return;
 }
 lastRightClick=null;
 if(e.button!==0&&e.button!==1)return;if(drag)return;if(e.button!==0||space)lastLeftClick=null;e.preventDefault();vp.focus();const p=local(e),w=world(p);let a=active(),kind='pan',corner=null;
 if(!space&&e.button!==1&&mode==='edit'&&$('show').checked){if(a&&visible(a)){const rh=rotationHandle(a.quad_pixels);if(Math.hypot(p[0]-rh.point[0],p[1]-rh.point[1])<10)kind='rotate';else {const k=a.quad_pixels.map(screen).findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<9);if(k>=0){kind='resize';corner=k;}}}
  if(kind==='pan'){a=hit(w);if(a){selected=a.id;kind='move';renderSidebar();draw();}else{selected=null;renderSidebar();draw();}}
 }else if(!space&&e.button!==1&&mode==='add'){if(w[0]<0||w[0]>W||w[1]<0||w[1]>H)return;kind='add';}
 drag={kind,p,w,tx,ty,before:snapshot(),quad:a?clone(a.quad_pixels):null,id:a?a.id:null,corner,pointerId:e.pointerId,button:e.button,addClickEligible:e.button===0&&!space,moved:false};vp.setPointerCapture(e.pointerId);
});
function lerpValid(initial,candidate){if(validQuad(candidate))return candidate;let lo=0,hi=1;for(let n=0;n<24;n++){const t=(lo+hi)/2,q=initial.map((p,i)=>p.map((x,j)=>x+(candidate[i][j]-x)*t));if(validQuad(q))lo=t;else hi=t;}return initial.map((p,i)=>p.map((x,j)=>x+(candidate[i][j]-x)*lo));}
vp.addEventListener('pointermove',e=>{
 lastPointer=world(local(e));if(mouseChord(e)||chordHeld){e.preventDefault();return;}
 if(mode==='paste'&&!drag){tempQuad=copyPlacement(lastPointer);draw();return;}
 if(mode==='erase'&&!drag){draw();return;}
 if(!drag||e.pointerId!==drag.pointerId)return;const p=local(e),w=world(p),d=drag;if(Math.hypot(p[0]-d.p[0],p[1]-d.p[1])>2)d.moved=true;
 if(d.kind==='erase'){eraseSweep(d,w);return;}
 if(d.kind==='deleteClick'||d.kind==='pasteClick')return;
 if(d.kind==='pan'){tx=d.tx+p[0]-d.p[0];ty=d.ty+p[1]-d.p[1];constrainPan();draw();return;}
 if(d.kind==='add'){const x=Math.max(0,Math.min(W,w[0])),y=Math.max(0,Math.min(H,w[1]));tempQuad=[[Math.min(d.w[0],x),Math.min(d.w[1],y)],[Math.max(d.w[0],x),Math.min(d.w[1],y)],[Math.max(d.w[0],x),Math.max(d.w[1],y)],[Math.min(d.w[0],x),Math.max(d.w[1],y)]];draw();return;}
 const a=list().find(a=>a.id===d.id),r=rectangle(d.quad);let q;
 if(d.kind==='move'){let dx=w[0]-d.w[0],dy=w[1]-d.w[1];dx=Math.max(-Math.min(...d.quad.map(p=>p[0])),Math.min(W-Math.max(...d.quad.map(p=>p[0])),dx));dy=Math.max(-Math.min(...d.quad.map(p=>p[1])),Math.min(H-Math.max(...d.quad.map(p=>p[1])),dy));q=d.quad.map(p=>[p[0]+dx,p[1]+dy]);}
 if(d.kind==='resize'){const k=d.corner,opp=d.quad[(k+2)%4],sx=[-1,1,1,-1][k],sy=[-1,-1,1,1][k],delta=[w[0]-opp[0],w[1]-opp[1]],ww=Math.max(2,sx*(delta[0]*r.u[0]+delta[1]*r.u[1])),hh=Math.max(2,sy*(delta[0]*r.v[0]+delta[1]*r.v[1])),c=[opp[0]+sx*ww*r.u[0]/2+sy*hh*r.v[0]/2,opp[1]+sx*ww*r.u[1]/2+sy*hh*r.v[1]/2];q=makeQuad(c[0],c[1],ww,hh,r.angle);q=lerpValid(d.quad,q);}
 if(d.kind==='rotate'){const before=Math.atan2(d.w[1]-r.cy,d.w[0]-r.cx),now=Math.atan2(w[1]-r.cy,w[0]-r.cx);let angle=r.angle+now-before;if(e.shiftKey)angle=Math.round(angle/(Math.PI/12))*Math.PI/12;q=makeQuad(r.cx,r.cy,r.width,r.height,angle);if(!validQuad(q))return;}
 if(q&&validQuad(q)){a.quad_pixels=q;draw();}
});
function finishDrag(e,cancel=false){if(!drag)return;const d=drag;drag=null;try{vp.releasePointerCapture(d.pointerId);}catch(e){}
 if(d.kind==='erase'){
  lastLeftClick=null;lastRightClick=null;
  if(cancel){state=clone(d.before.state);selected=d.before.selected;renderSidebar();draw();progress();notice('Eraser stroke canceled.');return;}
  if(e)eraseSweep(d,world(local(e)));
  if(d.erased){
   edited();const prior=d.before.state.reviews[view().view_index];
   if(prior){prior.decision='not_reviewed';prior.exclusion_reason=null;}
   checkpoint(d.before);persist();renderSidebar();draw();progress();
  }else notice('No box edges touched. Hold left-click and brush across an edge.');
  return;
 }
 if(d.kind==='pasteClick'){
  const p=e?local(e):d.p,w=world(p);tempQuad=null;
  if(!cancel&&Math.hypot(p[0]-d.p[0],p[1]-d.p[1])<=6&&w[0]>=0&&w[0]<=W&&w[1]>=0&&w[1]<=H)pasteBox(w);
  else draw();return;
 }
 if(d.kind==='deleteClick'){
  const p=e?local(e):d.p;
  const a=!cancel&&!d.moved&&!space&&$('show').checked&&index===d.viewIndex&&Math.hypot(p[0]-d.p[0],p[1]-d.p[1])<=6?hit(world(p)):null;
  if(!a||a.id!==d.id){lastRightClick=null;return;}
  const now=performance.now();
  if(lastRightClick&&lastRightClick.id===a.id&&lastRightClick.viewIndex===index&&now-lastRightClick.time<=400&&Math.hypot(p[0]-lastRightClick.p[0],p[1]-lastRightClick.p[1])<=6){
   lastRightClick=null;mutate(()=>{a.deleted=true;normalise(a);selected=null;});notice('Box '+a.id+' deleted · Ctrl+Z to undo');
  }else lastRightClick={id:a.id,viewIndex:index,time:now,p};
  return;
 }
 if(cancel){lastLeftClick=null;if(d.kind!=='pan')state=d.before.state;tempQuad=null;renderSidebar();draw();return;}
 // A wheel-button click toggles erasing; a wheel-button drag remains pan.
 if(d.kind==='pan'&&d.button===1&&!space&&!d.moved&&e&&Math.hypot(...local(e).map((v,i)=>v-d.p[i]))<=4){
  if(mode==='erase'){setMode('edit');notice('Eraser off · Edit boxes');}else beginErase();
  renderSidebar();return;
 }
 if(d.addClickEligible&&!space){
  const p=e?local(e):d.p,now=performance.now();
  const click=!d.moved&&Math.hypot(p[0]-d.p[0],p[1]-d.p[1])<=6;
  if(click&&lastLeftClick&&now-lastLeftClick.time<=400&&Math.hypot(p[0]-lastLeftClick.p[0],p[1]-lastLeftClick.p[1])<=6){lastLeftClick=null;setMode('add');notice('Add box: '+newBoxClass()+' · 0–8 choose class · drag to draw');}
  else lastLeftClick=click?{time:now,p}:null;
 }
 let changed=false;
 if(d.kind==='add'&&tempQuad&&validQuad(tempQuad)&&d.moved){const id=Math.max(0,...list().map(a=>a.id))+1,cls=newBoxClass();const a={id,proposed_class:cls,quad_pixels:tempQuad,uncertain:false,deleted:false,note:'Added in annotation editor.',origin:'user_added'};normalise(a);list().push(a);selected=id;changed=true;setMode('edit');}
 else if(['move','resize','rotate'].includes(d.kind)&&d.moved){const a=list().find(a=>a.id===d.id);if(JSON.stringify(a.quad_pixels)!==JSON.stringify(d.quad)){a.geometry_pending=false;a.geometry_edited=true;normalise(a);changed=true;}}
 tempQuad=null;if(changed){edited();checkpoint(d.before);persist();}renderSidebar();draw();progress();
}
vp.addEventListener('pointerup',e=>{if(drag&&e.pointerId===drag.pointerId&&e.button===(drag.kind==='deleteClick'?2:drag.button))finishDrag(e);});vp.addEventListener('pointercancel',e=>finishDrag(e,true));vp.addEventListener('lostpointercapture',e=>{if(drag)finishDrag(e,true);});
$('prev').onclick=()=>change(index-1);$('next').onclick=()=>change(index+1);$('view').onchange=e=>change(+e.target.value);
for(const m of ['edit','pan','add','erase'])$(m+'Mode').onclick=()=>setMode(m);
$('eraseMode').onclick=beginErase;
$('fit').onclick=fit;$('plus').onclick=()=>zoom(1.35);$('minus').onclick=()=>zoom(1/1.35);$('focus').onclick=focusBox;
$('undo').onclick=()=>{if(drag||!undoStack.length)return;const s=undoStack.pop();redoStack.push(snapshot());restore(s);};$('redo').onclick=()=>{if(drag||!redoStack.length)return;const s=redoStack.pop();undoStack.push(snapshot());restore(s);};
$('show').onchange=draw;$('ids').onchange=draw;$('filter').onchange=()=>{renderSidebar();draw();};
$('selectedClass').onchange=()=>{const a=active();if(a)mutate(()=>{a.proposed_class=$('selectedClass').value;a.uncertain=false;normalise(a);});};
$('uncertain').onchange=()=>{const a=active();if(a)mutate(()=>{a.uncertain=$('uncertain').checked;normalise(a);});};
$('delete').onclick=()=>{const a=active();if(a)mutate(()=>{a.deleted=true;normalise(a);selected=null;});};
$('applyGeometry').onclick=()=>{const a=active();if(!a)return;const vals=['cx','cy','bw','bh','angle'].map(id=>Number($(id).value)),[cx,cy,w,h,degrees]=vals,q=makeQuad(cx,cy,w,h,degrees*Math.PI/180);if(!vals.every(Number.isFinite)||w<2||h<2||!validQuad(q)){notice('Box must stay inside the image with width / height at least 2 pixels.',true);return;}mutate(()=>{a.quad_pixels=q;a.geometry_pending=false;a.geometry_edited=true;normalise(a);});};
function saveReview(decision){if(drag)return;const r=review();if(decision){r.decision=decision;r.exclusion_reason=null;}r.notes=$('notes').value;r.updated=new Date().toISOString();renderReviewButtons();persist();progress();}
$('reviewNotReviewed').onclick=()=>saveReview('not_reviewed');$('reviewReviewed').onclick=()=>saveReview('looks_correct');$('notes').oninput=()=>saveReview();
function exported(){return {schema:'panorama-annotation-edits/v2',panorama_id:DATA.panorama_id,source_image_id:DATA.source_image_id,revision:DATA.revision,parent_revision:DATA.parent_revision,source_sha256:DATA.source_sha256,base_annotation_sha256:DATA.base_annotation_sha256,exported:new Date().toISOString(),image_size:[W,H],class_names:DATA.class_names,coordinates:'quad_pixels are on the original 1920 x 1080 clean view, independent of screen zoom and pan.',note:'Full edited annotations and review decisions. Deleted records retained for traceability. Not automatically approved for training.',views:Object.fromEntries(DATA.views.map(v=>[v.view_index,{...(state.reviews[v.view_index]||{decision:'not_reviewed',notes:''}),view_index:v.view_index,image:v.image,yaw_deg:v.yaw_deg,pitch_deg:v.pitch_deg,annotations:state.annotations[v.view_index].map(a=>{const b=clone(a);b.class_id=DATA.class_names.indexOf(b.proposed_class);b.quad_pixels=b.quad_pixels.map(p=>p.map(x=>+x.toFixed(4)));b.normalized_corners=b.quad_pixels.map(p=>[+(p[0]/W).toFixed(8),+(p[1]/H).toFixed(8)]);return b;})}]))};}
$('download').onclick=()=>{if(drag)return;const blob=new Blob([JSON.stringify(exported(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=DATA.source_image_id+'_'+DATA.panorama_id+'_annotation_edits_r'+DATA.revision+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Edits downloaded. Send this JSON back.');};
$('import').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const d=JSON.parse(await f.text());if(d.source_sha256!==DATA.source_sha256||d.panorama_id!==DATA.panorama_id)throw Error('This file belongs to a different panorama.');if(!d.views||typeof d.views!=='object')throw Error('Missing views.');const next=clone(state);
 if(['panorama-annotation-edits/v2','panorama-annotation-edits/v3'].includes(d.schema)){
  if(d.revision!==DATA.revision||d.base_annotation_sha256!==DATA.base_annotation_sha256)throw Error('This edit file uses a different base revision.');
  for(const v of DATA.views){const r=d.views[v.view_index];if(!r||!Array.isArray(r.annotations))throw Error('Missing annotations for view '+v.view_index);next.annotations[v.view_index]=clone(r.annotations);next.reviews[v.view_index]={decision:r.class_decisions?(DATA.class_names.every(c=>r.class_decisions[c]==='looks_correct')?'looks_correct':'not_reviewed'):r.decision,notes:r.notes||'',exclusion_reason:r.exclusion_reason||null,updated:r.updated};}
 }else {for(const [id,r] of Object.entries(d.views)){if(!DATA.views.some(v=>String(v.view_index)===id))throw Error('Invalid view ID.');next.reviews[id]={decision:r.class_decisions?(DATA.class_names.every(c=>r.class_decisions[c]==='looks_correct')?'looks_correct':'not_reviewed'):r.decision,notes:r.notes||'',exclusion_reason:r.exclusion_reason||null,updated:r.updated};}}
 validateState(next);const before=snapshot();state=next;selected=null;checkpoint(before);persist();renderView(false);notice('Imported successfully. Undo can restore the previous session.');
 }catch(err){notice('Import not applied: '+err.message,true);}finally{e.target.value='';}};
$('helpOpen').onclick=()=>$('help').hidden=false;$('helpClose').onclick=()=>$('help').hidden=true;
document.addEventListener('keydown',e=>{
 if(e.isComposing||e.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
 if(e.key==='Escape'){e.preventDefault();chordHeld=false;cancelPendingChord();$('help').hidden=true;if(drag)finishDrag(null,true);selected=null;tempQuad=null;lastLeftClick=null;setMode('edit');renderSidebar();draw();return;}
 if(!$('help').hidden)return;
 if((e.ctrlKey||e.metaKey)&&!e.altKey&&['c','v'].includes(e.key.toLowerCase())){e.preventDefault();if(!e.repeat&&!drag){cancelPendingChord();if(e.key.toLowerCase()==='c')copyBox();else pasteBox();}return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();return;}
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.code==='Space'){e.preventDefault();space=true;vp.style.cursor='grab';return;}
 if(drag)return;
 if(!e.repeat&&!e.shiftKey&&e.key.toLowerCase()==='e'){e.preventDefault();beginErase();return;}
 if(!e.repeat&&!e.shiftKey&&e.key.toLowerCase()==='b'){e.preventDefault();setMode('add');notice('Add box: '+newBoxClass()+' · 0–8 choose class · drag to draw');return;}
 if(!e.repeat&&!e.shiftKey&&e.key.toLowerCase()==='v'){e.preventDefault();setMode('edit');return;}
 if(!e.repeat&&!e.shiftKey&&/^[0-8]$/.test(e.key)){e.preventDefault();chooseClass(DATA.class_names[Number(e.key)]);return;}
 if(e.key==='Delete'||e.key==='Backspace'){if(active()){e.preventDefault();$('delete').click();}return;}
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){const a=active();if(a){e.preventDefault();const n=e.shiftKey?10:1,dx=(e.key==='ArrowRight'?n:e.key==='ArrowLeft'?-n:0),dy=(e.key==='ArrowDown'?n:e.key==='ArrowUp'?-n:0),q=a.quad_pixels.map(p=>[p[0]+dx,p[1]+dy]);if(validQuad(q))mutate(()=>{a.quad_pixels=q;a.geometry_pending=false;a.geometry_edited=true;normalise(a);});}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();change(index+(e.key==='ArrowRight'?1:-1));}}
 if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.3);}if(e.key==='-'){e.preventDefault();zoom(1/1.3);}
});document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;vp.style.cursor='';}});window.addEventListener('blur',()=>{cancelPendingChord();chordHeld=false;space=false;lastLeftClick=null;lastRightClick=null;vp.style.cursor='';if(drag)finishDrag(null,true);});
DATA.views.forEach((v,i)=>{const o=document.createElement('option');o.value=i;o.textContent=String(v.view_index).padStart(2,'0')+' · '+v.pitch_band;$('view').append(o);const b=document.createElement('button');b.textContent=String(v.view_index).padStart(2,'0');b.title=o.textContent;b.onclick=()=>change(i);$('grid').append(b);});
for(const c of DATA.class_names){const o=document.createElement('option');o.value=c;o.textContent=c;$('filter').append(o);}classOptions($('selectedClass'),'pipe');
new ResizeObserver(()=>{if(drag)finishDrag(null,true);fit();}).observe(vp);
renderView();

recoverDatabaseSave();
