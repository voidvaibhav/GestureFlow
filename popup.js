/* GestureFlow popup (v1.4) — Step / Glide / Grab */
const $=id=>document.getElementById(id);
let tracking=false, mode='step';
const HELP={
  step:'<b>Step:</b> raise past the line for next, lower for prev, then return to the middle to re-arm. One reach = one video.<br><span class="key">✊ fist</span> pause &nbsp; <span class="key">🤏 pinch</span> like',
  glide:'<b>Glide:</b> the feed follows your hand but stops after <b>one</b> video and locks. Return your hand to the middle to commit &amp; re-arm.<br><span class="key">✊ fist</span> pause &nbsp; <span class="key">🤏 pinch</span> like',
  grab:'<b>Grab:</b> pinch to grab, pull up=next / down=prev, release. One pull = one video. Pinch &amp; release in place = like.<br><span class="key">✊ fist</span> pause'
};
const RLBL={step:'Reach',glide:'Dead zone',grab:'Pull dist'};

chrome.storage.local.get(['mode','reach','smoothness','gspeed'],s=>{
  if(s.mode)mode=s.mode;
  if(s.reach){$('reach').value=Math.round(s.reach*100);$('reachV').textContent=Math.round(s.reach*100);}
  if(typeof s.smoothness==='number'){$('smooth').value=s.smoothness;$('smoothV').textContent=s.smoothness;}
  if(typeof s.gspeed==='number'){$('gspeed').value=s.gspeed;$('gspeedV').textContent=s.gspeed;}
  paint();
});
chrome.runtime.sendMessage({type:'GF_STATUS'},r=>{if(r&&r.tracking)setUI(true);});

function setUI(on){tracking=on;
  $('toggle').textContent=on?'⏹ Stop tracking':'▶ Start tracking';
  $('toggle').className='btn '+(on?'btn-stop':'btn-go');
  $('dot').className='dot'+(on?' on':'');$('statusText').textContent=on?'Tracking window open':'Idle';
  if(!on)$('gest').textContent='';}
$('toggle').onclick=()=>{if(tracking)chrome.runtime.sendMessage({type:'GF_STOP'},()=>setUI(false));
  else chrome.runtime.sendMessage({type:'GF_START'},r=>{if(r&&r.ok)setUI(true);});};

function paint(){
  ['step','glide','grab'].forEach(m=>$('m_'+m).classList.toggle('active',mode===m));
  $('help').innerHTML=HELP[mode];$('reachLbl').textContent=RLBL[mode];
  $('rowGspeed').style.display = mode==='glide'?'flex':'none';
}
function setMode(m){mode=m;chrome.storage.local.set({mode:m});paint();}
['step','glide','grab'].forEach(m=>$('m_'+m).onclick=()=>setMode(m));

$('reach').oninput=e=>{$('reachV').textContent=e.target.value;chrome.storage.local.set({reach:+e.target.value/100});};
$('smooth').oninput=e=>{$('smoothV').textContent=e.target.value;chrome.storage.local.set({smoothness:+e.target.value});};
$('gspeed').oninput=e=>{$('gspeedV').textContent=e.target.value;chrome.storage.local.set({gspeed:+e.target.value});};

chrome.runtime.onMessage.addListener(m=>{if(m.type==='GF_POPUP_STATE'&&m.state)$('gest').textContent=m.state.gesture||'';});
