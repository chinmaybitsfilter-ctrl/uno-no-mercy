// Computer players for UNO No Mercy. Also used to auto-play when a human's turn timer runs out.
(function (root) {
'use strict';
const E = (typeof module !== 'undefined' && module.exports) ? require('./game.js') : root.UnoEngine;
const { COLORS, DRAW_VALUE, randInt: rnd } = E;

function bestColor(hand, skipId) {
  const cnt = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.id !== skipId && c.color in cnt) cnt[c.color] += c.type === 'number' ? 1 : 1.5;
  let best = null, bv = 0;
  for (const k of COLORS) if (cnt[k] > bv) { bv = cnt[k]; best = k; }
  return best || COLORS[rnd(4)];
}

function score(g, p, c) {
  if (g.stack > 0) return -(DRAW_VALUE[c.type] || 0); // stack with the smallest card that works, keep big ones
  const me = g.idx(p);
  const next = g.players[g.nextIdx(me)];
  const danger = next.hand.length <= 3;
  const others = g.active().filter(x => x !== p);
  const sameColor = p.hand.filter(x => x.color === c.color && x.id !== c.id).length;
  const followUp = p.hand.some(x => x.id !== c.id && (x.color === c.color || x.color === 'wild'));
  let s;
  switch (c.type) {
    case 'number': {
      s = 10 + c.value * 0.3 + sameColor;
      if (c.value === 7 && p.hand.length > 1) {
        const minOpp = Math.min(...others.map(x => x.hand.length));
        s += p.hand.length - minOpp > 2 ? 30 : -15;
      }
      if (c.value === 0) {
        const prev = g.players[g.nextIdx(me, -g.dir)];
        s += prev.hand.length < p.hand.length - 2 ? 22 : -12;
      }
      break;
    }
    case 'skip': case 'reverse': s = 12 + (danger ? 15 : 0) + sameColor; break;
    case 'skipAll': s = 12 + (followUp ? 8 : -4) + (danger ? 10 : 0); break;
    case 'discardAll': s = 8 + 4 * sameColor; break;
    case 'draw2': case 'draw4': s = 14 + (danger ? 25 : 0); break;
    case 'roulette': s = 3 + (danger ? 22 : 0); break;
    default: s = 2 + (danger ? 30 : 0) + (DRAW_VALUE[c.type] || 0) * (danger ? 1 : -0.3); // draw wilds: save them
  }
  if (p.hand.length <= 3 && c.color === 'wild') s += 6; // dump expensive wilds near the end
  return s;
}

// Make one move for player p. Returns true if a move was made.
function move(g, p, level = 'hard') {
  if (!g || g.phase !== 'playing' || !p || p.out) return false;
  if (g.pending) {
    if (g.pending.playerId !== p.id) return false;
    g.rouletteColor(p, level === 'easy' ? COLORS[rnd(4)] : bestColor(p.hand));
    return true;
  }
  if (g.current() !== p) return false;
  const ids = g.playableIds(p);
  if (!ids.length) { g.draw(p); return true; }
  const cards = p.hand.filter(c => ids.includes(c.id));
  const card = level === 'easy' ? cards[rnd(cards.length)]
    : cards.map(c => ({ c, s: score(g, p, c) + Math.random() })).sort((a, b) => b.s - a.s)[0].c;
  let targetId = null;
  if (card.type === 'number' && card.value === 7 && p.hand.length > 1) {
    const others = g.active().filter(x => x !== p);
    const t = level === 'easy' ? others[rnd(others.length)] : others.sort((a, b) => a.hand.length - b.hand.length)[0];
    targetId = t.id;
  }
  if (p.hand.length === 2 && !p.unoDeclared && rnd(100) < (level === 'easy' ? 70 : 95)) g.callUno(p);
  g.play(p, { cardId: card.id, color: bestColor(p.hand, card.id), targetId });
  return true;
}

const api = { move, bestColor };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.UnoBot = api;
})(typeof window !== 'undefined' ? window : globalThis);
