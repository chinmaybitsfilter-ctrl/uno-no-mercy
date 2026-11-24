// UNO Show 'Em No Mercy — game engine (pure logic, no networking)
// Rules follow Mattel's official No Mercy instruction sheet (HVW18).
'use strict';
const crypto = require('crypto');

const COLORS = ['red', 'yellow', 'green', 'blue'];
const DRAW_VALUE = { draw2: 2, draw4: 4, wildRev4: 4, wild6: 6, wild10: 10 };
const MERCY_LIMIT = 25;
const HAND_SIZE = 7;
const MAX_LOG = 40;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 168 cards
function buildDeck() {
  const d = [];
  let id = 0;
  const add = (color, type, value = null) => d.push({ id: id++, color, type, value });
  for (const c of COLORS) {
    for (let n = 0; n <= 9; n++) { add(c, 'number', n); add(c, 'number', n); } // 20
    for (let i = 0; i < 3; i++) { add(c, 'skip'); add(c, 'reverse'); add(c, 'draw2'); add(c, 'discardAll'); } // 12
    for (let i = 0; i < 2; i++) { add(c, 'skipAll'); add(c, 'draw4'); } // 4
  }
  for (let i = 0; i < 8; i++) { add('wild', 'wildRev4'); add('wild', 'roulette'); }
  for (let i = 0; i < 4; i++) { add('wild', 'wild6'); add('wild', 'wild10'); }
  return shuffle(d);
}

const NAMES = {
  skip: 'Skip', reverse: 'Reverse', draw2: '+2', draw4: '+4', discardAll: 'Discard All',
  skipAll: 'Skip Everyone', wildRev4: 'Wild Reverse +4', wild6: 'Wild +6', wild10: 'Wild +10',
  roulette: 'Wild Color Roulette',
};
function cardName(c) {
  if (c.type === 'number') return `${c.color} ${c.value}`;
  return c.color === 'wild' ? NAMES[c.type] : `${c.color} ${NAMES[c.type]}`;
}
function cardPoints(c) {
  if (c.type === 'number') return c.value;
  return c.color === 'wild' ? 50 : 20;
}

class Game {
  constructor(players) {
    // players: [{id, name}] in seat order
    this.players = players.map(p => ({ id: p.id, name: p.name, hand: [], out: false, left: false,
      score: 0, unoDeclared: false, unoVulnerable: null, mustPlay: null }));
    this.phase = 'over';
    this.dealer = -1;
    this.log = [];
    this.hands = 0;
  }

  addLog(msg) { this.log.push({ t: Date.now(), msg }); if (this.log.length > MAX_LOG) this.log.shift(); }
  active() { return this.players.filter(p => !p.out && !p.left); }
  byId(id) { return this.players.find(p => p.id === id); }
  idx(p) { return this.players.indexOf(p); }
  current() { return this.players[this.turn]; }

