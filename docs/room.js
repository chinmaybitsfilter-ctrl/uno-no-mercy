// Room logic — runs inside the HOST's browser (the host phone acts as the game server).
(function (root) {
'use strict';
const E = (typeof module !== 'undefined' && module.exports) ? require('./game.js') : root.UnoEngine;
const { Game, randInt } = E;

const hex = n => Array.from({ length: n }, () => randInt(16).toString(16)).join('');
const cleanName = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 16);
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => A[randInt(A.length)]).join('');
}

class Room {
  constructor(code, maxPlayers) {
    this.code = code;
    this.maxPlayers = Math.max(2, Math.min(10, maxPlayers | 0 || 4));
    this.hostId = null;
    this.members = [];
    this.game = null;
  }

  addMember(rawName) {
    const name = cleanName(rawName);
    if (!name) throw new Error('Enter your name');
    if (this.game && this.game.phase === 'playing') throw new Error('A hand is in progress — join when it ends');
    if (this.members.length >= this.maxPlayers) throw new Error(`Room is full (${this.maxPlayers} players)`);
    if (this.members.some(x => x.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is taken in this room');
    const m = { id: hex(8), token: hex(32), name };
    this.members.push(m);
    if (!this.hostId) this.hostId = m.id;
    return m;
  }
  byToken(t) { return this.members.find(m => m.token === t); }

  // returns list of member ids removed by this action (so the host can drop their connections)
  act(m, a) {
    const g = this.game;
    const isHost = this.hostId === m.id;
    const gp = g && g.byId(m.id);
    const need = () => { if (!gp) throw new Error('You are not in this hand'); };
    switch (a.type) {
      case 'start': {
        if (!isHost) throw new Error('Only the host can start');
        if (g && g.phase === 'playing') throw new Error('Already playing');
        if (this.members.length < 2) throw new Error('Need at least 2 players');
        if (!g) this.game = new Game(this.members.map(x => ({ id: x.id, name: x.name })));
        else {
          g.players = g.players.filter(p => this.members.some(x => x.id === p.id));
          for (const x of this.members) if (!g.byId(x.id)) g.players.push({ id: x.id, name: x.name, hand: [], out: false, left: false, score: 0, unoDeclared: false, unoVulnerable: null, mustPlay: null });
        }
        this.game.startHand();
        return [];
      }
      case 'play': need(); g.play(gp, a); return [];
      case 'draw': need(); g.draw(gp); return [];
      case 'roulette': need(); g.rouletteColor(gp, a.color); return [];
      case 'uno': need(); g.callUno(gp); return [];
      case 'catch': need(); g.catchUno(gp, a.targetId); return [];
      case 'kick': case 'leave': {
        const target = a.type === 'leave' ? m : this.members.find(x => x.id === a.targetId);
        if (!target) throw new Error('No such player');
        if (target.id === this.hostId) throw new Error('The host cannot leave — close the room instead');
        if (a.type === 'kick' && !isHost) throw new Error('Only the host can remove players');
        this.members = this.members.filter(x => x !== target);
        const tp = g && g.byId(target.id);
        if (tp) g.removePlayer(tp, a.type === 'kick' ? 'was removed by the host' : 'left the game');
        return [target.id];
      }
      case 'setMax': {
        if (!isHost) throw new Error('Only the host can change this');
        const n = Math.max(2, Math.min(10, a.maxPlayers | 0));
        if (n < this.members.length) throw new Error('More players already joined');
        this.maxPlayers = n;
        return [];
      }
      default: throw new Error('Unknown action');
    }
  }

  stateFor(m, isConnected) {
    const v = this.game ? this.game.viewFor(m.id) : null;
    const seats = v ? Object.fromEntries(v.seats.map(s => [s.id, s])) : {};
    return {
      code: this.code, maxPlayers: this.maxPlayers, hostId: this.hostId, you: m.id,
      players: this.members.map(x => ({
        id: x.id, name: x.name, connected: isConnected(x.id), inGame: !!seats[x.id], ...(seats[x.id] || {}),
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

const api = { Room, newCode };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.UnoRoom = api;
})(typeof window !== 'undefined' ? window : globalThis);
