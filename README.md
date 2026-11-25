# 🔥 UNO Show 'Em No Mercy — Ludo King style

Play UNO No Mercy on your **phone or laptop** — online with friends, against the computer, or pass-and-play on one device.

**▶️ Play:** https://chinmaybitsfilter-ctrl.github.io/uno-no-mercy/
**📱 Android APK:** https://github.com/chinmaybitsfilter-ctrl/uno-no-mercy/releases/latest/download/UNO-No-Mercy.apk

## Game modes (like Ludo King)
| Mode | What it does |
|---|---|
| 🤖 **VS Computer** | 1–9 computer players, Easy or Hard. Works offline. |
| 🌐 **Play With Friends** | Create a room (2–10 players), share the code / WhatsApp link. Add computer players to fill seats. |
| 📱 **Pass N Play** | 2–6 people on one device, with a "pass the phone" screen so nobody sees your cards. |
| 🔑 **Join Room** | Enter a friend's 5-letter code. |

## Features
- Round table with avatar seats, card counts, Mercy-meter bars and a glowing turn indicator
- **Turn timer** (off / 15 / 30 / 45 s) with a countdown ring — if it runs out the game plays for you
- **Emoji & quick-chat reactions** (😂🔥💀 "No mercy!", "GG"…)
- Flying-card and dealing animations, sound effects, vibration
- Profile with avatar, **coins, level and stats** (wins, streaks, best hand)
- Hand ranking screen, confetti, first to **1,000 points** wins the match
- Installable app on Android, iPhone and laptop (Chrome/Edge "Install app"), works offline vs computer

## Rules (Mattel's official No Mercy sheet)
168-card deck · stacking draw cards (equal or higher) · draw until you can play · Mercy Rule (25+ cards = out) · 7 swaps hands · 0 passes all hands · Skip Everyone · Discard All · Wild Reverse +4 · Wild +6 · Wild +10 · Wild Color Roulette · UNO call with *Catch!* (+2) · scoring with +250 per knockout.

## How online play works — no server needed
The site is plain HTML on **GitHub Pages**. The room creator's device runs the game; friends connect straight to it (WebRTC via PeerJS). The host should keep the game open until it ends.

## One-time setup
1. **Website:** repo **Settings → Pages → Source: Deploy from a branch → `main` / `/docs` → Save.**
2. **APK:** built automatically by GitHub Actions on every push (Actions tab → *Build Android APK*) and attached to the latest Release.

## Files
- `docs/index.html` — screens and styles
- `docs/app.js` — UI, modes, networking, animations, sounds
- `docs/room.js` — room logic, bots, turn timer, emotes (runs on the host device)
- `docs/bot.js` — computer player AI
- `docs/game.js` — rules engine
- `docs/sw.js`, `docs/manifest.webmanifest` — installable app / offline
- `test/sim.js` — 3,000 random games + 400 full bot matches (`npm test`)
