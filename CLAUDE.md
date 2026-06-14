# GestureFlow — Project Guide for Claude Code

## What this is
A Manifest V3 Chrome extension that scrolls YouTube Shorts and Instagram Reels
using hand gestures from the webcam. All processing is on-device via MediaPipe
Hands. No network calls, no data leaves the machine.

## How to load / test
This is an unpacked Chrome extension — there is no build step.
1. Go to `chrome://extensions`, enable Developer mode.
2. "Load unpacked" → select this folder.
3. After ANY code change: click the reload icon on the extension card, then
   reload the YouTube/Instagram tab.
- Camera runs in a separate popup window (`tracker.html`), opened by the
  background worker. This is deliberate — a visible window can request camera
  permission reliably, a hidden offscreen document cannot.

## Architecture (message flow)
popup (UI) → background (service worker) → tracker window (camera+ML) → background → content script (page)

- `manifest.json`  — MV3 config. CSP includes `wasm-unsafe-eval` for MediaPipe.
- `background.js`  — opens/closes the tracker window; relays gesture actions to
  the most-recently-used YouTube/Instagram tab (by `tab.lastAccessed`).
- `tracker.html/js`— visible camera window. Runs MediaPipe Hands, One-Euro
  filtering, neutral re-centering, gesture classification, and emits actions.
- `content.js`     — injected into youtube.com / instagram.com. Turns actions
  into navigation: discrete (Flick) or momentum scroll (Glide).
- `popup.html/js`  — start/stop, mode toggle, sensitivity/smoothness/speed/cooldown.
- `vendor/`        — bundled MediaPipe (hands, camera_utils, drawing_utils + wasm
  and model files). DO NOT edit. ~9 MB; loaded via `chrome.runtime.getURL`.

## Two modes
- FLICK: one deliberate vertical flick = next/prev. Best for Shorts/Reels.
- GLIDE: hand distance from a neutral line = continuous scroll speed (eased),
  with momentum/decay in the content-script rAF loop. Best for long feeds.

## Gestures
raise hand = next / scroll down · lower = prev / up · fist = pause · pinch = like

## Key technical notes / gotchas
- Tracking signal is smoothed with a One-Euro filter (see `OneEuro` in tracker.js).
  Tune via the Smoothness slider → maps to filter minCutoff.
- Neutral Y re-centers slowly while resting, so the user can hold their hand
  anywhere comfortable.
- YouTube sometimes ignores synthetic ArrowDown keypresses (isTrusted:false).
  `content.js` therefore ALSO does a smooth container scroll as a fallback.
  If Shorts won't advance, improve the YouTube scroll path, not the pipeline.
- Settings live in `chrome.storage.local`; tracker reads them live via
  `storage.onChanged`. Keys: mode, sensitivity, smoothness, maxspeed, cooldown.

## Conventions
- Vanilla JS, no framework, no bundler. Keep it dependency-free except vendor/.
- Bump `version` in manifest.json on meaningful changes.
- Validate JS with `node --check <file>.js` before considering a change done.

## Roadmap ideas (not yet built)
- Robust YouTube Shorts advance (wheel-event injection / container targeting).
- Horizontal gestures for tab/app switching.
- Calibration step for camera distance.
- Native Android Accessibility Service version for the phone apps.
