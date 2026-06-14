/* ============================================================
   GestureFlow — tracker logic (v1.3)
   New gesture model: ONE deliberate action = exactly ONE video.
   - STEP: cross a trigger line, must return to rest to re-arm
           (position-based, not velocity — reliable + low effort)
   - GRAB: pinch to engage, drag, release = one step
           (pinch is a clutch -> zero accidental triggers;
            pinch-release in place = like)
   Both feed a smooth single-item transition in content.js.
   ============================================================ */

const videoEl = document.getElementById('cam');
const ov  = document.getElementById('ov');
const octx = ov.getContext('2d');
const $ = id => document.getElementById(id);

/* ---------- One-Euro filter (jitter control) ---------- */
class OneEuro {
  constructor(minCutoff = 1.4, beta = 0.015) { this.mc = minCutoff; this.beta = beta; this.dc = 1.0; this.xp = null; this.dxp = 0; this.tp = null; }
  _a(c, dt) { const tau = 1 / (2 * Math.PI * c); return 1 / (1 + tau / dt); }
  filter(x, t) {
    if (this.tp === null) { this.tp = t; this.xp = x; return x; }
    let dt = (t - this.tp) / 1000; if (dt <= 0) dt = 1 / 60;
    const dx = (x - this.xp) / dt, aD = this._a(this.dc, dt);
    const dxh = aD * dx + (1 - aD) * this.dxp;
    const a = this._a(this.mc + this.beta * Math.abs(dxh), dt);
    const xh = a * x + (1 - a) * this.xp;
    this.xp = xh; this.dxp = dxh; this.tp = t; return xh;
  }
  setMc(v) { this.mc = v; }
}
const fy_f = new OneEuro();

/* ---------- settings ---------- */
let MODE = 'step';      // 'step' | 'grab'
let REACH = 0.13;       // trigger distance (step) / drag threshold (grab), normalized
let SMOOTH = 55;

function applySmooth(v){ SMOOTH = v; fy_f.setMc(2.6 - (v/100)*2.0); }
chrome.storage.local.get(['mode','reach','smoothness'], s => {
  if (s.mode) MODE = s.mode;
  if (typeof s.reach === 'number') REACH = s.reach;
  applySmooth(typeof s.smoothness === 'number' ? s.smoothness : 55);
});
chrome.storage.onChanged.addListener(c => {
  if (c.mode) MODE = c.mode.newValue;
  if (c.reach) REACH = c.reach.newValue;
  if (c.smoothness) applySmooth(c.smoothness.newValue);
});

/* ---------- state ---------- */
let neutralY = null;
let stepState = 'rest';     // 'rest' | 'firedUp' | 'firedDown'
let lastFire = 0;
let gHist = [];
// grab
let pinching = false, grabStartY = 0, grabStartT = 0;
let lastPinch = 0;

const REST_BAND = 0.06;     // half-height of the neutral rest zone
const COOLDOWN = 350;       // ms hard floor between fires

function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function setStatus(t,cls){ $('status').textContent=t; $('dot').className='dot'+(cls?' '+cls:''); }
function emit(action, label){ chrome.runtime.sendMessage({type:'GF_GESTURE', action, state:{gesture:label}}).catch(()=>{}); if(label) $('gest').textContent=label; }
function rawGesture(lm){
  if (dist(lm[4],lm[8]) < 0.05) return 'pinch';
  const folded=[[8,6],[12,10],[16,14],[20,18]].filter(([t,p])=>lm[t].y>lm[p].y).length;
  if (folded>=3) return 'fist';
  return 'open';
}
function stable(g){ gHist.push(g); if(gHist.length>5)gHist.shift();
  const c={}; gHist.forEach(x=>c[x]=(c[x]||0)+1); let b=g,n=0; for(const k in c) if(c[k]>n){n=c[k];b=k;} return n>=3?b:'open'; }

