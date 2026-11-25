// Room logic — runs inside the HOST's browser (the host device acts as the game server).
// Also used for offline modes (vs computer, pass & play) on a single device.
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const E = isNode ? require('./game.js') : root.UnoEngine;
const Bot = isNode ? require('./bot.js') : root.UnoBot;
const { Game, randInt } = E;

const hex = n => Array.from({ length: n }, () => randInt(16).toString(16)).join('');
const cleanName = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 16);
const AVATARS = ['🦁', '🐯', '🐼', '🦊', '🐸', '🐵', '🦄', '🐲', '🐺', '🐨', '🐙', '🦉', '😎', '🥷', '👑', '🤖'];
const BOT_NAMES = ['Riya', 'Arjun', 'Kabir', 'Meera', 'Vikram', 'Ananya', 'Rohan', 'Isha', 'Dev', 'Tara', 'Zoya', 'Aditya'];
const EMOTES = ['😂', '😡', '😎', '👍', '🔥', '😭', '🤡', '💀', '😱', '🙏', '🥳', '😈',
  'Well played!', 'Hurry up!', 'Oops!', 'No mercy! 😈', 'GG', 'Uno?! 👀', 'Sorry 😅', 'Revenge time!'];
const TARGET = 1000;

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => A[randInt(A.length)]).join('');
}
const pickAvatar = a => AVATARS.includes(a) ? a : AVATARS[randInt(AVATARS.length)];

class Room {
  constructor(code, maxPlayers, opts = {}) {
    this.code = code;
    this.maxPlayers = Math.max(2, Math.min(10, maxPlayers | 0 || 4));
    this.hostId = null;
    this.members = [];
    this.game = null;
    this.turnTime = [0, 15, 30, 45].includes(opts.turnTime) ? opts.turnTime : 30;
    this.botLevel = opts.botLevel === 'easy' ? 'easy' : 'hard';
    this.emotes = [];
    this.emoteSeq = 0;
    this.turnKey = null;
    this.turnStarted = 0;
    this.matchWinner = null;
  }

