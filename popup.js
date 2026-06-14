/* GestureFlow popup (v1.2) — mode toggle + settings + tracker window control */
const $ = id => document.getElementById(id);
let tracking = false;
let mode = 'flick';

// restore
chrome.storage.local.get(['mode','sensitivity','cooldown','maxspeed','smoothness'], (s) => {
  if (s.mode) setMode(s.mode, false);
  if (s.sensitivity) { $('sens').value = s.sensitivity; $('sensV').textContent = (+s.sensitivity).toFixed(1); }
  if (s.cooldown)    { $('cool').value = s.cooldown;    $('coolV').textContent = s.cooldown; }
  if (s.maxspeed)    { $('speed').value = s.maxspeed;   $('speedV').textContent = s.maxspeed; }
  if (typeof s.smoothness === 'number') { $('smooth').value = s.smoothness; $('smoothV').textContent = s.smoothness; }
  reflectModeRows();
});

chrome.runtime.sendMessage({ type: 'GF_STATUS' }, (r) => { if (r && r.tracking) setUI(true); });

function setUI(on) {
  tracking = on;
  $('toggle').textContent = on ? '⏹ Stop tracking' : '▶ Start tracking';
  $('toggle').className = 'btn ' + (on ? 'btn-stop' : 'btn-go');
  $('dot').className = 'dot' + (on ? ' on' : '');
  $('statusText').textContent = on ? 'Tracking window open' : 'Idle';
  if (!on) $('gest').textContent = '';
}

$('toggle').onclick = () => {
  if (tracking) chrome.runtime.sendMessage({ type: 'GF_STOP' }, () => setUI(false));
  else chrome.runtime.sendMessage({ type: 'GF_START' }, (r) => { if (r && r.ok) setUI(true); });
};

// mode toggle
function setMode(m, persist = true) {
  mode = m;
  $('mFlick').classList.toggle('active', m === 'flick');
  $('mGlide').classList.toggle('active', m === 'glide');
  reflectModeRows();
  if (persist) chrome.storage.local.set({ mode: m });
}
function reflectModeRows() {
  $('rowSpeed').classList.toggle('dim', mode !== 'glide');
  $('rowCool').classList.toggle('dim', mode !== 'flick');
}
$('mFlick').onclick = () => setMode('flick');
$('mGlide').onclick = () => setMode('glide');

// sliders -> storage (tracker reads live)
$('sens').oninput   = e => { $('sensV').textContent = (+e.target.value).toFixed(1); chrome.storage.local.set({ sensitivity: +e.target.value }); };
$('smooth').oninput = e => { $('smoothV').textContent = e.target.value; chrome.storage.local.set({ smoothness: +e.target.value }); };
$('speed').oninput  = e => { $('speedV').textContent = e.target.value; chrome.storage.local.set({ maxspeed: +e.target.value }); };
$('cool').oninput   = e => { $('coolV').textContent = e.target.value; chrome.storage.local.set({ cooldown: +e.target.value }); };

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GF_POPUP_STATE' && msg.state) $('gest').textContent = msg.state.gesture || '';
});
