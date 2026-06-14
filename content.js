/* ============================================================
   GestureFlow — content script (v1.4)
   Discrete: next / prev / like  (Step, Grab)
   Glide:   feed follows the hand but is HARD-CAPPED to exactly
            one video per motion, then locks. Returning the hand
            to neutral (velocity 0) commits/cancels and re-arms.
   ============================================================ */

const HOST=location.hostname;
const isYouTube=HOST.endsWith('youtube.com');
const isInstagram=HOST.endsWith('instagram.com');

function pressKey(key,code){const o={key,code:key,keyCode:code,which:code,bubbles:true,cancelable:true};
  document.dispatchEvent(new KeyboardEvent('keydown',o));document.dispatchEvent(new KeyboardEvent('keyup',o));}
function scrollTarget(){let el=document.elementFromPoint(innerWidth/2,innerHeight/2);
  while(el&&el!==document.body){const s=getComputedStyle(el);
    if(/(auto|scroll)/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+4)return el;el=el.parentElement;}
  return document.scrollingElement||document.documentElement;}
function stepPx(t){return Math.max(220, Math.round((t.clientHeight||innerHeight)*0.96));}

/* ---------- discrete one-step (Step / Grab) ---------- */
let busy=false;
function oneStep(dir){
  if(busy)return;busy=true;const t=scrollTarget();const before=t.scrollTop;
  if(isYouTube){
    pressKey(dir==='next'?'ArrowDown':'ArrowUp',dir==='next'?40:38);
    setTimeout(()=>{if(Math.abs(t.scrollTop-before)<6)t.scrollBy({top:(dir==='next'?1:-1)*stepPx(t),behavior:'smooth'});
      setTimeout(()=>busy=false,380);},230);
  }else{t.scrollBy({top:(dir==='next'?1:-1)*stepPx(t),behavior:'smooth'});setTimeout(()=>busy=false,480);}
}

/* ---------- GLIDE engine: capped at one video, then locked ---------- */
let gProg=0;         // px scrolled in the current motion (signed)
let gLock=false;     // true once one full video reached this motion
let gCur=0, gTarget=0, gRaf=null, gCap=0;

function glideFrame(){
  if(gTarget===0 && Math.abs(gCur)<0.06){gCur=0;gRaf=null;return;}
  gCur += (gTarget-gCur)*0.25;                 // smooth ramp
  if(!gLock){
    const t=scrollTarget(); if(!gCap)gCap=stepPx(t);
    let next=gProg+gCur;
    if(next> gCap) next= gCap;                 // hard cap forward
    if(next< -gCap) next= -gCap;               // hard cap backward
    const applied=next-gProg;
    if(applied) t.scrollBy(0,applied);
    gProg=next;
    if(Math.abs(gProg)>=gCap){                 // one whole video done -> LOCK
      gLock=true; gCur=0; gTarget=0;
      if(isYouTube) pressKey(gProg>0?'ArrowDown':'ArrowUp',gProg>0?40:38); // ensure clean snap
    }
  }
  gRaf=requestAnimationFrame(glideFrame);
}

function glide(vel){
  if(vel===0){                                 // hand back to neutral -> commit/cancel + re-arm
    const t=scrollTarget(); if(!gCap)gCap=stepPx(t);
    if(!gLock && Math.abs(gProg)>0){
      if(Math.abs(gProg) > gCap*0.45){         // moved enough -> finish to one full video
        const dir=Math.sign(gProg);
        t.scrollBy({top:dir*(gCap-Math.abs(gProg)),behavior:'smooth'});
        if(isYouTube) pressKey(dir>0?'ArrowDown':'ArrowUp',dir>0?40:38);
      }else{                                    // not enough -> snap back (cancel)
        t.scrollBy({top:-gProg,behavior:'smooth'});
      }
    }
    gProg=0;gLock=false;gCur=0;gTarget=0;gCap=0;
    return;
  }
  gTarget=vel; if(gRaf===null)gRaf=requestAnimationFrame(glideFrame);
}

/* ---------- like ---------- */
function like(){
  if(isYouTube)(document.querySelector('ytd-reel-video-renderer[is-active] #like-button button, #like-button button, button[aria-label*="like" i]')||{}).click?.();
  else if(isInstagram)document.querySelector('svg[aria-label="Like"]')?.closest('div[role="button"], button')?.click();
}

function doAction(m){
  switch(m.action){
    case 'next': oneStep('next'); toast('▼ Next'); break;
    case 'prev': oneStep('prev'); toast('▲ Previous'); break;
    case 'like': like(); toast('❤️ Liked'); break;
    case 'glide': glide(m.velocity||0); break;
  }
}

let toastEl=null,tT=null;
function toast(label){if(!toastEl){toastEl=document.createElement('div');
  toastEl.style.cssText='position:fixed;z-index:2147483647;bottom:28px;left:50%;transform:translateX(-50%);background:rgba(10,12,18,.92);color:#4ade80;font:600 14px/1 system-ui,sans-serif;padding:10px 18px;border-radius:100px;border:1px solid #4ade80;pointer-events:none;opacity:0;transition:opacity .2s;box-shadow:0 6px 24px rgba(0,0,0,.4)';
  document.documentElement.appendChild(toastEl);}
  toastEl.textContent='GestureFlow · '+label;toastEl.style.opacity='1';clearTimeout(tT);tT=setTimeout(()=>toastEl.style.opacity='0',700);}

chrome.runtime.onMessage.addListener(m=>{if(m.type==='GF_ACTION')doAction(m);});
