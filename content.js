/* ============================================================
   GestureFlow — content script (v1.2)
   - FLICK actions: next / prev / like  (discrete, for Shorts/Reels)
   - GLIDE action:  scroll(velocity)     (continuous + momentum)
   ============================================================ */

const HOST = location.hostname;
const isYouTube   = HOST.endsWith('youtube.com');
const isInstagram = HOST.endsWith('instagram.com');

/* ---- key + wheel helpers ---- */
function pressKey(key, code) {
  const o = { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true };
  document.dispatchEvent(new KeyboardEvent('keydown', o));
  document.dispatchEvent(new KeyboardEvent('keyup', o));
}

/* find the real scrollable element under the viewport centre */
function scrollTarget() {
  let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
  while (el && el !== document.body) {
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
    el = el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

/* ---- discrete navigation (Shorts/Reels) ---- */
function nav(dir) {
  if (isYouTube) pressKey(dir === 'next' ? 'ArrowDown' : 'ArrowUp', dir === 'next' ? 40 : 38);
  // robust fallback / Instagram: smooth one-screen scroll on the active container
  const t = scrollTarget();
  t.scrollBy({ top: (dir === 'next' ? 1 : -1) * Math.round(innerHeight * 0.92), behavior: 'smooth' });
}
function like() {
  if (isYouTube) {
    (document.querySelector('ytd-reel-video-renderer[is-active] #like-button button, #like-button button, button[aria-label*="like" i]') || {}).click?.();
  } else if (isInstagram) {
    document.querySelector('svg[aria-label="Like"]')?.closest('div[role="button"], button')?.click();
  }
}

/* ---- continuous glide engine (momentum) ---- */
let curVel = 0, targetVel = 0, raf = null;
function loop() {
  // ramp current velocity toward target for smoothness; decay to 0 (inertia) when released
  curVel += (targetVel - curVel) * 0.18;
  if (Math.abs(curVel) < 0.08 && targetVel === 0) { curVel = 0; raf = null; return; }
  scrollTarget().scrollBy(0, curVel);
  raf = requestAnimationFrame(loop);
}
function setGlide(v) { targetVel = v; if (raf === null) raf = requestAnimationFrame(loop); }

/* ---- dispatch + toast ---- */
function doAction(msg) {
  switch (msg.action) {
    case 'next':   nav('next'); toast('▼ Next'); break;
    case 'prev':   nav('prev'); toast('▲ Previous'); break;
    case 'like':   like(); toast('❤️ Liked'); break;
    case 'scroll': setGlide(msg.velocity || 0); break;  // continuous
  }
}

let toastEl = null, tT = null;
function toast(label) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.style.cssText = 'position:fixed;z-index:2147483647;bottom:28px;left:50%;transform:translateX(-50%);background:rgba(10,12,18,.92);color:#4ade80;font:600 14px/1 system-ui,sans-serif;padding:10px 18px;border-radius:100px;border:1px solid #4ade80;pointer-events:none;opacity:0;transition:opacity .2s;box-shadow:0 6px 24px rgba(0,0,0,.4)';
    document.documentElement.appendChild(toastEl);
  }
  toastEl.textContent = 'GestureFlow · ' + label;
  toastEl.style.opacity = '1';
  clearTimeout(tT); tT = setTimeout(() => toastEl.style.opacity = '0', 700);
}

chrome.runtime.onMessage.addListener((msg) => { if (msg.type === 'GF_ACTION') doAction(msg); });
