/* ============================================================
   GestureFlow — tracker logic (v1.4)
   Three modes, all capped to ONE video per motion:
   - STEP : cross a line, return to rest to re-arm
   - GLIDE: feed follows your hand, but locks after one video;
            return to neutral to re-arm (commit/cancel on release)
   - GRAB : pinch to engage, pull, release = one step
   ============================================================ */

const videoEl = document.getElementById('cam');
const ov = document.getElementById('ov'); const octx = ov.getContext('2d');
const $ = id => document.getElementById(id);

class OneEuro {
  constructor(mc=1.4,beta=0.015){this.mc=mc;this.beta=beta;this.dc=1;this.xp=null;this.dxp=0;this.tp=null;}
  _a(c,dt){const t=1/(2*Math.PI*c);return 1/(1+t/dt);}
  filter(x,t){if(this.tp===null){this.tp=t;this.xp=x;return x;}let dt=(t-this.tp)/1000;if(dt<=0)dt=1/60;
    const dx=(x-this.xp)/dt,aD=this._a(this.dc,dt),dxh=aD*dx+(1-aD)*this.dxp;
    const a=this._a(this.mc+this.beta*Math.abs(dxh),dt),xh=a*x+(1-a)*this.xp;
    this.xp=xh;this.dxp=dxh;this.tp=t;return xh;}
  setMc(v){this.mc=v;}
}
const fy_f = new OneEuro();

let MODE='step', REACH=0.13, SMOOTH=55, GSPEED=10;
function applySmooth(v){SMOOTH=v;fy_f.setMc(2.6-(v/100)*2.0);}
chrome.storage.local.get(['mode','reach','smoothness','gspeed'],s=>{
  if(s.mode)MODE=s.mode; if(typeof s.reach==='number')REACH=s.reach;
  if(typeof s.gspeed==='number')GSPEED=s.gspeed;
  applySmooth(typeof s.smoothness==='number'?s.smoothness:55);
});
chrome.storage.onChanged.addListener(c=>{
  if(c.mode)MODE=c.mode.newValue; if(c.reach)REACH=c.reach.newValue;
  if(c.gspeed)GSPEED=c.gspeed.newValue; if(c.smoothness)applySmooth(c.smoothness.newValue);
});

let neutralY=null, stepState='rest', lastFire=0, gHist=[];
let pinching=false, grabStartY=0, grabStartT=0, lastPinch=0;
let glideEngaged=false, lastGlideSend=0, lastVel=0;

const REST_BAND=0.06, COOLDOWN=350, GLIDE_RANGE=0.30;

function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function setStatus(t,cls){$('status').textContent=t;$('dot').className='dot'+(cls?' '+cls:'');}
function emit(action,label,velocity){chrome.runtime.sendMessage({type:'GF_GESTURE',action,velocity:velocity||0,state:{gesture:label}}).catch(()=>{});if(label)$('gest').textContent=label;}
function emitGlide(vel,label){
  const now=performance.now();
  if(Math.abs(vel-lastVel)>0.4 || (now-lastGlideSend)>55 || (vel===0&&lastVel!==0)){
    emit('glide',label,+vel.toFixed(2)); lastVel=vel; lastGlideSend=now;
  } else if(label) $('gest').textContent=label;
}
function rawGesture(lm){if(dist(lm[4],lm[8])<0.05)return 'pinch';
  const folded=[[8,6],[12,10],[16,14],[20,18]].filter(([t,p])=>lm[t].y>lm[p].y).length;
  if(folded>=3)return 'fist';return 'open';}
function stable(g){gHist.push(g);if(gHist.length>5)gHist.shift();const c={};gHist.forEach(x=>c[x]=(c[x]||0)+1);
  let b=g,n=0;for(const k in c)if(c[k]>n){n=c[k];b=k;}return n>=3?b:'open';}

function onResults(res){
  const now=performance.now();
  octx.save();octx.clearRect(0,0,ov.width,ov.height);
  if(res.image)octx.drawImage(res.image,0,0,ov.width,ov.height);

  if(neutralY!==null && (MODE==='step'||MODE==='glide')){
    const ny=neutralY*ov.height, rb=REST_BAND*ov.height;
    octx.fillStyle='rgba(74,222,128,.10)';octx.fillRect(0,ny-rb,ov.width,rb*2);
    const tr=(MODE==='step'?REACH:GLIDE_RANGE+REST_BAND)*ov.height;
    octx.strokeStyle='rgba(248,113,113,.5)';octx.lineWidth=1.2;
    octx.beginPath();octx.moveTo(0,ny-tr);octx.lineTo(ov.width,ny-tr);octx.stroke();
    octx.beginPath();octx.moveTo(0,ny+tr);octx.lineTo(ov.width,ny+tr);octx.stroke();
  }
  octx.fillStyle='#7c8499';octx.font='11px system-ui';
  octx.scale(-1,1);octx.fillText(MODE.toUpperCase()+' MODE',-ov.width+8,16);octx.scale(-1,1);

  if(!res.multiHandLandmarks||!res.multiHandLandmarks.length){
    gHist=[];pinching=false;
    if(MODE==='glide'){glideEngaged=false;emitGlide(0,'—');} else emit(null,'—');
    octx.restore();return;
  }
  const lm=res.multiHandLandmarks[0];
  if(window.drawConnectors&&window.HAND_CONNECTIONS){drawConnectors(octx,lm,HAND_CONNECTIONS,{color:'#4ade80',lineWidth:2});drawLandmarks(octx,lm,{color:'#38bdf8',radius:2});}
  const fy=fy_f.filter(lm[8].y,now);
  octx.beginPath();octx.arc(lm[8].x*ov.width,fy*ov.height,7,0,Math.PI*2);octx.fillStyle=pinching?'#f87171':'#fbbf24';octx.fill();
  octx.restore();

  if(neutralY===null)neutralY=fy;
  const g=stable(rawGesture(lm));

  if(g==='fist'){stepState='rest';pinching=false;glideEngaged=false;
    if(MODE==='glide')emitGlide(0,'fist (paused)');else emit(null,'fist (paused)');return;}

  if(MODE==='grab'){handleGrab(lm,fy,now);return;}
  if(MODE==='glide'){handleGlide(fy,g,now);return;}
  handleStep(fy,now,g);
}

