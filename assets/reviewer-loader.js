(async () => {
  const urls=[];
  function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('Could not load '+src));document.body.append(s);});}
  try{
    const params=new URLSearchParams(location.search),id=params.get('batch');
    if(id){
      const batch=await BatchStore.read('batches',id);if(!batch)throw new Error('This batch is not stored in this browser. Return to the dashboard and upload your images here.');
      const next=structuredClone(batch.data);
      for(const v of next.views){const record=await BatchStore.read('images',v.image_id);if(!record)throw new Error('An image is missing from browser storage. Please create a new batch from your original images.');v.display_image=URL.createObjectURL(record.blob);urls.push(v.display_image);}
      for(const key of Object.keys(DATA))delete DATA[key];Object.assign(DATA,next);
      for(const key of Object.keys(INITIAL_REVIEWS))delete INITIAL_REVIEWS[key];
      for(const key of Object.keys(PENDING))delete PENDING[key];
      for(const v of DATA.views){INITIAL_REVIEWS[v.view_index]={decision:'not_reviewed',notes:'',exclusion_reason:null};PENDING[v.view_index]=['Draw boxes, choose their classes, then mark this image reviewed.'];}
      document.title=batch.name+' · Image reviewer';document.querySelector('h1').textContent=batch.name;
      document.querySelector('header small').textContent=`${DATA.views.length} images · saved in this browser`;
      document.getElementById('uncertainScope').textContent='Across this batch';
      document.getElementById('grid').setAttribute('aria-label','Images in this batch');
      document.getElementById('emptySelection').textContent='Double left-click the image, then drag to draw a box. Choose its class from the list. Select an existing box to move, resize or rotate it.';
      const about=document.querySelector('.sidebar details:last-child p');if(about)about.textContent='Your uploaded images stay in this browser. Download edits to keep an annotation backup; keep the original image files too.';
    }
    if(!id){const name=await BatchStore.sampleName();if(name!=='Sample scenes'){document.querySelector('h1').textContent=name;document.title=name+' · Image reviewer';}}
    window.REVIEW_START_INDEX=params.has('view')?Number(params.get('view')):null;
    await script('assets/editor.js?v=20261117-batches1');
    document.getElementById('reviewerLoading').remove();
    document.querySelector('.workspace').inert=false;document.querySelector('header').inert=false;
    await script('assets/tour.js?v=20261117-batches1');
  }catch(e){
    urls.forEach(u=>URL.revokeObjectURL(u));
    const loading=document.getElementById('reviewerLoading');loading.replaceChildren();
    const title=document.createElement('h2');title.textContent='Could not open this batch';const message=document.createElement('p');message.textContent=e.message;const back=document.createElement('a');back.href='index.html';back.textContent='Return to dashboard';loading.append(title,message,back);
  }
  window.addEventListener('pagehide',()=>{urls.forEach(u=>URL.revokeObjectURL(u));});
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
})();
