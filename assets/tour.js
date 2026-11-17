(() => {
  const storageKey = 'pipe-reviewer-practice-tour-v3';
  const steps = [
    [null, 'Try the mouse controls', 'Follow each prompt and try it on the image. The tutorial confirms your action before you continue. Practice edits save like normal edits; use Ctrl+Z to undo them. You can skip a step or end the tour at any time.', 'Hands-on walkthrough'],
    ['#viewport', 'Select and move a box', 'Left-click a box to select it. Hold the left button inside the selected box and drag to move it. Release to place it.', 'Left-click → hold and drag'],
    ['#viewport', 'Resize and rotate', 'Select a box first. Drag a round corner handle to resize it. Drag the separate handle above the box to rotate it. Release when the outline matches the object.', 'Left-drag a handle'],
    ['#viewport', 'Zoom where you point', 'Place the pointer over the part of the image you want to inspect, then scroll the wheel to zoom in or out. Click Fit in the toolbar to see the whole image again.', 'Scroll the wheel'],
    ['#viewport', 'Pan around the image', 'Press the wheel down and keep it held while moving the mouse, then release. This is a drag, not scrolling. Zoom in first if you want more room to pan; at Fit, the image may stay in place. A wheel click without dragging toggles the eraser.', 'Hold wheel button + drag + release'],
    ['#viewport', 'Draw a new box', 'Double-click the left mouse button over the image to enter drawing mode. Then hold left-click and drag from one corner of the object to the opposite corner. Release to create the box; normal editing resumes automatically.', 'Double left-click → left-drag'],
    ['#viewport', 'Copy a box', 'Point at the box you want to copy. Press the left and right mouse buttons together once, then release both. This copies its shape and class without removing the original.', 'Left + right together × 1'],
    ['#viewport', 'Paste the copied box', 'Move to the destination. Press and release both left and right buttons together twice quickly, keeping the pointer still between presses. The second combined press places a copy. You can then drag it into position.', 'Left + right together × 2'],
    ['#viewport', 'Delete one box', 'Double right-click the same box without moving the pointer to delete it. A single right-click only selects it. If you delete the wrong box, press Ctrl+Z to undo.', 'Double right-click'],
    ['#viewport', 'Erase several boxes', 'Click the wheel button once without dragging to turn on the eraser. Hold left-click and brush across box edges to delete them. Click the wheel again to return to editing. Ctrl+Z restores one eraser stroke.', 'Wheel-click → left-drag across edges'],
    ['#boxList', 'Find and label a box', 'Click a number to select that box, or double-click the number to zoom to it. Choose its class from the dropdown beside it. This is useful when several boxes overlap on the image.', 'Click / double-click a number'],
    ['#download', 'Save your work', 'Click Download edits to keep a JSON copy. Your edits also save in this browser. You can revisit these mouse instructions through Shortcuts → Replay mouse tour at any time.', 'Click Download edits']
  ];
  const dialog = document.createElement('dialog');
  dialog.id = 'reviewerTour';
  dialog.setAttribute('aria-labelledby', 'tourTitle');
  dialog.setAttribute('aria-describedby', 'tourText');
  dialog.innerHTML = '<div class="tour-highlight" aria-hidden="true" hidden></div><section class="tour-card"><div class="tour-top"><span id="tourCount"></span><button type="button" id="tourSkip">Skip tour</button></div><div aria-live="polite" aria-atomic="true"><h2 id="tourTitle"></h2><p id="tourText"></p></div><footer><button type="button" id="tourBack">Back</button><button type="button" id="tourNext" class="primary">Next</button></footer></section>';
  document.body.append(dialog);
  const card = dialog.querySelector('.tour-card');
  const gesture = document.createElement('div');
  gesture.className = 'tour-gesture';
  dialog.querySelector('#tourTitle').before(gesture);
  const ring = dialog.querySelector('.tour-highlight');
  const back = dialog.querySelector('#tourBack');
  const next = dialog.querySelector('#tourNext');
  const task = document.createElement('p');
  task.className = 'tour-task';
  task.setAttribute('role', 'status');
  card.querySelector('footer').before(task);
  const skipStep = document.createElement('button');
  skipStep.type = 'button';
  skipStep.textContent = 'Skip this step';
  skipStep.className = 'tour-skip-step';
  card.append(skipStep);
  const tasks = ['', 'Try it: drag a box to a new position.', 'Try it: resize OR rotate a selected box using a handle.', 'Try it: scroll over the image to zoom in.', 'Try it: hold the wheel button and drag the image.', 'Try it: double left-click, then drag to create a box.', 'Try it: press both mouse buttons together once over a box.', 'Try it: press both buttons together twice at the destination.', 'Try it: double right-click a box to delete it.', 'Try it: click the wheel, then brush across a box edge with left-drag.', 'Try it: change a box’s class using its dropdown.', 'Try it: click Download edits to export your JSON.'];
  let baseline, timer, completed = false;
  const done = new Set();
  function sample() {
    return {boxes: JSON.parse(JSON.stringify(state.annotations)), scale, tx, ty, clipboard:boxClipboard};
  }
  function markDone() {
    if (completed) return;
    completed = true; done.add(index); next.disabled = false;
    task.textContent = '✓ Done — you can continue.';
    task.classList.add('is-done');
    position();
  }
  function checkAction() {
    if (!dialog.open || completed || !baseline || drag) return;
    const before = Object.values(baseline.boxes).flat();
    const current = Object.values(state.annotations).flat();
    const pairs = Object.entries(state.annotations).flatMap(([viewId, boxes]) => boxes.map(b => [b, baseline.boxes[viewId]?.find(a=>a.id===b.id)]));
    const moved = pairs.some(([a,b])=>b && !a.deleted && !b.deleted && JSON.stringify(a.quad_pixels)!==JSON.stringify(b.quad_pixels));
    const reshaped = pairs.some(([a,b])=>{if(!b||a.deleted||b.deleted)return false;const r=rectangle(a.quad_pixels),s=rectangle(b.quad_pixels);return Math.abs(r.width-s.width)>.5||Math.abs(r.height-s.height)>.5||Math.abs(r.angle-s.angle)>.01;});
    const deleted = pairs.some(([a,b])=>b && a.deleted && !b.deleted);
    const passed = [false, moved, reshaped, Math.abs(scale-baseline.scale)>.001, false, current.length>before.length, boxClipboard!==baseline.clipboard && !!boxClipboard, pairs.some(([a,b])=>!b && a.origin==='user_copied'), deleted && mode!=='erase', deleted && mode==='erase', pairs.some(([a,b])=>b && a.proposed_class!==b.proposed_class), false][index];
    if (passed) markDone();
  }
  document.getElementById('download').addEventListener('click', () => { if(dialog.open && index===11 && !drag)markDone(); });
  document.addEventListener('reviewer:wheel-pan', () => { if(dialog.open && index===4)markDone(); });
  let index = 0, previousFocus, scrollPositions = [];
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));

  function position() {
    if (!dialog.open) return;
    const width = window.innerWidth, height = window.innerHeight;
    const target = steps[index][0] && document.querySelector(steps[index][0]);
    const rect = target && target.getBoundingClientRect();
    const viewport = document.getElementById('viewport').getBoundingClientRect();
    const left = Math.max(0, viewport.left), top = Math.max(0, viewport.top);
    const right = Math.min(width, viewport.right), bottom = Math.min(height, viewport.bottom);
    card.style.width = Math.max(1, Math.min(300, right-left-24))+'px';
    card.style.maxHeight = Math.max(1, bottom-top-24)+'px';
    ring.hidden = !rect;
    dialog.classList.toggle('tour-centered', !rect);
    if (rect) {
      const l = clamp(rect.left - 5, 4, width - 4), t = clamp(rect.top - 5, 4, height - 4);
      const r = clamp(rect.right + 5, l, width - 4), b = clamp(rect.bottom + 5, t, height - 4);
      Object.assign(ring.style, {left:l+'px', top:t+'px', width:(r-l)+'px', height:(b-t)+'px'});
    }
    Object.assign(card.style, {left:(left+12)+'px', top:Math.max(top+12,bottom-card.offsetHeight-12)+'px'});
  }
  function render() {
    const [selector, title, description] = steps[index];
    dialog.querySelector('#tourCount').textContent = `${index + 1} of ${steps.length}`;
    dialog.querySelector('#tourTitle').textContent = title;
    dialog.querySelector('#tourText').textContent = description;
    gesture.textContent = steps[index][3];
    back.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? 'Start reviewing' : index === 0 ? 'Show me around' : 'Next';
    completed = index===0 || done.has(index);
    baseline = sample();
    next.disabled = !completed;
    task.textContent = index===0 ? '' : completed ? '✓ Done — you can continue.' : tasks[index];
    task.classList.toggle('is-done', completed);
    skipStep.hidden = index===0;
    if (selector) document.querySelector(selector)?.scrollIntoView({block:'nearest', inline:'nearest', behavior:'instant'});
    position();
    if(completed) next.focus({preventScroll:true});
  }
  function finish() {
    if (!dialog.open) return;
    dialog.close();
    clearInterval(timer);
    try { localStorage.setItem(storageKey, 'seen'); } catch (_) {}
    for (const [element, left, top] of scrollPositions) { element.scrollLeft = left; element.scrollTop = top; }
    if (previousFocus?.isConnected && !previousFocus.closest('[hidden]')) previousFocus.focus({preventScroll:true});
    else document.getElementById('helpOpen').focus({preventScroll:true});
  }
  function start() {
    if (dialog.open) return;
    previousFocus = document.activeElement;
    document.getElementById('help').hidden = true;
    scrollPositions = ['.sidebar', '.editing-controls', '#boxList'].map(s => document.querySelector(s)).filter(Boolean).map(e=>[e,e.scrollLeft,e.scrollTop]);
    index = 0;
    done.clear();
    dialog.show();
    render();
    timer = setInterval(checkAction, 150);
  }
  back.addEventListener('click', () => { if(index > 0) { index--; render(); } });
  next.addEventListener('click', () => { if(index === steps.length - 1) finish(); else { index++; render(); } });
  skipStep.addEventListener('click', () => { if(index === steps.length - 1)finish();else { index++; render(); } });
  dialog.querySelector('#tourSkip').addEventListener('click', finish);
  dialog.addEventListener('cancel', e => { e.preventDefault(); finish(); });
  // Keys used inside the tutorial card should not edit the image underneath.
  dialog.addEventListener('keydown', e => {
    e.stopPropagation();
    if(e.key === 'Escape') { e.preventDefault(); finish(); }
    if(e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
    if(e.key === 'ArrowLeft') { e.preventDefault(); if(!back.disabled) back.click(); }
  });
  dialog.addEventListener('keyup', e => e.stopPropagation());
  window.addEventListener('resize', position);
  document.addEventListener('scroll', position, true);
  document.getElementById('tourReplay').addEventListener('click', start);
  let seen = false;
  try { seen = localStorage.getItem(storageKey) === 'seen'; } catch (_) {}
  if (!seen && DATA.schema!=='image-batch/v1') start();
})();