function handleStep(fy,now,g){
  if(g==='pinch'){if(now-lastPinch>900){lastPinch=now;emit('like','pinch → like');}else emit(null,'pinch');return;}
  const d=neutralY-fy;
  if(stepState==='rest'){
    if(Math.abs(d)<REST_BAND){neutralY+=(fy-neutralY)*0.04;emit(null,'rest ●');return;}
    if(now-lastFire<COOLDOWN){emit(null,'…');return;}
    if(d>REACH){stepState='firedUp';lastFire=now;emit('next','NEXT ▼ (return)');}
    else if(d<-REACH){stepState='firedDown';lastFire=now;emit('prev','PREV ▲ (return)');}
    else emit(null,d>0?'↑ reaching…':'↓ reaching…');
  }else if(stepState==='firedUp'){
    if(neutralY-fy<REST_BAND){stepState='rest';emit(null,'re-armed ●');}else emit(null,'return to rest');
  }else{
    if(neutralY-fy>-REST_BAND){stepState='rest';emit(null,'re-armed ●');}else emit(null,'return to rest');
  }
}

/* GLIDE: feed follows hand; content.js caps it at one video and locks.
   Sending velocity 0 (hand back in rest band) re-arms it.            */
function handleGlide(fy,g,now){
  if(g==='pinch'){if(now-lastPinch>900){lastPinch=now;emit('like','pinch → like');}return;}
  const d=neutralY-fy;
  if(Math.abs(d)<REST_BAND){
    neutralY+=(fy-neutralY)*0.04; glideEngaged=false; emitGlide(0,'rest ● (re-armed)'); return;
  }
  glideEngaged=true;
  const mag=Math.min(1,(Math.abs(d)-REST_BAND)/GLIDE_RANGE);
  const eased=mag*mag;
  const vel=Math.sign(d)*eased*GSPEED;   // +down(next) / -up(prev) px/frame
  emitGlide(+vel.toFixed(2),(d>0?'▼ gliding ':'▲ gliding ')+Math.round(mag*100)+'%');
}

function handleGrab(lm,fy,now){
  const pd=dist(lm[4],lm[8]);
  const engaged=pinching?pd<0.07:pd<0.05;
  if(engaged&&!pinching){pinching=true;grabStartY=fy;grabStartT=now;emit(null,'grabbed ✊');return;}
  if(engaged&&pinching){const drag=grabStartY-fy;emit(null,(drag>0?'↑ ':'↓ ')+'pull '+Math.round(Math.abs(drag)*100));return;}
  if(!engaged&&pinching){pinching=false;const drag=grabStartY-fy,dur=now-grabStartT;
    if(Math.abs(drag)>REACH){if(now-lastFire>COOLDOWN){lastFire=now;emit(drag>0?'next':'prev',drag>0?'NEXT ▼':'PREV ▲');}}
    else if(dur<450&&Math.abs(drag)<REST_BAND)emit('like','tap → like');
    else emit(null,'released');return;}
  emit(null,'pinch to grab');
}

async function start(){
  const hands=new Hands({locateFile:f=>chrome.runtime.getURL('vendor/'+f)});
  hands.setOptions({maxNumHands:1,modelComplexity:1,minDetectionConfidence:0.6,minTrackingConfidence:0.6});
  hands.onResults(onResults);
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:480,height:360,facingMode:'user'},audio:false});
    videoEl.srcObject=stream;await videoEl.play();$('hint').style.display='none';setStatus('Tracking — raise your hand','on');
    const camera=new Camera(videoEl,{onFrame:async()=>{await hands.send({image:videoEl});},width:480,height:360});camera.start();
  }catch(err){setStatus('Camera error','err');$('hint').style.display='none';$('err').classList.add('show');
    $('err').innerHTML='Could not start the camera:<br><b>'+String(err.name||err)+'</b><br>Close any app using the webcam, then reopen.';}
}
start();
