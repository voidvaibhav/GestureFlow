/* ============================================================
   GestureFlow — background service worker (v1.1)
   Camera now lives in a visible popup window (tracker.html),
   which can reliably request camera permission.
   ============================================================ */

let trackerWindowId = null;
let tracking = false;

async function openTracker() {
  if (trackerWindowId !== null) {
    try { await chrome.windows.update(trackerWindowId, { focused: true }); return; } catch (e) {}
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('tracker.html'),
    type: 'popup', width: 360, height: 480
  });
  trackerWindowId = win.id;
  tracking = true;
}

async function closeTracker() {
  tracking = false;
  if (trackerWindowId !== null) {
    try { await chrome.windows.remove(trackerWindowId); } catch (e) {}
    trackerWindowId = null;
  }
}

chrome.windows.onRemoved.addListener((winId) => {
  if (winId === trackerWindowId) { trackerWindowId = null; tracking = false; }
});

async function getTargetTab() {
  const tabs = await chrome.tabs.query({
    url: ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://www.instagram.com/*']
  });
  if (!tabs.length) return null;
  tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return tabs[0];
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'GF_START':  await openTracker();  sendResponse({ ok: true }); break;
      case 'GF_STOP':   await closeTracker(); sendResponse({ ok: true }); break;
      case 'GF_STATUS': sendResponse({ tracking }); break;
      case 'GF_GESTURE': {
        if (msg.action) {
          const tab = await getTargetTab();
          if (tab) chrome.tabs.sendMessage(tab.id, { type: 'GF_ACTION', action: msg.action, velocity: msg.velocity }).catch(() => {});
        }
        chrome.runtime.sendMessage({ type: 'GF_POPUP_STATE', state: msg.state }).catch(() => {});
        break;
      }
    }
  })();
  return true;
});