/* ---------- main ---------- */
function onResults(res){
  const now = performance.now();
  octx.save(); octx.clearRect(0,0,ov.width,ov.height);
  if (res.image) octx.drawImage(res.image,0,0,ov.width,ov.height);

  // draw rest band + trigger lines (STEP) once we have a neutral
  if (neutralY!==null && MODE==='step'){
    const ny=neutralY*ov.height, rb=REST_BAND*ov.height, tr=REACH*ov.height;
    octx.fillStyle='rgba(74,222,128,.10)'; octx.fillRect(0,ny-rb,ov.width,rb*2);
    octx.strokeStyle='rgba(248,113,113,.6)'; octx.lineWidth=1.5;
    octx.beginPath(); octx.moveTo(0,ny-tr); octx.lineTo(ov.width,ny-tr); octx.stroke(); // next line (up)
    octx.beginPath(); octx.moveTo(0,ny+tr); octx.lineTo(ov.width,ny+tr); octx.stroke(); // prev line (down)
  }
  octx.fillStyle='#7c8499'; octx.font='11px system-ui';
  octx.scale(-1,1); octx.fillText(MODE.toUpperCase()+' MODE', -ov.width+8, 16); octx.scale(-1,1);

  if (!res.multiHandLandmarks || !res.multiHandLandmarks.length){
    gHist=[]; pinching=false; emit(null,'—'); octx.restore(); return;
  }

  const lm = res.multiHandLandmarks[0];
  if (window.drawConnectors && window.HAND_CONNECTIONS){
    drawConnectors(octx,lm,HAND_CONNECTIONS,{color:'#4ade80',lineWidth:2});
    drawLandmarks(octx,lm,{color:'#38bdf8',radius:2});
  }
  const fy = fy_f.filter(lm[8].y, now);
  octx.beginPath(); octx.arc(lm[8].x*ov.width, fy*ov.height, 7, 0, Math.PI*2);
  octx.fillStyle = pinching ? '#f87171' : '#fbbf24'; octx.fill();
  octx.restore();

  if (neutralY===null) neutralY = fy;
  const g = stable(rawGesture(lm));

  /* fist = pause everywhere (also lets you scratch your nose) */
  if (g==='fist'){ stepState='rest'; pinching=false; emit(null,'fist (paused)'); return; }

  if (MODE==='grab'){ handleGrab(lm, fy, now); return; }
  handleStep(fy, now, g);
}

/* ---------- STEP: cross a line, return to rest to re-arm ---------- */
function handleStep(fy, now, g){
  // pinch = like in step mode
  if (g==='pinch'){ if(now-lastPinch>900){ lastPinch=now; emit('like','pinch → like'); } else emit(null,'pinch'); return; }

  const d = neutralY - fy;          // + = hand above neutral
  if (stepState==='rest'){
    if (Math.abs(d) < REST_BAND){ neutralY += (fy-neutralY)*0.04; emit(null,'rest ●'); return; }
    if (now-lastFire < COOLDOWN){ emit(null,'…'); return; }
    if (d >  REACH){ stepState='firedUp';   lastFire=now; emit('next','NEXT ▼ (return to rest)'); }
    else if (d < -REACH){ stepState='firedDown'; lastFire=now; emit('prev','PREV ▲ (return to rest)'); }
    else emit(null, d>0?'↑ reaching…':'↓ reaching…');
  } else if (stepState==='firedUp'){
    if (neutralY - fy < REST_BAND){ stepState='rest'; emit(null,'re-armed ●'); }
    else emit(null,'hold… return to rest');
  } else if (stepState==='firedDown'){
    if (neutralY - fy > -REST_BAND){ stepState='rest'; emit(null,'re-armed ●'); }
    else emit(null,'hold… return to rest');
  }
}

/* ---------- GRAB: pinch=clutch, drag=step, tap=like ---------- */
function handleGrab(lm, fy, now){
  const pd = dist(lm[4], lm[8]);
  const engaged = pinching ? pd < 0.07 : pd < 0.05;   // hysteresis
  if (engaged && !pinching){ pinching=true; grabStartY=fy; grabStartT=now; emit(null,'grabbed ✊'); return; }
  if (engaged && pinching){
    const drag = grabStartY - fy;
    emit(null, (drag>0?'↑ ':'↓ ') + 'pull ' + Math.round(Math.abs(drag)*100));
    return;
  }
  if (!engaged && pinching){       // released
    pinching=false;
    const drag = grabStartY - fy;
    const dur = now - grabStartT;
    if (Math.abs(drag) > REACH){
      if (now-lastFire>COOLDOWN){ lastFire=now; emit(drag>0?'next':'prev', drag>0?'NEXT ▼':'PREV ▲'); }
    } else if (dur < 450 && Math.abs(drag) < REST_BAND){
      emit('like','tap → like');
    } else emit(null,'released');
    return;
  }
  emit(null,'pinch to grab');
}

/* ---------- camera ---------- */
async function start(){
  const hands = new Hands({ locateFile:f=>chrome.runtime.getURL('vendor/'+f) });
  hands.setOptions({ maxNumHands:1, modelComplexity:1, minDetectionConfidence:0.6, minTrackingConfidence:0.6 });
  hands.onResults(onResults);
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video:{width:480,height:360,facingMode:'user'}, audio:false });
    videoEl.srcObject=stream; await videoEl.play();
    $('hint').style.display='none'; setStatus('Tracking — raise your hand','on');
    const camera = new Camera(videoEl,{ onFrame: async()=>{ await hands.send({image:videoEl}); }, width:480, height:360 });
    camera.start();
  }catch(err){
    setStatus('Camera error','err'); $('hint').style.display='none';
    $('err').classList.add('show');
    $('err').innerHTML='Could not start the camera:<br><b>'+String(err.name||err)+'</b><br>Close any app using the webcam, then reopen.';
  }
}
start();
