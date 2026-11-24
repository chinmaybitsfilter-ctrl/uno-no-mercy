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

## Run locally
```
node server.js        # http://localhost:3000
npm test              # 3,000 simulated games + full HTTP test
```
No dependencies — just Node 18+.

## Put it online (free) so friends on other phones can join
**Render.com**: New → Blueprint (or Web Service) → connect this repo. It reads `render.yaml` (start command `node server.js`). You get a URL like `https://uno-no-mercy.onrender.com` — share that.

Free Render instances sleep after ~15 minutes idle; the first visit takes ~30 s to wake up. Rooms live in memory, so a restart clears them.

## Files
- `game.js` — rules engine
- `server.js` — rooms + real-time updates (Server-Sent Events)
- `public/index.html` — the phone UI