  nextIdx(from, dir = this.dir) {
    const n = this.players.length;
    let i = from;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      const p = this.players[i];
      if (!p.out && !p.left) return i;
    }
    return from;
  }

  setTurn(i) {
    this.turn = i;
    this.turnSeq++;
    for (const p of this.players) p.mustPlay = null;
  }
  advance(fromIdx, steps = 1) {
    let i = fromIdx;
    for (let s = 0; s < steps; s++) i = this.nextIdx(i);
    this.setTurn(i);
  }

  startHand() {
    const live = this.players.filter(p => !p.left);
    if (live.length < 2) throw new Error('Need at least 2 players');
    this.deck = buildDeck();
    this.discard = [];
    this.outPile = [];
    this.dir = 1;
    this.stack = 0;
    this.stackMin = 0;
    this.pending = null;
    this.turnSeq = 0;
    this.knockouts = 0;
    this.result = null;
    this.hands++;
    for (const p of this.players) {
      p.hand = []; p.out = !!p.left; p.unoDeclared = false; p.unoVulnerable = null; p.mustPlay = null;
    }
    for (let r = 0; r < HAND_SIZE; r++) for (const p of this.active()) p.hand.push(this.deck.pop());
    // Flip first card; if it's an action card, set it aside and flip again
    let top = this.deck.pop();
    while (top.type !== 'number') { this.deck.unshift(top); top = this.deck.pop(); }
    this.discard.push(top);
    this.top = top;
    this.color = top.color;
    this.dealer = this.nextIdx(this.dealer < 0 ? this.players.length - 1 : this.dealer);
    this.phase = 'playing';
    this.log = [];
    this.addLog(`Hand ${this.hands} started. First card: ${cardName(top)}.`);
    this.setTurn(this.nextIdx(this.dealer));
  }

  takeCard() {
    if (this.deck.length === 0) {
      if (this.discard.length <= 1 && this.outPile.length === 0) return null;
      const top = this.discard.pop();
      this.deck = shuffle(this.discard.concat(this.outPile));
      this.discard = [top];
      this.outPile = [];
      this.addLog('Draw pile reshuffled.');
      if (this.deck.length === 0) return null;
    }
    return this.deck.pop();
  }
  drawCards(p, n) {
    let got = 0;
    for (let i = 0; i < n; i++) {
      const c = this.takeCard();
      if (!c) break;
      p.hand.push(c); got++;
    }
    if (got) { p.unoDeclared = false; p.unoVulnerable = null; }
    return got;
  }

  canPlay(card) {
    if (this.stack > 0) return (DRAW_VALUE[card.type] || 0) >= this.stackMin;
    if (card.color === 'wild') return true;
    if (card.color === this.color) return true;
    if (card.type === 'number') return this.top.type === 'number' && this.top.value === card.value;
    return card.type === this.top.type;
  }
  playableIds(p) {
    if (this.phase !== 'playing' || this.current() !== p || this.pending) return [];
    if (p.mustPlay != null) return [p.mustPlay];
    return p.hand.filter(c => this.canPlay(c)).map(c => c.id);
  }

  // Mercy Rule: 25+ cards = knocked out. Returns true if the hand ended.
  checkMercy() {
    for (const p of this.active()) {
      if (p.hand.length >= MERCY_LIMIT) {
        p.out = true;
        this.outPile.push(...p.hand);
        p.hand = [];
        this.knockouts++;
        this.addLog(`💀 ${p.name} hit ${MERCY_LIMIT}+ cards and is KNOCKED OUT (Mercy Rule)!`);
      }
    }
    const act = this.active();
    if (act.length === 1) { this.endHand(act[0], 'last one standing'); return true; }
    if (act.length === 0) { this.phase = 'over'; this.result = { winnerId: null, points: 0 }; return true; }
    return false;
  }

  endHand(winner, how) {
    let pts = 0;
    for (const p of this.active()) if (p !== winner) pts += p.hand.reduce((s, c) => s + cardPoints(c), 0);
    pts += 250 * this.knockouts;
    winner.score += pts;
    this.phase = 'over';
    this.pending = null;
    this.result = { winnerId: winner.id, points: pts, how };
    this.addLog(`🏆 ${winner.name} wins the hand (${how}) and scores ${pts} points!`);
  }

  assertTurn(p) {
    if (this.phase !== 'playing') throw new Error('Game is not running');
    if (!p || p.out || p.left) throw new Error('You are out of this hand');
    if (this.current() !== p) throw new Error("It's not your turn");
    if (this.pending) throw new Error('Waiting for a colour choice');
  }

  play(p, { cardId, color, targetId }) {
    this.assertTurn(p);
    const card = p.hand.find(c => c.id === cardId);
    if (!card) throw new Error('Card not in your hand');
    if (p.mustPlay != null && p.mustPlay !== cardId) throw new Error('You must play the card you just drew');
    if (!this.canPlay(card)) throw new Error(this.stack > 0
      ? `Stack a draw card worth +${this.stackMin} or more, or take the +${this.stack}` : "That card doesn't match");
    const needsColor = card.color === 'wild' && card.type !== 'roulette';
    if (needsColor && !COLORS.includes(color)) throw new Error('Pick a colour');
    let target = null;
    if (card.type === 'number' && card.value === 7 && p.hand.length > 1) {
      target = this.byId(targetId);
      if (!target || target === p || target.out || target.left) throw new Error('Pick a player to swap hands with');
    }

    const me = this.idx(p);
    p.hand.splice(p.hand.indexOf(card), 1);
    this.discard.push(card);
    this.top = card;
    this.color = card.color === 'wild' ? (needsColor ? color : this.color) : card.color;
    p.mustPlay = null;
    this.addLog(`${p.name} played ${cardName(card)}${needsColor ? ` → ${color}` : ''}.`);

    if (card.type === 'discardAll') {
      const extra = p.hand.filter(c => c.color === card.color);
      if (extra.length) {
        p.hand = p.hand.filter(c => c.color !== card.color);
        this.discard.splice(this.discard.length - 1, 0, ...extra);
        this.addLog(`${p.name} discarded ${extra.length} more ${card.color} card${extra.length > 1 ? 's' : ''}.`);
      }
    }

    if (p.hand.length === 0) { this.endHand(p, 'played their last card'); return; }
    if (p.hand.length === 1) {
      if (p.unoDeclared) this.addLog(`${p.name} is on UNO!`);
      else p.unoVulnerable = this.turnSeq;
    }

    const nActive = this.active().length;
    switch (card.type) {
      case 'number':
        if (card.value === 7 && target) {
          [p.hand, target.hand] = [target.hand, p.hand];
          for (const x of [p, target]) { x.unoDeclared = false; x.unoVulnerable = null; }
          this.addLog(`🔄 ${p.name} swapped hands with ${target.name}.`);
          if (this.checkMercy()) return;
        } else if (card.value === 0) {
          const act = this.active();
          const hands = act.map(x => x.hand);
          const k = act.length;
          act.forEach((x, i) => {
            x.hand = this.dir === 1 ? hands[(i - 1 + k) % k] : hands[(i + 1) % k];
            x.unoDeclared = false; x.unoVulnerable = null;
          });
          this.addLog(`🔁 Everyone passed their hand ${this.dir === 1 ? 'forward' : 'backward'}!`);
          if (this.checkMercy()) return;
        }
        this.advance(me);
        break;
      case 'skip':
        this.addLog(`${this.players[this.nextIdx(me)].name} is skipped.`);
        this.advance(me, 2);
        break;
      case 'skipAll':
        this.addLog(`Everyone is skipped — ${p.name} goes again!`);
        this.setTurn(me);
        break;
      case 'reverse':
        this.dir *= -1;
        if (nActive === 2) this.setTurn(me); else this.advance(me);
        break;
      case 'discardAll':
        this.advance(me);
        break;
      case 'roulette': {
        const nx = this.nextIdx(me);
        this.setTurn(nx);
        this.pending = { type: 'roulette', playerId: this.players[nx].id };
        this.addLog(`🎰 ${this.players[nx].name} must choose a colour for Color Roulette!`);
        break;
      }
      default: { // draw cards
        const v = DRAW_VALUE[card.type];
        const wasStacking = this.stack > 0;
        this.stack += v;
        this.stackMin = v;
        if (card.type === 'wildRev4') {
          this.dir *= -1;
          if (nActive === 2 && !wasStacking) {
            this.setTurn(me); // official 2-player rule: the reverse bounces the +4 back to you
            this.addLog(`Reverse with 2 players — the +4 comes back to ${p.name}!`);
            break;
          }
        }
        this.advance(me);
        this.addLog(`⚠️ ${this.current().name} faces +${this.stack}! Stack or draw.`);
      }
    }
  }

  draw(p) {
    this.assertTurn(p);
    if (p.mustPlay != null) throw new Error('You already drew — play the highlighted card');
    const me = this.idx(p);
    if (this.stack > 0) {
      const n = this.stack;
      this.stack = 0; this.stackMin = 0;
      const got = this.drawCards(p, n);
      this.addLog(`😵 ${p.name} drew ${got} cards and loses their turn.`);
      if (this.checkMercy()) return;
      this.advance(me);
      return;
    }
    if (p.hand.some(c => this.canPlay(c))) throw new Error('You have a playable card — you must play it');
    let got = 0;
    for (;;) {
      const c = this.takeCard();
      if (!c) break;
      p.hand.push(c); got++;
      if (this.canPlay(c)) { p.mustPlay = c.id; break; }
      if (p.hand.length >= MERCY_LIMIT) break;
    }
    if (got) { p.unoDeclared = false; p.unoVulnerable = null; }
    this.addLog(`${p.name} drew ${got} card${got === 1 ? '' : 's'} until they could play.`);
    if (this.checkMercy()) return;
    if (p.out || p.mustPlay == null) this.advance(me); // knocked out, or deck ran dry
  }

  rouletteColor(p, color) {
    if (this.phase !== 'playing' || !this.pending || this.pending.playerId !== p.id) throw new Error('Not your choice');
    if (!COLORS.includes(color)) throw new Error('Pick a colour');
    this.pending = null;
    const revealed = [];
    for (;;) {
      const c = this.takeCard();
      if (!c) break;
      p.hand.push(c); revealed.push(c);
      if (c.color === color) break; // wilds don't count
    }
    if (revealed.length) { p.unoDeclared = false; p.unoVulnerable = null; }
    this.color = color;
    this.addLog(`🎰 ${p.name} chose ${color} and revealed ${revealed.length} card${revealed.length === 1 ? '' : 's'} — all into their hand!`);
    if (this.checkMercy()) return;
    this.advance(this.idx(p));
  }

  callUno(p) {
    if (this.phase !== 'playing' || p.out) throw new Error('Not now');
    if (p.hand.length > 2) throw new Error('You can only call UNO with 2 or fewer cards');
    p.unoDeclared = true;
    p.unoVulnerable = null;
    this.addLog(`📣 ${p.name} shouts UNO!`);
  }

  isCatchable(t) {
    return this.phase === 'playing' && !t.out && t.hand.length === 1 && t.unoVulnerable != null
      && this.turnSeq - t.unoVulnerable <= 1;
  }
  catchUno(p, targetId) {
    const t = this.byId(targetId);
    if (!t || t === p || p.out) throw new Error('Not allowed');
    if (!this.isCatchable(t)) throw new Error('Too late — they are safe');
    t.unoVulnerable = null;
    this.drawCards(t, 2);
    this.addLog(`🚨 ${p.name} caught ${t.name} not saying UNO! ${t.name} draws 2.`);
    this.checkMercy();
  }

  removePlayer(p, reason) {
    if (this.phase === 'playing' && !p.out && !p.left) {
      const wasTurn = this.current() === p;
      const pendingMine = this.pending && this.pending.playerId === p.id;
      p.left = true; p.out = true;
      this.outPile.push(...p.hand);
      p.hand = [];
      this.addLog(`${p.name} ${reason}.`);
      const act = this.active();
      if (act.length === 1) { this.endHand(act[0], 'everyone else left'); return; }
      if (wasTurn || pendingMine) { this.pending = null; this.stack = 0; this.stackMin = 0; this.advance(this.idx(p)); }
    } else {
      p.left = true; p.out = true;
    }
  }

  viewFor(pid) {
    const me = this.byId(pid);
    return {
      phase: this.phase,
      hand: me ? me.hand : [],
      top: this.top || null,
      color: this.color || null,
      dir: this.dir || 1,
      turnId: this.phase === 'playing' ? this.current().id : null,
      stack: this.stack || 0,
      stackMin: this.stackMin || 0,
      pending: this.pending,
      mustPlay: me ? me.mustPlay : null,
      playable: me ? this.playableIds(me) : [],
      canDraw: !!me && this.phase === 'playing' && this.current() === me && !this.pending && me.mustPlay == null
        && (this.stack > 0 || !me.hand.some(c => this.canPlay(c))),
      deckCount: this.deck ? this.deck.length : 0,
      log: this.log,
      result: this.result,
      mercyLimit: MERCY_LIMIT,
      seats: this.players.map(p => ({
        id: p.id, count: p.hand.length, out: p.out, left: p.left, score: p.score,
        catchable: this.isCatchable(p), uno: p.hand.length === 1 && !p.out,
      })),
    };
  }
}

module.exports = { Game, buildDeck, COLORS, DRAW_VALUE, cardName };
