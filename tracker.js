/* ============================================================
   GestureFlow — tracker logic (v1.2)
   Improvements:
   - One-Euro filter on the fingertip signal (low jitter + low lag)
   - Adaptive neutral re-centering (rest your hand anywhere)
   - Gesture hysteresis (no flicker between states)
   - Two modes: FLICK (discrete, for Shorts/Reels) and
     GLIDE (continuous velocity scroll with easing)
   ============================================================ */

const videoEl = document.getElementById('cam');
const ov  = document.getElementById('ov');
const octx = ov.getContext('2d');
const $ = id => document.getElementById(id);

/* ---------- One-Euro filter ---------- */
class OneEuro {
  constructor(minCutoff = 1.4, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.xPrev = null; this.dxPrev = 0; this.tPrev = null;
  }
  _alpha(cut, dt) { const tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); }
  filter(x, t) {
    if (this.tPrev === null) { this.tPrev = t; this.xPrev = x; return x; }
    let dt = (t - this.tPrev) / 1000; if (dt <= 0) dt = 1 / 60;
    const dx = (x - this.xPrev) / dt;
    const aD = this._alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cut = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this._alpha(cut, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat; this.dxPrev = dxHat; this.tPrev = t;
    return xHat;
  }
  setMinCutoff(v) { this.minCutoff = v; }
}
const fingerFilter = new OneEuro(1.4, 0.02);

/* ---------- settings ---------- */
let MODE = 'flick';          // 'flick' | 'glide'
let SENSITIVITY = 1.0;
let COOLDOWN_MS = 700;
let MAX_SPEED = 28;          // glide px/frame
let SMOOTHNESS = 55;         // 0..100

function applySmoothness(v) {
  SMOOTHNESS = v;
  // higher smoothness -> lower cutoff -> smoother (slightly laggier)
  const minCutoff = 2.6 - (v / 100) * 2.0;   // ~0.6 .. 2.6
  fingerFilter.setMinCutoff(minCutoff);
}

chrome.storage.local.get(['mode','sensitivity','cooldown','maxspeed','smoothness'], (s) => {
  if (s.mode) MODE = s.mode;
  if (typeof s.sensitivity === 'number') SENSITIVITY = s.sensitivity;
  if (typeof s.cooldown === 'number') COOLDOWN_MS = s.cooldown;
  if (typeof s.maxspeed === 'number') MAX_SPEED = s.maxspeed;
  applySmoothness(typeof s.smoothness === 'number' ? s.smoothness : 55);
});
chrome.storage.onChanged.addListener((c) => {
  if (c.mode) MODE = c.mode.newValue;
  if (c.sensitivity) SENSITIVITY = c.sensitivity.newValue;
  if (c.cooldown) COOLDOWN_MS = c.cooldown.newValue;
  if (c.maxspeed) MAX_SPEED = c.maxspeed.newValue;
  if (c.smoothness) applySmoothness(c.smoothness.newValue);
});

/* ---------- state ---------- */
let neutralY = null;         // adaptive rest point
let smoothVel = 0;           // for flick
let prevFy = null;
let lastFire = 0, armed = true, lastPinch = 0;
let lastScrollSent = 0, lastSentVel = 0;
let gHist = [];              // gesture hysteresis buffer

const DEAD_BAND = 0.045;     // glide neutral zone (normalized)
const GLIDE_RANGE = 0.33;
const FLICK_BASE = 0.022;

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function rawGesture(lm) {
  if (dist(lm[4], lm[8]) < 0.05) return 'pinch';
  const folded = [[8,6],[12,10],[16,14],[20,18]].filter(([t,p]) => lm[t].y > lm[p].y).length;
  if (folded >= 3) return 'fist';
  return 'open';
}
// require a gesture to persist a few frames before committing (anti-flicker)
function stableGesture(g) {
  gHist.push(g); if (gHist.length > 5) gHist.shift();
  const counts = {};
  gHist.forEach(x => counts[x] = (counts[x] || 0) + 1);
  let best = g, n = 0;
  for (const k in counts) if (counts[k] > n) { n = counts[k]; best = k; }
  return n >= 3 ? best : 'open';
}

function setStatus(t, cls) { $('status').textContent = t; $('dot').className = 'dot' + (cls ? ' ' + cls : ''); }
function send(action, velocity, gestureLabel) {
  chrome.runtime.sendMessage({ type: 'GF_GESTURE', action: action || null, velocity, state: { gesture: gestureLabel } }).catch(() => {});
  if (gestureLabel) $('gest').textContent = gestureLabel;
}
function sendScroll(vel, label) {
  const now = performance.now();
  // throttle: send on meaningful change or every 60ms
  if (Math.abs(vel - lastSentVel) > 0.6 || (now - lastScrollSent) > 60 || (vel === 0 && lastSentVel !== 0)) {
    send('scroll', vel, label);
    lastSentVel = vel; lastScrollSent = now;
  } else if (label) {
    $('gest').textContent = label;
  }
}

