/* Browser-local image library; no uploads or external network requests. */
(() => {
  const classes = ['valve','flange','elbow','pipe','tank','pump','strainer','tee','reducer'];
  function database(name, version, upgrade) {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(name,version);
      request.onupgradeneeded=()=>upgrade(request.result);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('Close other reviewer tabs and try again.'));
    });
  }
  const library=()=>database('pipe-reviewer-library',1,db=>{db.createObjectStore('batches',{keyPath:'id'});db.createObjectStore('images',{keyPath:'id'});});
  const goalsKey='pipe-reviewer-class-goals-v1';
  const settings=()=>database('pipe-reviewer-settings',1,db=>db.createObjectStore('settings'));
  async function goalsRecord(record,key=goalsKey){
    const db=await settings();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('settings',record===undefined?'readonly':'readwrite');
      const store=tx.objectStore('settings');const req=record===undefined?store.get(key):store.put(record,key);
      tx.oncomplete=()=>resolve(req.result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Settings storage is unavailable.'));
    });}finally{db.close();}
  }
  async function readGoals(){
    let latest;
    try{const raw=JSON.parse(localStorage.getItem(goalsKey)||'null');if(raw)latest=raw.targets?raw:{targets:raw,savedAt:0};}catch(_){}
    try{const stored=await goalsRecord();if(stored&&(!latest||stored.savedAt>latest.savedAt))latest=stored;}catch(_){}
    const result={};for(const cls of classes){const n=latest?.targets?.[cls];if(Number.isSafeInteger(n)&&n>0&&n<=10000000)result[cls]=n;}return result;
  }
  async function saveGoals(targets){
    const record={targets,savedAt:Date.now()};
    try{localStorage.setItem(goalsKey,JSON.stringify(record));return;}catch(_){}
    await goalsRecord(record);
  }
  const demoKey='pipe-reviewer-sample-visibility';
  async function sampleHidden(){
    let record;try{record=JSON.parse(localStorage.getItem(demoKey)||'null');}catch(_){}
    try{const saved=await goalsRecord(undefined,demoKey);if(saved&&(!record||saved.savedAt>record.savedAt))record=saved;}catch(_){}
    return record?.hidden===true;
  }
  async function setSampleHidden(hidden){
    const record={hidden,savedAt:Date.now()};
    try{localStorage.setItem(demoKey,JSON.stringify(record));return;}catch(_){}
    await goalsRecord(record,demoKey);
  }
  const sampleNameKey='pipe-reviewer-sample-name';
  async function sampleName(){
    let record;try{record=JSON.parse(localStorage.getItem(sampleNameKey)||'null');}catch(_){}
    try{const saved=await goalsRecord(undefined,sampleNameKey);if(saved&&(!record||saved.savedAt>record.savedAt))record=saved;}catch(_){}
    return typeof record?.name==='string'&&record.name.trim()?record.name:'Sample scenes';
  }
  async function renameBatch(id,name){
    name=String(name).trim();if(!name||name.length>80)throw new Error('Enter a name between 1 and 80 characters.');
    if(id==='demo'){
      const record={name,savedAt:Date.now()};
      try{localStorage.setItem(sampleNameKey,JSON.stringify(record));return;}catch(_){}
      await goalsRecord(record,sampleNameKey);return;
    }
    const db=await library();
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction('batches','readwrite'),store=tx.objectStore('batches'),req=store.get(id);let missing=false;
      req.onsuccess=()=>{const batch=req.result;if(!batch){missing=true;tx.abort();return;}batch.name=name;batch.data.batch_name=name;store.put(batch);};
      tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(new Error(missing?'This batch no longer exists.':'Could not save the batch name.'));
    });}finally{db.close();}
  }
  async function read(store, key) {
    const db=await library();
    try { return await new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store)[key===undefined?'getAll':'get'](key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
    finally {db.close();}
  }
  function makeData(id,name,images) {
    return {schema:'image-batch/v1',panorama_id:id,source_image_id:'image-batch',revision:'01',parent_revision:null,source_sha256:id,base_annotation_sha256:id+'-baseline-01',class_names:classes,training_ready:false,batch_name:name,
      views:images.map((im,i)=>({view_index:i+1,image:im.name,image_id:im.id,pitch_band:im.name,output_width:im.width,output_height:im.height,annotations:[],review_issues:[],training_ready:false}))};
  }
  async function create(name, items) {
    const id=crypto.randomUUID();
    const images=items.map((item,i)=>({id:id+'/'+i,name:item.file.name,width:item.width,height:item.height,size:item.file.size,type:item.file.type}));
    const batch={id,name,createdAt:new Date().toISOString(),images,data:makeData(id,name,images)};
    const db=await library();
    try {await new Promise((resolve,reject)=>{
      const tx=db.transaction(['batches','images'],'readwrite');
      tx.objectStore('batches').add(batch);
      items.forEach((item,i)=>tx.objectStore('images').add({id:images[i].id,blob:item.file}));
      tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Could not save the batch. Browser storage may be full.'));
    });} finally {db.close();}
    return batch;
  }
  async function savedState(data, initialReviews={}) {
    const key='pano-editor-v2-'+data.source_sha256+'-'+data.revision;
    let record;
    try {record=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
    try {
      const db=await database('panorama-review-autosave',1,db=>db.createObjectStore('states'));
      const result=await new Promise((resolve,reject)=>{const req=db.transaction('states').objectStore('states').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();
      if(result&&(!record||(result.savedAt||0)>(record.savedAt||0)))record=result;
    }catch(_){}
    if(record?.schema==='panorama-autosave/v1'&&record.baseline!==data.base_annotation_sha256)record=null;
    const annotations=Object.fromEntries(data.views.map(v=>{
      const rows=record?.annotations?.[v.view_index];
      return [v.view_index,rows===undefined?v.annotations:rows.map(a=>typeof a==='number'?v.annotations[a]:a).filter(Boolean)];
    }));
    return {annotations,reviews:record?.reviews||initialReviews,savedAt:record?.savedAt||0};
  }
  async function removeBatch(id){
    if(!id||id==='demo')throw new Error('The built-in sample batch cannot be deleted.');
    const db=await library();let batch;
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction(['batches','images'],'readwrite');
      const store=tx.objectStore('batches'),req=store.get(id);
      req.onsuccess=()=>{batch=req.result;if(!batch)return;for(const image of batch.images)tx.objectStore('images').delete(image.id);store.delete(id);};
      tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Could not delete this batch.'));
    });}finally{db.close();}
    if(batch){
      const key='pano-editor-v2-'+batch.data.source_sha256+'-'+batch.data.revision;
      try{localStorage.removeItem(key);localStorage.removeItem(key+'-ui');}catch(_){}
      try{const saves=await database('panorama-review-autosave',1,db=>db.createObjectStore('states'));
        try{await new Promise((resolve,reject)=>{const tx=saves.transaction('states','readwrite');tx.objectStore('states').delete(key);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{saves.close();}
      }catch(_){}
    }
  }
  function stats(data,saved) {
    const counts=Object.fromEntries(classes.map(c=>[c,0]));let boxes=0,reviewed=0,uncertain=0;
    for(const v of data.views){const rows=(saved.annotations[v.view_index]||[]).filter(a=>!a.deleted);boxes+=rows.length;uncertain+=rows.filter(a=>a.uncertain).length;
      if(saved.reviews[v.view_index]?.decision==='looks_correct'){reviewed++;for(const a of rows)if(!a.uncertain&&counts[a.proposed_class]!==undefined)counts[a.proposed_class]++;}}
    return {boxes,reviewed,uncertain,counts};
  }
  window.BatchStore={read,create,removeBatch,renameBatch,sampleName,makeData,savedState,stats,classes,readGoals,saveGoals,sampleHidden,setSampleHidden};
})();
