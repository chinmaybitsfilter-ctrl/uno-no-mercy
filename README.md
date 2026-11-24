# 🔥 UNO Show 'Em No Mercy — Online Multiplayer

Play UNO No Mercy with friends, each on your own phone. One person creates a room, picks how many players (2–10), and shares the invite link (or WhatsApp / room code). Everyone enters their name and joins — then the host hits **Start**.

## Rules (from Mattel's official No Mercy sheet)
- 168-card deck: numbers 0–9, Skip, Reverse, +2, +4, Discard All, Skip Everyone, Wild Reverse +4, Wild +6, Wild +10, Wild Color Roulette
- **Stacking**: answer a draw card with one of equal or higher value; the total keeps growing
- **Draw until you can play**, then you must play it
- **Mercy Rule**: 25+ cards = knocked out
- **7** swaps hands with a chosen player, **0** passes every hand along
- **Color Roulette**: next player picks a colour and flips until it shows (wilds don't count), keeps them all, loses turn
- **UNO** call with a *Catch!* button (+2 penalty)
- Scoring: numbers face value, coloured actions 20, wilds 50, +250 per knockout; first to 1,000

## How it works — no server needed
The site is plain HTML hosted free on **GitHub Pages**. When you create a room, **your phone becomes the game server**; friends' phones connect straight to it (WebRTC via PeerJS). So the host must keep the game open on screen until the game ends.

## Put it online (one time)
Repo **Settings → Pages → Source: Deploy from a branch → Branch: `main`, folder: `/docs` → Save**.
After ~1 minute the game is live at:

**https://chinmaybitsfilter-ctrl.github.io/uno-no-mercy/**

## Files
- `docs/index.html` — the phone UI + peer-to-peer networking
- `docs/room.js` — room logic (runs on the host's phone)
- `docs/game.js` — rules engine
- `test/sim.js` — 3,000 simulated games (`npm test`)
