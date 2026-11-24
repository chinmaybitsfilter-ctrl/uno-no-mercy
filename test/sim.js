// Random-bot simulation: plays many hands and checks invariants.
const { Game, COLORS } = require('../game');
const assert = require('assert');
const pick = a => a[Math.floor(Math.random() * a.length)];

function total(g) {
  return g.deck.length + g.discard.length + g.outPile.length + g.players.reduce((s, p) => s + p.hand.length, 0);
}

let hands = 0, knockouts = 0, steps = 0, wins = { cards: 0, mercy: 0 };
for (let game = 0; game < 3000; game++) {
  const n = 2 + (game % 9);
  const g = new Game(Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i })));
  g.startHand();
  hands++;
  let guard = 0;
  while (g.phase === 'playing') {
    assert(++guard < 20000, 'game did not finish');
    steps++;
    // random UNO calls / catches
    for (const p of g.players) {
      if (!p.out && p.hand.length <= 2 && Math.random() < 0.3) g.callUno(p);
      if (Math.random() < 0.05) for (const t of g.players) if (t !== p && !p.out && g.isCatchable(t)) g.catchUno(p, t.id);
    }
    if (g.phase !== 'playing') break;
    if (g.pending) { g.rouletteColor(g.byId(g.pending.playerId), pick(COLORS)); }
    else {
      const p = g.current();
      const v = g.viewFor(p.id);
      if (v.playable.length && (g.stack === 0 || Math.random() < 0.7)) {
        const cardId = pick(v.playable);
        const others = g.active().filter(x => x !== p);
        g.play(p, { cardId, color: pick(COLORS), targetId: pick(others).id });
      } else {
        assert(v.canDraw, 'stuck: no play and cannot draw');
        g.draw(p);
      }
    }
    assert.strictEqual(total(g), 168, 'card count changed');
    for (const p of g.active()) assert(p.hand.length < 25, 'mercy not applied');
  }
  knockouts += g.knockouts;
  if (g.result && g.result.how === 'played their last card') wins.cards++; else wins.mercy++;
}
console.log({ hands, steps, knockouts, wins });
console.log('ALL INVARIANTS OK');
