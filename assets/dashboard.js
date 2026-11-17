(() => {
  const $=id=>document.getElementById(id);
  let batches=[], selectedId='demo', urls=[], loadGeneration=0, renderGeneration=0, selectionGeneration=0, chosen=[], busy=false, checking=false;
  const demo={id:'demo',name:'Sample scenes',data:DEMO_BATCH.data,initialReviews:DEMO_BATCH.reviews,images:DEMO_BATCH.data.views.map(v=>({name:v.pitch_band,width:1920,height:1080,url:v.image}))};
  function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
  function href(batch,index){const q=new URLSearchParams();if(batch.id!=='demo')q.set('batch',batch.id);if(index!==undefined)q.set('view',String(index));return 'reviewer.html'+(q.size?'?'+q:'');}
  function release(){urls.forEach(u=>URL.revokeObjectURL(u));urls=[];}
  let menuAnchor=null,menuBatch=null,renameTarget=null,renaming=false;
  const menu=el('div',undefined,'batch-menu');menu.hidden=true;menu.setAttribute('role','menu');
  const editAction=el('button','Edit name'),deleteAction=el('button','Delete batch','danger');
  for(const action of [editAction,deleteAction]){action.type='button';action.setAttribute('role','menuitem');menu.append(action);}document.body.append(menu);
  function closeMenu(restore=false){menu.hidden=true;menuAnchor?.setAttribute('aria-expanded','false');if(restore)menuAnchor?.focus();}
  function openMenu(batch,anchor){if(!menu.hidden&&menuAnchor===anchor){closeMenu();return;}closeMenu();menuBatch=batch;menuAnchor=anchor;anchor.setAttribute('aria-expanded','true');menu.hidden=false;const rect=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(rect.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(rect.bottom+5,innerHeight-menu.offsetHeight-8))+'px';editAction.focus();}
  document.addEventListener('click',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!menuAnchor?.contains(e.target))closeMenu();});
  menu.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeMenu(true);}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();(document.activeElement===editAction?deleteAction:editAction).focus();}if(e.key==='Tab')closeMenu();});
  window.addEventListener('resize',()=>closeMenu());document.addEventListener('scroll',()=>closeMenu(),true);
  const renameDialog=el('dialog');renameDialog.id='renameBatchDialog';renameDialog.setAttribute('aria-labelledby','renameBatchTitle');
  renameDialog.innerHTML='<form id="renameBatchForm"><h2 id="renameBatchTitle">Edit batch name</h2><label class="form-label" for="renameBatchInput">Batch name</label><input id="renameBatchInput" required maxlength="80" autocomplete="off"><p id="renameBatchError" role="alert"></p><footer><button id="renameBatchCancel" type="button">Cancel</button><button id="renameBatchSave" type="submit" class="primary">Save name</button></footer></form>';document.body.append(renameDialog);
  editAction.onclick=()=>{renameTarget=menuBatch;closeMenu();$('renameBatchInput').value=renameTarget.name;$('renameBatchError').textContent='';renameDialog.showModal();$('renameBatchInput').focus();$('renameBatchInput').select();};
  deleteAction.onclick=()=>{closeMenu();askDelete(menuBatch);};
  $('renameBatchCancel').onclick=()=>{if(!renaming)renameDialog.close();};renameDialog.addEventListener('cancel',e=>{if(renaming)e.preventDefault();});
  $('renameBatchForm').onsubmit=async e=>{e.preventDefault();if(renaming||!renameTarget)return;const name=$('renameBatchInput').value.trim();if(!name){$('renameBatchError').textContent='Enter a batch name.';return;}renaming=true;for(const id of ['renameBatchSave','renameBatchCancel','renameBatchInput'])$(id).disabled=true;
    try{await BatchStore.renameBatch(renameTarget.id,name);renameDialog.close();await load();}catch(e){$('renameBatchError').textContent=e.message;}finally{renaming=false;for(const id of ['renameBatchSave','renameBatchCancel','renameBatchInput'])$(id).disabled=false;}};
  let deleteTarget=null,deleting=false;
  const deleteDialog=el('dialog');deleteDialog.id='deleteBatchDialog';deleteDialog.setAttribute('aria-labelledby','deleteBatchTitle');
  deleteDialog.innerHTML='<h2 id="deleteBatchTitle">Delete batch?</h2><p id="deleteBatchName"></p><p class="muted">This removes the batch, its uploaded images and saved annotations from this browser. Your original image files are not affected. Download any edits you want to keep first.</p><p id="deleteBatchError" role="alert"></p><footer><button id="deleteBatchCancel" type="button">Cancel</button><button id="deleteBatchConfirm" class="danger" type="button">Delete batch</button></footer>';
  document.body.append(deleteDialog);
  function askDelete(batch){deleteTarget=batch;$('deleteBatchName').textContent=batch.name;deleteDialog.querySelector('.muted').textContent=batch.id==='demo'?'Remove the sample scenes from this browser’s dashboard and goal counts? You can restore them later. Your sample edits will be kept.':'This removes the batch, its uploaded images and saved annotations from this browser. Your original image files are not affected. Download any edits you want to keep first.';$('deleteBatchError').textContent='';deleteDialog.showModal();$('deleteBatchCancel').focus();}
  $('deleteBatchCancel').onclick=()=>{if(!deleting)deleteDialog.close();};
  deleteDialog.addEventListener('cancel',e=>{if(deleting)e.preventDefault();});
  $('deleteBatchConfirm').onclick=async()=>{
    if(deleting||!deleteTarget)return;
    deleting=true;$('deleteBatchConfirm').disabled=$('deleteBatchCancel').disabled=true;$('deleteBatchConfirm').textContent='Deleting…';
    try{if(deleteTarget.id==='demo')await BatchStore.setSampleHidden(true);else await BatchStore.removeBatch(deleteTarget.id);if(selectedId===deleteTarget.id)selectedId='';deleteTarget=null;deleteDialog.close();await load();}
    catch(e){$('deleteBatchError').textContent='Could not delete batch: '+e.message;}
    finally{deleting=false;$('deleteBatchConfirm').disabled=$('deleteBatchCancel').disabled=false;$('deleteBatchConfirm').textContent='Delete batch';}
  };
  let goals={},savingGoals=false,goalsEdited=false;
  const goalsReady=BatchStore.readGoals().then(saved=>{if(!goalsEdited)goals=saved;});
  function renderGoals(){
    let reached=0,configured=0;
    $('goalsList').replaceChildren(...BatchStore.classes.map(cls=>{
      const count=batches.reduce((sum,b)=>sum+b.stats.counts[cls],0),target=goals[cls];
      const card=el('div',undefined,'goal-item');const heading=el('div',undefined,'goal-heading');
      heading.append(el('strong',cls),el('span',target?`${count.toLocaleString()} / ${target.toLocaleString()}`:`${count.toLocaleString()} reviewed`));card.append(heading);
      if(target){
        configured++;const complete=count>=target;if(complete)reached++;
        const bar=el('div',undefined,'goal-track');bar.setAttribute('role','progressbar');bar.setAttribute('aria-label',`${cls} annotation goal`);bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(target));bar.setAttribute('aria-valuenow',String(Math.min(count,target)));bar.setAttribute('aria-valuetext',`${count} of ${target} reviewed annotations`);
        const fill=el('div',undefined,'goal-fill');fill.style.width=`${Math.min(100,Math.max(0,count/target*100))}%`;bar.append(fill);card.append(bar);
        const badge=el('span',undefined,'goal-badge '+(complete?'is-reached':'is-remaining'));const dot=el('span',undefined,'goal-dot');dot.setAttribute('aria-hidden','true');badge.append(dot,el('span',complete?'Goal reached':`${(target-count).toLocaleString()} remaining`));card.append(badge);card.classList.toggle('goal-complete',complete);
      }
      else card.append(el('small','No goal set'));
      return card;
    }));
    $('goalsStatus').textContent=configured?`${reached} of ${configured} goals reached. Counts exclude deleted or uncertain boxes and images not marked Reviewed.`:'Click Edit to set your class targets.';
  }
  $('editGoals').onclick=async()=>{
    await goalsReady;
    $('goalFields').replaceChildren(...BatchStore.classes.map(cls=>{const row=el('label',undefined,'goal-field');row.htmlFor='goal-'+cls;const input=el('input');input.id='goal-'+cls;input.name=cls;input.type='number';input.min='1';input.max='10000000';input.step='1';input.placeholder='No goal';input.value=goals[cls]||'';row.append(el('span',cls),input);return row;}));
    $('goalsError').textContent='';$('goalsDialog').showModal();$('goal-'+BatchStore.classes[0]).focus();
  };
  $('goalsClose').onclick=$('goalsCancel').onclick=()=>{if(!savingGoals)$('goalsDialog').close();};
  $('goalsDialog').addEventListener('cancel',e=>{if(savingGoals)e.preventDefault();});
  $('goalsForm').onsubmit=async e=>{
    e.preventDefault();if(savingGoals)return;const next={};
    for(const cls of BatchStore.classes){const input=$('goal-'+cls),raw=input.value.trim();if(raw==='')continue;const value=Number(raw);if(!Number.isSafeInteger(value)||value<1||value>10000000){$('goalsError').textContent='Enter whole numbers from 1 to 10,000,000, or leave a goal blank.';input.focus();return;}next[cls]=value;}
    savingGoals=true;const controls=Array.from($('goalsForm').querySelectorAll('input,button'));controls.forEach(c=>c.disabled=true);$('goalsError').textContent='Saving goals…';
    try{await BatchStore.saveGoals(next);goalsEdited=true;goals=next;renderGoals();$('goalsDialog').close();}
    catch(_){$('goalsError').textContent='Both browser storage options failed. Your entries are still here. Try the published GitHub Pages site in a regular browser window, or enable storage for this site, then save again.';}
    finally{savingGoals=false;controls.forEach(c=>c.disabled=false);}
  };
  async function load(){
    const generation=++loadGeneration;
    await goalsReady;
    let own=[],storageError='';
    try{own=await BatchStore.read('batches');}catch(e){storageError='Browser image storage is unavailable. The sample demo is still available. '+e.message;}
    const hidden=await BatchStore.sampleHidden();
    demo.name=await BatchStore.sampleName();
    $('restoreSample').hidden=!hidden;
    const all=[...(hidden?[]:[demo]),...own.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))];
    for(const b of all){b.saved=await BatchStore.savedState(b.data,b.initialReviews);b.stats=BatchStore.stats(b.data,b.saved);}
    if(generation!==loadGeneration)return;
    batches=all;if(!batches.some(b=>b.id===selectedId))selectedId=batches[0]?.id||'';
    $('dashboardStatus').textContent=storageError||'Saved in this browser · uploaded images stay on this device';
    $('overviewNote').textContent=`${batches.length} batches${hidden?'':', including the sample demo'}`;
    const totals=batches.reduce((t,b)=>({images:t.images+b.data.views.length,reviewed:t.reviewed+b.stats.reviewed,boxes:t.boxes+b.stats.boxes}),{images:0,reviewed:0,boxes:0});
    $('overview').replaceChildren(...[['Batches',batches.length],['Images',totals.images],['Images reviewed',totals.reviewed],['Active boxes',totals.boxes]].map(([label,value])=>{const tile=el('div',undefined,'overview-tile');tile.append(el('strong',value.toLocaleString()),el('span',label));return tile;}));
    $('classCounts').replaceChildren(...BatchStore.classes.map(cls=>{const n=el('div',undefined,'class-stat');n.append(el('span',cls),el('strong',batches.reduce((s,b)=>s+b.stats.counts[cls],0).toLocaleString()));return n;}));
    renderGoals();
    await renderBatch(generation);
  }
  async function renderBatch(generation=loadGeneration){
    closeMenu();
    const render=++renderGeneration;
    release();const id=selectedId,b=batches.find(b=>b.id===id);
    $('openBatch').hidden=!b;
    if(!b){$('batchNav').replaceChildren();$('batchTitle').textContent='No batches yet';$('batchDescription').textContent='Create a new batch or restore the sample scenes to get started.';$('batchProgress').replaceChildren();$('imageList').replaceChildren();return;}
    $('batchNav').replaceChildren(...batches.map(batch=>{
      const item=el('div',undefined,'batch-nav-item'+(batch.id===id?' active':''));
      const btn=el('button',undefined,'batch-select');btn.type='button';btn.setAttribute('aria-current',batch.id===id?'true':'false');btn.append(el('span',batch.name),el('small',`${batch.data.views.length} images · ${batch.stats.reviewed} reviewed`));btn.onclick=()=>{selectedId=batch.id;renderBatch();};item.append(btn);
      const more=el('button',undefined,'batch-more');more.innerHTML='<svg width="4" height="12" viewBox="0 0 4 12" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1"/><circle cx="2" cy="6" r="1"/><circle cx="2" cy="10" r="1"/></svg>';more.type='button';more.title='Batch options';more.setAttribute('aria-label','Options for '+batch.name);more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded','false');more.onclick=()=>openMenu(batch,more);item.append(more);return item;
    }));
    $('batchTitle').textContent=b.name;
    $('batchDescription').textContent=id==='demo'?'Three example scenes with editable annotations.':'Uploaded batch · '+new Date(b.createdAt).toLocaleDateString();
    $('openBatch').href=href(b);
    const progress=el('progress');progress.max=b.data.views.length;progress.value=b.stats.reviewed;
    $('batchProgress').replaceChildren(el('span',`${b.stats.reviewed} / ${b.data.views.length} images reviewed · ${b.stats.boxes} boxes · ${b.stats.uncertain} uncertain`),progress);
    $('imageList').replaceChildren();
    for(let i=0;i<b.images.length;i++){
      if(generation!==loadGeneration||id!==selectedId||render!==renderGeneration)return;
      const item=b.images[i],v=b.data.views[i];let src=item.url;
      if(!src){try{const stored=await BatchStore.read('images',item.id);if(stored){src=URL.createObjectURL(stored.blob);if(generation!==loadGeneration||id!==selectedId||render!==renderGeneration){URL.revokeObjectURL(src);return;}urls.push(src);}}catch(_){}}
      const row=el('a',undefined,'image-row');row.href=href(b,i);
      const image=el('img');image.alt='';image.loading='lazy';if(src)image.src=src;
      const text=el('div');text.append(el('strong',item.name),el('small',`${item.width} × ${item.height} · ${(b.saved.annotations[v.view_index]||[]).filter(a=>!a.deleted).length} boxes`));
      const status=el('div',undefined,'image-status');const reviewed=b.saved.reviews[v.view_index]?.decision==='looks_correct';status.append(el('span',reviewed?'Reviewed':'Not reviewed',reviewed?'reviewed':''),el('small','Open →'));
      row.append(image,text,status);$('imageList').append(row);
    }
  }
  function updateSubmit(){$('uploadSubmit').disabled=busy||checking||!chosen.length||!$('batchName').value.trim();}
  function setBusy(value){busy=value;for(const id of ['uploadClose','uploadCancel','batchFiles','batchName'])$(id).disabled=value;updateSubmit();}
  async function dimensions(file){
    const url=URL.createObjectURL(file);
    try{return await new Promise((resolve,reject)=>{const img=new Image();const timeout=setTimeout(()=>{img.src='';reject(new Error('Image decoding timed out'));},15000);img.onload=()=>{clearTimeout(timeout);if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000){reject(new Error('Image exceeds 40 megapixels'));return;}resolve({width:img.naturalWidth,height:img.naturalHeight});};img.onerror=()=>{clearTimeout(timeout);reject(new Error('Image cannot be read'));};img.src=url;});}finally{URL.revokeObjectURL(url);}
  }
  async function selectFiles(files){
    if(busy)return;
    const generation=++selectionGeneration;chosen=[];checking=true;updateSubmit();$('selectedFiles').replaceChildren();$('uploadStatus').textContent='Checking images…';
    const list=Array.from(files);if(list.length>50||list.reduce((s,f)=>s+f.size,0)>150*1024*1024){checking=false;$('uploadStatus').textContent='Choose up to 50 images with a combined size of 150 MB or less.';updateSubmit();return;}
    const valid=[],errors=[];
    for(const file of list){
      if(generation!==selectionGeneration)return;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)){errors.push(file.name+': use JPEG, PNG or WebP.');continue;}
      if(file.size>15*1024*1024){errors.push(file.name+': exceeds 15 MB.');continue;}
      try{valid.push({file,...await dimensions(file)});}catch(e){errors.push(file.name+': '+e.message);}
    }
    if(generation!==selectionGeneration)return;
    chosen=valid;checking=false;
    $('selectionSummary').textContent=`${valid.length} images ready · ${(valid.reduce((s,i)=>s+i.file.size,0)/1024/1024).toFixed(1)} MB`;
    $('selectedFiles').replaceChildren(...valid.map(i=>el('li',`${i.file.name} — ${i.width} × ${i.height}`)));
    $('uploadStatus').textContent=errors.length?'Skipped files:\n'+errors.join('\n'):valid.length?'Ready to create your batch.':'No supported images selected.';updateSubmit();
  }
  $('createOpen').onclick=()=>{$('uploadDialog').showModal();$('batchName').focus();};
  $('restoreSample').onclick=async()=>{const btn=$('restoreSample');btn.disabled=true;try{await BatchStore.setSampleHidden(false);selectedId='demo';await load();}catch(e){$('dashboardStatus').textContent='Could not restore sample scenes: '+e.message;}finally{btn.disabled=false;}};
  function closeUpload(){if(!busy)$('uploadDialog').close();}
  $('uploadClose').onclick=closeUpload;$('uploadCancel').onclick=closeUpload;
  $('uploadDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  $('batchName').addEventListener('input',updateSubmit);
  $('batchFiles').onchange=e=>selectFiles(e.target.files);
  const drop=$('dropZone');drop.addEventListener('dragover',e=>{e.preventDefault();if(!busy)drop.classList.add('dragover');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');if(!busy)selectFiles(e.dataTransfer.files);});
  $('uploadForm').onsubmit=async e=>{
    e.preventDefault();if(busy||checking||!chosen.length||!$('batchName').value.trim())return;
    setBusy(true);$('uploadStatus').textContent='Saving images in this browser…';
    try{const batch=await BatchStore.create($('batchName').value.trim(),chosen);selectedId=batch.id;chosen=[];$('uploadForm').reset();$('selectedFiles').replaceChildren();$('selectionSummary').textContent='No images selected.';$('uploadStatus').textContent='';$('uploadDialog').close();await load();}
    catch(e){$('uploadStatus').textContent='Batch was not created. '+(e.name==='QuotaExceededError'?'Browser storage is full. Try a smaller batch.':e.message);}
    finally{setBusy(false);}
  };
  window.addEventListener('pageshow',load);window.addEventListener('focus',()=>{if(!$('uploadDialog').open)load();});window.addEventListener('pagehide',release);
})();
