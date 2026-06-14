# GestureFlow — Hands-Free Shorts & Reels (Chrome Extension)

Scroll YouTube Shorts and Instagram Reels with hand gestures using your webcam.
Everything runs **on-device** — no video ever leaves your machine.

## Install (Load Unpacked)

1. Unzip this folder somewhere permanent.
2. Open Chrome → `chrome://extensions`
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** → select the `GestureFlow` folder.
5. Pin the extension (puzzle-piece icon → pin GestureFlow).

## Use

1. Open **youtube.com/shorts** or **instagram.com/reels** in a tab.
2. Click the GestureFlow icon → **Start tracking**.
3. The first time, Chrome asks for **camera permission** — click **Allow**.
4. Raise your hand into view and gesture:

| Gesture | Action |
|---|---|
| ✋ Raise hand up | Next video |
| 👇 Lower hand | Previous video |
| ✊ Make a fist | Pause (no input) |
| 🤏 Pinch (thumb + index) | Like the current video |

A small green toast appears on the page confirming each action.

## Tuning

In the popup:
- **Sensitivity** — higher = smaller hand movements trigger a flick.
- **Cooldown** — minimum time between two triggered flicks (prevents double-skips).

## How it works (architecture)

- `offscreen.html/.js` — a hidden background page that owns the webcam and runs
  **MediaPipe Hands** (bundled locally in `/vendor`, no CDN). It detects a
  vertical "flick" of your index fingertip and classifies fist / pinch.
- `background.js` — service worker. Manages the offscreen doc and relays each
  detected action to the active YouTube/Instagram tab.
- `content.js` — injected into the page. Turns an action into a real navigation
  (Arrow-key + wheel for Shorts/Reels, which are one-video-per-screen).
- `popup.*` — start/stop, camera-permission prompt, live settings.

## Notes & limits

- Works on the **web versions** of YouTube/Instagram. The native phone apps
  need a separate Android Accessibility Service build.
- Selectors for the **Like** button can break when these sites change their
  markup — next/previous (key-based) are the most robust.
- This mimics input you could perform yourself; it does not automate accounts.

## Replacing the icons

The icons in `/icons` are minimal placeholders generated programmatically.
Drop in your own 16/48/128px PNGs with the same filenames to rebrand.
