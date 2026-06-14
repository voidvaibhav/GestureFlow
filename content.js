/* ============================================================
   GestureFlow — content script (v1.3)
   Discrete, clean, ONE item per action. No continuous scroll.
   Smart fallback: if YouTube ignores the synthetic key, do a
   single one-screen scroll — but only if the key did nothing,
   so it can never double-advance.
   ============================================================ */

const HOST = location.hostname;
const isYouTube   = HOST.endsWith('youtube.com');
const isInstagram = HOST.endsWith('instagram.com');

function pressKey(key, code){
  const o={key,code:key,keyCode:code,which:code,bubbles:true,cancelable:true};
  document.dispatchEvent(new KeyboardEvent('keydown',o));
  document.dispatchEvent(new KeyboardEvent('keyup',o));
}
function scrollTarget(){
  let el=document.elementFromPoint(innerWidth/2, innerHeight/2);
  while(el && el!==document.body){
    const s=getComputedStyle(el);
    if(/(auto|scroll)/.test(s.overflowY) && el.scrollHeight>el.clientHeight+4) return el;
    el=el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

let busy=false;
function oneStep(dir){
  if(busy) return; busy=true;
  const target=scrollTarget();
  const before=target.scrollTop;

  if(isYouTube){
    // Shorts: arrow key snaps to exactly the next/prev reel
    pressKey(dir==='next'?'ArrowDown':'ArrowUp', dir==='next'?40:38);
    setTimeout(()=>{
      // fallback ONLY if the key was ignored (position unchanged)
      if(Math.abs(target.scrollTop-before)<6){
        target.scrollBy({top:(dir==='next'?1:-1)*target.clientHeight, behavior:'smooth'});
      }
      setTimeout(()=>busy=false, 380);
    }, 230);
  } else {
    // Instagram / generic: smooth one-screen scroll
    target.scrollBy({top:(dir==='next'?1:-1)*Math.round(innerHeight*0.96), behavior:'smooth'});
    setTimeout(()=>busy=false, 480);
  }
}

function like(){
  if(isYouTube){
    (document.querySelector('ytd-reel-video-renderer[is-active] #like-button button, #like-button button, button[aria-label*="like" i]')||{}).click?.();
  } else if(isInstagram){
    document.querySelector('svg[aria-label="Like"]')?.closest('div[role="button"], button')?.click();
  }
}

function doAction(a){
  if(a==='next'){ oneStep('next'); toast('▼ Next'); }
  else if(a==='prev'){ oneStep('prev'); toast('▲ Previous'); }
  else if(a==='like'){ like(); toast('❤️ Liked'); }
}

let toastEl=null,tT=null;
function toast(label){
  if(!toastEl){
    toastEl=document.createElement('div');
    toastEl.style.cssText='position:fixed;z-index:2147483647;bottom:28px;left:50%;transform:translateX(-50%);background:rgba(10,12,18,.92);color:#4ade80;font:600 14px/1 system-ui,sans-serif;padding:10px 18px;border-radius:100px;border:1px solid #4ade80;pointer-events:none;opacity:0;transition:opacity .2s;box-shadow:0 6px 24px rgba(0,0,0,.4)';
    document.documentElement.appendChild(toastEl);
  }
  toastEl.textContent='GestureFlow · '+label; toastEl.style.opacity='1';
  clearTimeout(tT); tT=setTimeout(()=>toastEl.style.opacity='0',700);
}

chrome.runtime.onMessage.addListener(m=>{ if(m.type==='GF_ACTION') doAction(m.action); });
