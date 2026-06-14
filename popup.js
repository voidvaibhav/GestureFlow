/* GestureFlow popup (v1.3) — Step/Grab modes */
const $ = id => document.getElementById(id);
let tracking=false, mode='step';

const HELP = {
  step: '<b>Step:</b> hold hand in the middle, gently <b>raise</b> past the line for next, <b>lower</b> for prev — then return to the middle to re-arm. One reach = one video.<br><span class="key">✊ fist</span> pause &nbsp; <span class="key">🤏 pinch</span> like',
  grab: '<b>Grab:</b> <b>pinch</b> to grab, <b>pull up</b> for next / <b>down</b> for prev, then release. One pull = one video. Pinch &amp; release in place = like.<br><span class="key">✊ fist</span> pause'
};
const REACH_LBL = { step:'Reach', grab:'Pull dist' };

chrome.storage.local.get(['mode','reach','smoothness'], s=>{
  if(s.mode) mode=s.mode;
  if(s.reach){ $('reach').value=s.reach*100; $('reachV').textContent=Math.round(s.reach*100); }
  if(typeof s.smoothness==='number'){ $('smooth').value=s.smoothness; $('smoothV').textContent=s.smoothness; }
  paintMode();
});
chrome.runtime.sendMessage({type:'GF_STATUS'},r=>{ if(r&&r.tracking) setUI(true); });

function setUI(on){
  tracking=on;
  $('toggle').textContent=on?'⏹ Stop tracking':'▶ Start tracking';
  $('toggle').className='btn '+(on?'btn-stop':'btn-go');
  $('dot').className='dot'+(on?' on':'');
  $('statusText').textContent=on?'Tracking window open':'Idle';
  if(!on) $('gest').textContent='';
}
$('toggle').onclick=()=>{
  if(tracking) chrome.runtime.sendMessage({type:'GF_STOP'},()=>setUI(false));
  else chrome.runtime.sendMessage({type:'GF_START'},r=>{ if(r&&r.ok) setUI(true); });
};

function paintMode(){
  $('mStep').classList.toggle('active', mode==='step');
  $('mGrab').classList.toggle('active', mode==='grab');
  $('help').innerHTML=HELP[mode];
  $('reachLbl').textContent=REACH_LBL[mode];
}
function setMode(m){ mode=m; chrome.storage.local.set({mode:m}); paintMode(); }
$('mStep').onclick=()=>setMode('step');
$('mGrab').onclick=()=>setMode('grab');

$('reach').oninput  = e=>{ $('reachV').textContent=e.target.value; chrome.storage.local.set({reach:+e.target.value/100}); };
$('smooth').oninput = e=>{ $('smoothV').textContent=e.target.value; chrome.storage.local.set({smoothness:+e.target.value}); };

chrome.runtime.onMessage.addListener(m=>{ if(m.type==='GF_POPUP_STATE'&&m.state) $('gest').textContent=m.state.gesture||''; });
