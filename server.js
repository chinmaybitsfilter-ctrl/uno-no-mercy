// UNO No Mercy — multiplayer server. Zero dependencies: plain Node http + Server-Sent Events.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Game } = require('./game');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const ROOM_TTL = 12 * 60 * 60 * 1000;
const rooms = new Map();

const rid = (n = 8) => crypto.randomBytes(n).toString('hex');
function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c));
  return c;
}
const cleanName = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 16);

function createRoom(hostName, maxPlayers) {
  const code = newCode();
  const room = { code, maxPlayers, hostId: null, members: [], game: null, clients: new Map(), touched: Date.now() };
  rooms.set(code, room);
  return room;
}
function addMember(room, name) {
  const m = { id: rid(4), token: rid(16), name };
  room.members.push(m);
  if (!room.hostId) room.hostId = m.id;
  return m;
}

function stateFor(room, m) {
  const g = room.game;
  const v = g ? g.viewFor(m.id) : null;
  const seats = v ? Object.fromEntries(v.seats.map(s => [s.id, s])) : {};
  return {
    code: room.code, maxPlayers: room.maxPlayers, hostId: room.hostId, you: m.id,
    players: room.members.map(x => ({
      id: x.id, name: x.name, connected: (room.clients.get(x.id) || new Set()).size > 0,
      inGame: !!seats[x.id], ...(seats[x.id] || {}),
    })),
    game: v,
  };
}
function broadcast(room) {
  room.touched = Date.now();
  for (const m of room.members) {
    const set = room.clients.get(m.id);
    if (!set || !set.size) continue;
    const data = `data: ${JSON.stringify(stateFor(room, m))}\n\n`;
    for (const res of set) res.write(data);
  }
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 10000) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { reject(new Error('bad json')); } });
  });
}
function auth(q) {
  const room = rooms.get(String(q.code || '').toUpperCase());
  if (!room) throw new Error('Room not found');
  const m = room.members.find(x => x.token === q.token);
  if (!m) throw new Error('You are not in this room');
  return { room, m };
}

function act(room, m, a) {
  const g = room.game;
  const isHost = room.hostId === m.id;
  const gp = g && g.byId(m.id);
  switch (a.type) {
    case 'start': {
      if (!isHost) throw new Error('Only the host can start');
      if (g && g.phase === 'playing') throw new Error('Already playing');
      if (room.members.length < 2) throw new Error('Need at least 2 players');
      if (!g) room.game = new Game(room.members.map(x => ({ id: x.id, name: x.name })));
      else for (const x of room.members) if (!g.byId(x.id)) g.players.push({ id: x.id, name: x.name, hand: [], out: false, left: false, score: 0, unoDeclared: false, unoVulnerable: null, mustPlay: null });
      room.game.startHand();
      break;
    }
    case 'play': if (!gp) throw new Error('Not in game'); g.play(gp, a); break;
    case 'draw': if (!gp) throw new Error('Not in game'); g.draw(gp); break;
    case 'roulette': if (!gp) throw new Error('Not in game'); g.rouletteColor(gp, a.color); break;
    case 'uno': if (!gp) throw new Error('Not in game'); g.callUno(gp); break;
    case 'catch': if (!gp) throw new Error('Not in game'); g.catchUno(gp, a.targetId); break;
    case 'kick': case 'leave': {
      const target = a.type === 'leave' ? m : room.members.find(x => x.id === a.targetId);
      if (!target) throw new Error('No such player');
      if (a.type === 'kick' && (!isHost || target === m)) throw new Error('Only the host can remove players');
      room.members = room.members.filter(x => x !== target);
      const tp = g && g.byId(target.id);
      if (tp) {
        g.removePlayer(tp, a.type === 'kick' ? 'was removed by the host' : 'left the game');
        g.players = g.phase === 'playing' ? g.players : g.players.filter(p => p !== tp);
      }
      for (const res of room.clients.get(target.id) || []) { res.write(`event: kicked\ndata: {}\n\n`); res.end(); }
      room.clients.delete(target.id);
      if (room.hostId === target.id) room.hostId = room.members[0] ? room.members[0].id : null;
      if (!room.members.length) { rooms.delete(room.code); return; }
      break;
    }
    case 'setMax': {
      if (!isHost) throw new Error('Only the host can change this');
      const n = Math.max(2, Math.min(10, a.maxPlayers | 0));
      if (n < room.members.length) throw new Error('More players already joined');
      room.maxPlayers = n;
      break;
    }
    default: throw new Error('Unknown action');
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const q = Object.fromEntries(url.searchParams);
  try {
    if (req.method === 'POST' && url.pathname === '/api/create') {
      const b = await readBody(req);
      const name = cleanName(b.name);
      if (!name) throw new Error('Enter your name');
      const room = createRoom(name, Math.max(2, Math.min(10, b.maxPlayers | 0 || 4)));
      const m = addMember(room, name);
      return send(res, 200, { code: room.code, token: m.token });
    }
    if (req.method === 'POST' && url.pathname === '/api/join') {
      const b = await readBody(req);
      const name = cleanName(b.name);
      const room = rooms.get(String(b.code || '').trim().toUpperCase());
      if (!room) throw new Error('Room not found — check the code');
      if (!name) throw new Error('Enter your name');
      if (room.game && room.game.phase === 'playing') throw new Error('A hand is in progress — join when it ends');
      if (room.members.length >= room.maxPlayers) throw new Error(`Room is full (${room.maxPlayers} players)`);
      if (room.members.some(x => x.name.toLowerCase() === name.toLowerCase())) throw new Error('That name is taken in this room');
      const m = addMember(room, name);
      broadcast(room);
      return send(res, 200, { code: room.code, token: m.token });
    }
    if (req.method === 'POST' && url.pathname === '/api/act') {
      const b = await readBody(req);
      const { room, m } = auth(b);
      act(room, m, b);
      if (rooms.has(room.code)) broadcast(room);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const { room, m } = auth(q);
      return send(res, 200, stateFor(room, m));
    }
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      const { room, m } = auth(q);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      if (!room.clients.has(m.id)) room.clients.set(m.id, new Set());
      room.clients.get(m.id).add(res);
      broadcast(room);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => {
        clearInterval(ping);
        const set = room.clients.get(m.id);
        if (set) set.delete(res);
        if (rooms.has(room.code)) broadcast(room);
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true, rooms: rooms.size });
    if (req.method === 'GET') {
      let p = url.pathname === '/' ? '/index.html' : url.pathname;
      const file = path.join(PUB, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(PUB)) return send(res, 403, { error: 'no' });
      return fs.readFile(file, (err, data) => {
        if (err) return fs.readFile(path.join(PUB, 'index.html'), (e2, d2) => {
          res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(d2);
        });
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.touched > ROOM_TTL) rooms.delete(code);
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => console.log(`UNO No Mercy running on http://localhost:${PORT}`));