/* ---------- main ---------- */
function onResults(res) {
  const now = performance.now();
  octx.save();
  octx.clearRect(0, 0, ov.width, ov.height);
  if (res.image) octx.drawImage(res.image, 0, 0, ov.width, ov.height);

  // draw neutral band + mode label
  if (neutralY !== null) {
    const ny = neutralY * ov.height;
    const bandPx = DEAD_BAND * ov.height;
    octx.fillStyle = 'rgba(74,222,128,.10)';
    octx.fillRect(0, ny - bandPx, ov.width, bandPx * 2);
    octx.strokeStyle = 'rgba(74,222,128,.5)'; octx.lineWidth = 1;
    octx.beginPath(); octx.moveTo(0, ny); octx.lineTo(ov.width, ny); octx.stroke();
  }
  octx.fillStyle = '#7c8499'; octx.font = '11px system-ui';
  octx.scale(-1, 1); octx.fillText(MODE.toUpperCase() + ' MODE', -ov.width + 8, 16); octx.scale(-1, 1);

  if (!res.multiHandLandmarks || !res.multiHandLandmarks.length) {
    prevFy = null; smoothVel = 0; gHist = [];
    if (MODE === 'glide') sendScroll(0, '—'); else send(null, 0, '—');
    octx.restore(); return;
  }

  const lm = res.multiHandLandmarks[0];
  if (window.drawConnectors && window.HAND_CONNECTIONS) {
    drawConnectors(octx, lm, HAND_CONNECTIONS, { color: '#4ade80', lineWidth: 2 });
    drawLandmarks(octx, lm, { color: '#38bdf8', radius: 2 });
  }

  // filtered fingertip Y
  const fy = fingerFilter.filter(lm[8].y, now);
  octx.beginPath();
  octx.arc(lm[8].x * ov.width, fy * ov.height, 7, 0, Math.PI * 2);
  octx.fillStyle = '#fbbf24'; octx.fill();
  octx.restore();

  if (neutralY === null) neutralY = fy;

  const gesture = stableGesture(rawGesture(lm));

  // fist = pause everywhere
  if (gesture === 'fist') {
    smoothVel = 0; prevFy = fy;
    if (MODE === 'glide') sendScroll(0, 'fist (paused)'); else send(null, 0, 'fist (paused)');
    return;
  }
  // pinch = like (debounced)
  if (gesture === 'pinch') {
    if (now - lastPinch > 900) { lastPinch = now; send('like', 0, 'pinch → like'); }
    prevFy = fy; return;
  }

  const d = neutralY - fy;             // + = hand raised above neutral
  const absd = Math.abs(d);

  if (MODE === 'glide') {
    // continuous velocity scroll with easing
    if (absd < DEAD_BAND) {
      // resting -> slowly recenter neutral to current
      neutralY += (fy - neutralY) * 0.03;
      sendScroll(0, 'centered');
    } else {
      const mag = Math.min(1, (absd - DEAD_BAND) / GLIDE_RANGE);
      const eased = mag * mag;          // easeInQuad: gentle near band, faster far
      // raise hand (d>0) -> scroll DOWN to next content -> positive velocity
      const vel = Math.sign(d) * eased * MAX_SPEED * SENSITIVITY;
      sendScroll(+vel.toFixed(2), (d > 0 ? '▼ ' : '▲ ') + Math.round(Math.abs(vel)));
    }
  } else {
    // FLICK mode: detect a deliberate vertical flick
    if (prevFy !== null) { const dy = fy - prevFy; smoothVel = smoothVel * 0.55 + dy * 0.45; }
    prevFy = fy;
    const thresh = FLICK_BASE / SENSITIVITY;
    if (Math.abs(smoothVel) < thresh * 0.4) armed = true;
    if (armed && (now - lastFire) > COOLDOWN_MS) {
      if (smoothVel < -thresh) { lastFire = now; armed = false; send('next', 0, 'NEXT ▼'); }
      else if (smoothVel > thresh) { lastFire = now; armed = false; send('prev', 0, 'PREV ▲'); }
      else send(null, 0, 'point');
    } else send(null, 0, 'point');
  }
}

/* ---------- camera ---------- */
async function start() {
  const hands = new Hands({ locateFile: (f) => chrome.runtime.getURL('vendor/' + f) });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
  hands.onResults(onResults);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360, facingMode: 'user' }, audio: false });
    videoEl.srcObject = stream; await videoEl.play();
    $('hint').style.display = 'none';
    setStatus('Tracking — raise your hand', 'on');
    const camera = new Camera(videoEl, { onFrame: async () => { await hands.send({ image: videoEl }); }, width: 480, height: 360 });
    camera.start();
  } catch (err) {
    setStatus('Camera error', 'err'); $('hint').style.display = 'none';
    $('err').classList.add('show');
    $('err').innerHTML = 'Could not start the camera:<br><b>' + String(err.name || err) + '</b><br>Close any app using the webcam (Zoom, Teams, Camera), then reopen.';
  }
}
start();