  addMember(rawName, avatar, bot = false) {
    const name = cleanName(rawName);
    if (!name) throw new Error('Enter your name');
    if (this.game && this.game.phase === 'playing') throw new Error('A hand is in progress — join when it ends');
    if (this.members.length >= this.maxPlayers) throw new Error(`Room is full (${this.maxPlayers} players)`);
    if (this.members.some(x => x.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is taken in this room');
    const m = { id: hex(8), token: hex(32), name, avatar: pickAvatar(avatar), bot: !!bot };
    this.members.push(m);
    if (!this.hostId && !bot) this.hostId = m.id;
    return m;
  }
  addBot() {
    const used = new Set(this.members.map(m => m.name.toLowerCase()));
    const free = BOT_NAMES.filter(n => !used.has(('🤖 ' + n).toLowerCase()));
    const name = '🤖 ' + (free.length ? free[randInt(free.length)] : 'Bot' + (this.members.length + 1));
    const used2 = new Set(this.members.map(m => m.avatar));
    const av = AVATARS.filter(a => !used2.has(a));
    return this.addMember(name, av[randInt(av.length)] || '🤖', true);
  }
  byToken(t) { return this.members.find(m => m.token === t); }
  byId(id) { return this.members.find(m => m.id === id); }
  humans() { return this.members.filter(m => !m.bot); }

  // who must act right now (turn player, or the player choosing a roulette colour)
  actorId() {
    const g = this.game;
    if (!g || g.phase !== 'playing') return null;
    return g.pending ? g.pending.playerId : g.current().id;
  }
  // restart the turn clock whenever the actor/turn changes
  syncTimer(now = Date.now()) {
    const g = this.game;
    const key = g && g.phase === 'playing' ? `${g.hands}:${g.turnSeq}:${g.pending ? 'p' : ''}:${this.actorId()}` : null;
    if (key !== this.turnKey) { this.turnKey = key; this.turnStarted = now; }
  }
  turnLeft(now = Date.now()) {
    if (!this.turnTime || !this.turnKey) return null;
    return Math.max(0, this.turnTime * 1000 - (now - this.turnStarted));
  }

  // computer move (or auto-move for a human whose timer ran out)
  autoMove(id) {
    const g = this.game, p = g && g.byId(id);
    if (!p || this.actorId() !== id) return false;
    const moved = Bot.move(g, p, this.byId(id) && this.byId(id).bot ? this.botLevel : 'hard');
    this.afterHand();
    return moved;
  }

  // returns list of member ids removed by this action (so the host can drop their connections)
  act(m, a) {
    const g = this.game;
    const isHost = this.hostId === m.id;
    const gp = g && g.byId(m.id);
    const need = () => { if (!gp) throw new Error('You are not in this hand'); };
    const notPlaying = () => { if (g && g.phase === 'playing') throw new Error('Wait until this hand ends'); };
    switch (a.type) {
      case 'start': {
        if (!isHost) throw new Error('Only the host can start');
        notPlaying();
        if (this.members.length < 2) throw new Error('Need at least 2 players');
        if (!g || this.matchWinner) {
          this.game = new Game(this.members.map(x => ({ id: x.id, name: x.name })));
          this.matchWinner = null;
        } else {
          g.players = g.players.filter(p => this.members.some(x => x.id === p.id));
          for (const x of this.members) if (!g.byId(x.id)) g.players.push({ id: x.id, name: x.name, hand: [], out: false, left: false, score: 0, unoDeclared: false, unoVulnerable: null, mustPlay: null });
        }
        this.game.startHand();
        return [];
      }
      case 'play': need(); g.play(gp, a); break;
      case 'draw': need(); g.draw(gp); break;
      case 'roulette': need(); g.rouletteColor(gp, a.color); break;
      case 'uno': need(); g.callUno(gp); return [];
      case 'catch': need(); g.catchUno(gp, a.targetId); break;
      case 'emote': {
        const e = EMOTES[a.e | 0];
        if (e === undefined) throw new Error('Unknown emote');
        const now = Date.now();
        if (m._lastEmote && now - m._lastEmote < 900) return [];
        m._lastEmote = now;
        this.emotes.push({ n: ++this.emoteSeq, from: m.id, e });
        if (this.emotes.length > 8) this.emotes.shift();
        return [];
      }
      case 'addBot': {
        if (!isHost) throw new Error('Only the host can add computer players');
        notPlaying();
        this.addBot();
        return [];
      }
      case 'kick': case 'leave': {
        const target = a.type === 'leave' ? m : this.members.find(x => x.id === a.targetId);
        if (!target) throw new Error('No such player');
        if (target.id === this.hostId) throw new Error('The host cannot leave — close the room instead');
        if (a.type === 'kick' && !isHost) throw new Error('Only the host can remove players');
        this.members = this.members.filter(x => x !== target);
        const tp = g && g.byId(target.id);
        if (tp) g.removePlayer(tp, a.type === 'kick' ? 'was removed' : 'left the game');
        this.afterHand();
        return [target.id];
      }
      case 'settings': {
        if (!isHost) throw new Error('Only the host can change this');
        if (a.maxPlayers != null) {
          const n = Math.max(2, Math.min(10, a.maxPlayers | 0));
          if (n < this.members.length) throw new Error('More players already joined');
          this.maxPlayers = n;
        }
        if (a.turnTime != null && [0, 15, 30, 45].includes(a.turnTime)) this.turnTime = a.turnTime;
        if (a.botLevel) this.botLevel = a.botLevel === 'easy' ? 'easy' : 'hard';
        return [];
      }
      default: throw new Error('Unknown action');
    }
    this.afterHand();
    return [];
  }
  afterHand() {
    const g = this.game;
    if (g && g.phase === 'over' && !this.matchWinner) {
      const top = g.players.filter(p => p.score >= TARGET).sort((a, b) => b.score - a.score)[0];
      if (top) this.matchWinner = top.id;
    }
  }

  stateFor(m, isConnected, now = Date.now()) {
    const v = this.game ? this.game.viewFor(m.id) : null;
    const seats = v ? Object.fromEntries(v.seats.map(s => [s.id, s])) : {};
    return {
      code: this.code, maxPlayers: this.maxPlayers, hostId: this.hostId, you: m.id,
      turnTime: this.turnTime, turnLeft: this.turnLeft(now), turnKey: this.turnKey, actorId: this.actorId(), botLevel: this.botLevel,
      emotes: this.emotes, matchWinner: this.matchWinner, target: TARGET,
      players: this.members.map(x => ({
        id: x.id, name: x.name, avatar: x.avatar, bot: x.bot, connected: x.bot || isConnected(x.id),
        inGame: !!seats[x.id], ...(seats[x.id] || {}),
      })),
      game: v,
    };
  }

  static fromJSON(d) {
    const r = Object.assign(Object.create(Room.prototype), d);
    if (d.game) r.game = Object.assign(Object.create(Game.prototype), d.game);
    return r;
  }
}

const api = { Room, newCode, AVATARS, EMOTES };
if (isNode) module.exports = api; else root.UnoRoom = api;
})(typeof window !== 'undefined' ? window : globalThis);
