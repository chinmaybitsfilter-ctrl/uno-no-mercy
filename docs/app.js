'use strict';
/* UNO No Mercy — app UI, modes (vs computer / pass n play / online), networking, animations */
const $ = id => document.getElementById(id);
const COLORS = ['red', 'yellow', 'green', 'blue'];
const SITE = 'https://chinmaybitsfilter-ctrl.github.io/uno-no-mercy/';
const SYM = { skip: '⊘', reverse: '⇄', draw2: '+2', draw4: '+4', discardAll: 'ALL', skipAll: '⊘⊘',
  wildRev4: '⇄+4', wild6: '+6', wild10: '+10', roulette: '🎰' };
const LONG = { discardAll: 'DISCARD<br>ALL', skipAll: 'SKIP<br>ALL', roulette: 'COLOR<br>ROULETTE' };
const SEAT_COLORS = ['#e8262f', '#1f6fe5', '#1ea64b', '#f7c51e', '#ff7a00', '#b04dff', '#00bcd4', '#ff4d9d', '#8bc34a', '#a0522d'];
const { AVATARS, EMOTES } = UnoRoom;
const TIMER_OPTS = [[0, 'Off'], [15, '15s'], [30, '30s'], [45, '45s']];
const LEVEL_OPTS = [['easy', 'Easy'], ['hard', 'Hard']];
const isApp = !!window.Capacitor || (location.hostname === 'localhost' && location.protocol === 'https:' && !location.port);
const rand = n => Math.floor(Math.random() * n);

let S = null, session = null, pendingPlay = null;
let net = { conns: new Map() };
let view = { topId: null, actor: null, counts: {}, logKey: null, emoteN: null, overKey: null, viewerShown: null, myTurn: false };
const timer = { key: null, deadline: null, warnT: null };

// ---------------- storage ----------------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const profile = Object.assign({ name: localStorage.getItem('uno_name') || '', avatar: AVATARS[rand(12)], coins: 100, games: 0, wins: 0, streak: 0, bestStreak: 0, best: 0, xp: 0, lastKey: null }, load('uno_profile', {}));
const settings = Object.assign({ sound: true, vibe: true, cpuBots: 3, cpuLevel: 'hard', cpuTimer: 0, passN: 2, passNames: [], roomN: 4, roomTimer: 30 }, load('uno_settings', {}));
const saveProfile = () => save('uno_profile', profile);
const saveSettings = () => save('uno_settings', settings);
const level = () => Math.floor(Math.sqrt(profile.xp / 60)) + 1;

// ---------------- sound ----------------
let actx = null;
function tone(f, d = 0.1, type = 'sine', vol = 0.18, delay = 0, slide = 0) {
  if (!settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
  } catch {}
}
const SFX = {
  play: () => { tone(520, 0.07, 'triangle', 0.2); tone(780, 0.08, 'triangle', 0.14, 0.04); },
  draw: () => tone(300, 0.06, 'square', 0.06, 0, 200),
  turn: () => { tone(660, 0.1, 'sine', 0.2); tone(990, 0.15, 'sine', 0.2, 0.1); },
  uno: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.1, i * 0.07)); },
  catch: () => { tone(200, 0.3, 'sawtooth', 0.15, 0, 90); },
  knock: () => { tone(160, 0.5, 'sawtooth', 0.2, 0, 50); tone(120, 0.5, 'square', 0.1, 0.1, 40); },
  win: () => { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.2, i * 0.11)); },
  lose: () => { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.18, i * 0.16)); },
  emote: () => tone(880, 0.06, 'sine', 0.12, 0, 1200),
  err: () => tone(150, 0.12, 'square', 0.08),
  tick: () => tone(1200, 0.04, 'square', 0.06),
  click: () => tone(700, 0.03, 'triangle', 0.08),
  stack: () => { tone(220, 0.15, 'sawtooth', 0.12, 0, 440); tone(440, 0.15, 'sawtooth', 0.1, 0.1, 880); },
};
const sfx = k => SFX[k] && SFX[k]();
const buzz = ms => { if (settings.vibe && navigator.vibrate) try { navigator.vibrate(ms); } catch {} };

// ---------------- helpers ----------------
function toast(msg, ms = 2400) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function banner(msg) { $('netBanner').textContent = msg || ''; $('netBanner').classList.toggle('hidden', !msg); }
function show(id) { for (const s of ['home', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== id); }
function openM(id) { $(id).classList.remove('hidden'); }
function closeM(id) { $(id).classList.add('hidden'); }
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) { sfx('click'); openM(o.dataset.open); }
  const c = e.target.closest('[data-close]'); if (c) c.closest('.modal').classList.add('hidden');
  if (e.target.classList.contains('modal') && !['colorModal', 'overModal', 'targetModal'].includes(e.target.id)) e.target.classList.add('hidden');
});
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function cardHTML(c, cls = '') {
  const label = c.type === 'number' ? c.value : SYM[c.type];
  const big = c.type === 'number' ? c.value : (LONG[c.type] || SYM[c.type]);
  return `<div class="card ${c.color} ${cls}" data-id="${c.id}"><div class="oval"></div><span class="corner">${label}</span><div class="big${LONG[c.type] ? ' sm' : ''}">${big}</div><span class="corner br">${label}</span></div>`;
}
const backHTML = (cls = '') => `<div class="card back ${cls}"><div class="oval"></div><div class="big">UNO</div></div>`;
const pl = id => (S && S.players.find(p => p.id === id)) || {};
const nameOf = id => pl(id).name || '?';
const seatColor = id => SEAT_COLORS[Math.max(0, S.players.findIndex(p => p.id === id)) % SEAT_COLORS.length];
const avaHTML = (p, extra = '') => `<span class="ava" style="--ring:${p.ring || 'var(--gold)'}${extra}">${esc(p.avatar || '🙂')}</span>`;
function seg(el, opts, cur, onPick) {
  el.innerHTML = opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; sfx('click'); const o = opts.find(x => String(x[0]) === b.dataset.v); onPick(o[0]); seg(el, opts, o[0], onPick); };
}
function stepper(minus, plus, valEl, get, set, lo, hi) {
  const upd = () => { valEl.textContent = get(); };
  minus.onclick = () => { sfx('click'); set(Math.max(lo(), get() - 1)); upd(); };
  plus.onclick = () => { sfx('click'); set(Math.min(hi(), get() + 1)); upd(); };
  upd(); return upd;
}
const inviteLink = () => `${location.hostname.endsWith('github.io') ? location.origin + location.pathname : SITE}?room=${session.code}`;
async function shareInvite() {
  const text = `Join my UNO No Mercy game! 🔥 Room code: ${session.code}`;
  if (navigator.share) { try { await navigator.share({ title: 'UNO No Mercy', text, url: inviteLink() }); return; } catch {} }
  copyInvite();
}
function copyInvite() {
  (navigator.clipboard ? navigator.clipboard.writeText(inviteLink()) : Promise.reject()).then(() => toast('Invite link copied!'), () => prompt('Copy this link', inviteLink()));
}

// ---------------- home / profile ----------------
function refreshHome() {
  $('hAva').textContent = profile.avatar;
  $('hName').textContent = profile.name || 'Set your name';
  $('hLvl').textContent = `LEVEL ${level()}`;
  $('hCoins').textContent = profile.coins.toLocaleString();
  $('setSound').classList.toggle('on', settings.sound);
  $('setVibe').classList.toggle('on', settings.vibe);
  $('sndBtn').textContent = settings.sound ? '🔊' : '🔇';
}
let pickAv = profile.avatar;
function openProfile(then) {
  $('pName').value = profile.name; pickAv = profile.avatar;
  const draw = () => { $('pAvatars').innerHTML = AVATARS.map(a => `<button class="${a === pickAv ? 'on' : ''}" data-a="${a}">${a}</button>`).join(''); };
  draw();
  $('pAvatars').onclick = e => { const b = e.target.closest('[data-a]'); if (b) { pickAv = b.dataset.a; sfx('click'); draw(); } };
  $('pSave').onclick = () => {
    const n = $('pName').value.replace(/[<>]/g, '').trim().slice(0, 14);
    if (!n) { $('pName').focus(); toast('Enter your name'); return; }
    profile.name = n; profile.avatar = pickAv; saveProfile(); localStorage.setItem('uno_name', n);
    closeM('profileModal'); refreshHome(); if (then) then();
  };
  openM('profileModal');
}
const needName = fn => profile.name ? fn() : openProfile(fn);
$('profileBtn').onclick = () => openProfile();
$('setProfile').onclick = () => { closeM('settingsModal'); openProfile(); };
$('setSound').onclick = () => { settings.sound = !settings.sound; saveSettings(); refreshHome(); sfx('click'); };
$('setVibe').onclick = () => { settings.vibe = !settings.vibe; saveSettings(); refreshHome(); buzz(60); };
$('sndBtn').onclick = () => { settings.sound = !settings.sound; saveSettings(); refreshHome(); };
$('statsBtn').onclick = () => {
  const rate = profile.games ? Math.round(profile.wins / profile.games * 100) : 0;
  $('statsGrid').innerHTML = [[profile.games, 'Hands played'], [profile.wins, 'Hands won'], [rate + '%', 'Win rate'], [profile.bestStreak, 'Best streak'],
    [profile.best, 'Best hand score'], [level(), 'Level'], ['🪙 ' + profile.coins.toLocaleString(), 'Coins'], [profile.streak, 'Current streak']]
    .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  openM('statsModal');
};

// setup sheets
stepper($('cMinus'), $('cPlus'), $('cBots'), () => settings.cpuBots, v => { settings.cpuBots = v; saveSettings(); }, () => 1, () => 9);
seg($('cLevel'), LEVEL_OPTS, settings.cpuLevel, v => { settings.cpuLevel = v; saveSettings(); });
seg($('cTimer'), TIMER_OPTS, settings.cpuTimer, v => { settings.cpuTimer = v; saveSettings(); });
seg($('crTimer'), TIMER_OPTS, settings.roomTimer, v => { settings.roomTimer = v; saveSettings(); });
stepper($('crMinus'), $('crPlus'), $('crN'), () => settings.roomN, v => { settings.roomN = v; saveSettings(); }, () => 2, () => 10);
function drawPassNames() {
  const n = settings.passN, rows = [];
  for (let i = 0; i < n; i++) {
    const def = i === 0 ? (profile.name || 'Player 1') : `Player ${i + 1}`;
    rows.push(`<div class="row"><span class="ava" style="--ring:${SEAT_COLORS[i]}">${AVATARS[(AVATARS.indexOf(profile.avatar) + i * 3) % AVATARS.length]}</span><input class="field" maxlength="14" data-i="${i}" value="${esc(settings.passNames[i] || def)}"></div>`);
  }
  $('ppNames').innerHTML = rows.join('');
}
stepper($('ppMinus'), $('ppPlus'), $('ppN'), () => settings.passN, v => { settings.passN = v; saveSettings(); drawPassNames(); }, () => 2, () => 6);
$('joinTile').onclick = () => needName(() => { $('joinErr').textContent = ''; openM('joinModal'); setTimeout(() => $('joinCode').focus(), 50); });
document.querySelector('.t-cpu').addEventListener('click', e => { if (!profile.name) { e.stopPropagation(); closeM('cpuModal'); openProfile(() => openM('cpuModal')); } });
document.querySelector('.t-online').addEventListener('click', e => { if (!profile.name) { e.stopPropagation(); closeM('createModal'); openProfile(() => openM('createModal')); } });
document.querySelector('.t-pass').addEventListener('click', drawPassNames);

// ---------------- modes ----------------
function newSession(mode, code, token) { session = { mode, code, token }; save('uno_session', session); }
$('cStart').onclick = () => {
  closeM('cpuModal');
  const room = new UnoRoom.Room('CPU' + UnoRoom.newCode().slice(0, 2), settings.cpuBots + 1, { turnTime: settings.cpuTimer, botLevel: settings.cpuLevel });
  const me = room.addMember(profile.name || 'You', profile.avatar);
  for (let i = 0; i < settings.cpuBots; i++) room.addBot();
  newSession('cpu', room.code, me.token);
  startLocal(room, true);
};
$('ppStart').onclick = () => {
  const names = [...$('ppNames').querySelectorAll('input')].map(i => i.value.replace(/[<>]/g, '').trim() || `Player ${+i.dataset.i + 1}`);
  const seen = new Set();
  for (let i = 0; i < names.length; i++) { let n = names[i], k = 2; while (seen.has(n.toLowerCase())) n = `${names[i]} ${k++}`; names[i] = n; seen.add(n.toLowerCase()); }
  settings.passNames = names; saveSettings();
  closeM('passModal');
  const room = new UnoRoom.Room('PAS' + UnoRoom.newCode().slice(0, 2), names.length, { turnTime: 0 });
  const avs = [...$('ppNames').querySelectorAll('.ava')].map(a => a.textContent);
  let host = null;
  names.forEach((n, i) => { const m = room.addMember(n, avs[i]); host = host || m; });
  newSession('pass', room.code, host.token);
  startLocal(room, true);
};
$('crStart').onclick = async () => {
  $('crErr').textContent = 'Opening room…';
  if (!(await loadPeer())) { $('crErr').textContent = 'Could not load the network library — check your internet'; return; }
  $('crErr').textContent = '';
  closeM('createModal');
  const room = new UnoRoom.Room(UnoRoom.newCode(), settings.roomN, { turnTime: settings.roomTimer });
  const me = room.addMember(profile.name, profile.avatar);
  newSession('host', room.code, me.token);
  history.replaceState(null, '', `${location.pathname}?room=${room.code}`);
  startHost(room);
};
$('joinBtn').onclick = async () => {
  const code = $('joinCode').value.trim().toUpperCase();
  if (code.length !== 5) { $('joinErr').textContent = 'Enter the 5-letter room code'; return; }
  $('joinErr').textContent = 'Connecting to the host…'; $('joinBtn').disabled = true;
  if (!(await loadPeer())) { $('joinErr').textContent = 'Could not load the network library — check your internet'; $('joinBtn').disabled = false; return; }
  session = { mode: 'guest', code, token: null };
  startGuest();
};

function startLocal(room, fresh) {
  net.room = room;
  resetView();
  if (fresh) { const host = room.byId(room.hostId); room.act(host, { type: 'start' }); }
  pushState();
}
function resetView() {
  view = { topId: null, actor: null, counts: {}, logKey: null, emoteN: null, overKey: null, viewerShown: null, myTurn: false };
  timer.key = null; clearTimeout(timer.warnT);
}

function leaveLocal() {
  if (net.room && session && session.mode !== 'guest') localStorage.removeItem('uno_room_' + session.code);
  clearTimeout(net.retry); clearTimeout(net.joinTimer); clearTimeout(net.botT); clearTimeout(net.timerT); clearTimeout(timer.warnT);
  try { net.peer && net.peer.destroy(); } catch {}
  try { net.wake && net.wake.release(); } catch {}
  net = { conns: new Map() }; S = null; session = null;
  localStorage.removeItem('uno_session');
  history.replaceState(null, '', location.pathname);
  $('joinBtn').disabled = false; banner('');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  $('cover').classList.add('hidden');
  refreshHome(); show('home');
}

// ---------------- actions ----------------
function localViewer() {
  const room = net.room;
  if (session.mode !== 'pass') return room.byToken(session.token);
  const a = room.byId(room.actorId());
  if (a && !a.bot) net.viewer = a.id;
  return room.byId(net.viewer) || room.humans()[0];
}
function act(type, extra = {}) {
  if (!session) return;
  const a = { type, ...extra };
  if (session.mode === 'guest') {
    if (!net.conn || !net.conn.open) return toast('Not connected to the host yet…');
    net.conn.send(JSON.stringify({ t: 'act', ...a }));
    return;
  }
  const room = net.room;
  if (type === 'leave') {
    for (const set of net.conns.values()) for (const c of set) sendTo(c, { t: 'closed' });
    setTimeout(leaveLocal, 200); return;
  }
  const m = ['start', 'addBot', 'settings', 'kick'].includes(type) ? room.byId(room.hostId) : localViewer();
  try { dropMembers(room.act(m, a)); } catch (e) { toast(e.message); sfx('err'); return; }
  pushState();
}

// host + local: broadcast state and drive bots / turn timer
function pushState() {
  const room = net.room; if (!room || !session) return;
  room.syncTimer();
  try { localStorage.setItem('uno_room_' + room.code, JSON.stringify(room)); } catch {}
  const online = id => id === room.hostId || [...(net.conns.get(id) || [])].some(c => c.open);
  if (session.mode === 'host') for (const m of room.members) for (const c of net.conns.get(m.id) || []) sendTo(c, { t: 'state', s: room.stateFor(m, online) });
  const viewer = localViewer();
  if (viewer) { S = room.stateFor(viewer, session.mode === 'host' ? online : () => true); render(); }
  hostTick();
}
function hostTick() {
  clearTimeout(net.botT); clearTimeout(net.timerT);
  const room = net.room, g = room && room.game;
  if (!g || g.phase !== 'playing') return;
  const aid = room.actorId(), m = room.byId(aid);
  if (m && m.bot) {
    const viewer = session.mode !== 'host' && localViewer(), gp = viewer && g.byId(viewer.id);
    const fast = session.mode === 'cpu' && gp && gp.out; // you're knocked out: speed the bots up
    net.botT = setTimeout(() => { try { room.autoMove(aid); } catch (e) { console.error(e); } pushState(); }, fast ? 250 : 850 + rand(750));
  } else if (room.turnTime) {
    net.timerT = setTimeout(() => {
      if (room.actorId() !== aid || room.turnLeft() > 0) return;
      try { room.autoMove(aid); } catch (e) { console.error(e); }
      if (session.mode !== 'guest' && localViewer() && localViewer().id === aid) toast('⏰ Time up — auto-played for you');
      pushState();
    }, room.turnLeft() + 60);
  }
  // computer players catch anyone who forgot to say UNO
  net.catchSeen = net.catchSeen || new Set();
  for (const p of g.players) {
    if (!g.isCatchable(p)) continue;
    const key = `${g.hands}:${p.id}:${p.unoVulnerable}`;
    if (net.catchSeen.has(key)) continue;
    net.catchSeen.add(key);
    const catcher = room.members.find(x => x.bot && x.id !== p.id && g.byId(x.id) && !g.byId(x.id).out);
    if (catcher && Math.random() < (room.botLevel === 'easy' ? 0.35 : 0.8)) {
      setTimeout(() => { try { room.act(catcher, { type: 'catch', targetId: p.id }); pushState(); } catch {} }, 1100 + rand(1300));
    }
  }
}

// ---------------- networking (online: host device = game server) ----------------
function loadPeer() {
  if (window.Peer) return Promise.resolve(true);
  const tryUrl = url => new Promise(res => { const s = document.createElement('script'); s.src = url; s.onload = () => res(!!window.Peer); s.onerror = () => { s.remove(); res(false); }; document.head.appendChild(s); });
  return tryUrl('https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js').then(ok => ok || tryUrl('https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'));
}
const PREFIX = 'uno-nomercy-v1-';
const PEER_OPTS = { debug: 0, config: { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
] } };
const sendTo = (conn, obj) => { try { if (conn.open) conn.send(JSON.stringify(obj)); } catch {} };

function startHost(room) {
  net.room = room;
  resetView();
  const peer = net.peer = new Peer(PREFIX + room.code, PEER_OPTS);
  banner('Opening room…');
  peer.on('open', () => { banner(''); keepAwake(); pushState(); });
  peer.on('connection', conn => {
    conn.on('data', raw => { let d; try { d = JSON.parse(raw); } catch { return; } hostHandle(conn, d); });
    conn.on('close', () => { for (const set of net.conns.values()) set.delete(conn); pushState(); });
    conn.on('error', () => {});
  });
  peer.on('disconnected', () => { banner('Reconnecting…'); setTimeout(() => { try { peer.reconnect(); } catch {} }, 1500); });
  peer.on('error', err => {
    if (net.peer !== peer) return;
    if (err.type === 'unavailable-id') {
      banner('Re-opening room…'); try { peer.destroy(); } catch {}
      net.retry = setTimeout(() => startHost(room), 4000);
    } else if (['network', 'server-error', 'socket-error'].includes(err.type)) {
      banner('Connection problem — retrying…'); net.retry = setTimeout(() => { try { peer.destroy(); } catch {} startHost(room); }, 4000);
    }
  });
  pushState();
}
function hostHandle(conn, d) {
  const room = net.room;
  if (d.t === 'join') {
    let m = d.token && room.byToken(d.token);
    if (!m) { try { m = room.addMember(d.name, d.avatar); } catch (e) { sendTo(conn, { t: 'joinErr', msg: e.message }); return; } sfx('turn'); }
    conn._mid = m.id;
    if (!net.conns.has(m.id)) net.conns.set(m.id, new Set());
    net.conns.get(m.id).add(conn);
    sendTo(conn, { t: 'joined', token: m.token, code: room.code });
    pushState();
  } else if (d.t === 'act') {
    const m = room.members.find(x => x.id === conn._mid);
    if (!m) return sendTo(conn, { t: 'kicked' });
    if (['addBot', 'settings', 'start'].includes(d.type) && m.id !== room.hostId) return sendTo(conn, { t: 'err', msg: 'Only the host can do that' });
    try { dropMembers(room.act(m, d)); } catch (e) { sendTo(conn, { t: 'err', msg: e.message }); return; }
    pushState();
  }
}
function dropMembers(ids) {
  for (const id of ids) {
    for (const c of net.conns.get(id) || []) { sendTo(c, { t: 'kicked' }); setTimeout(() => c.close(), 300); }
    net.conns.delete(id);
  }
}
async function keepAwake() { try { if ('wakeLock' in navigator) net.wake = await navigator.wakeLock.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !session) return;
  if (session.mode === 'host') keepAwake();
  if (session.mode === 'guest' && (!net.conn || !net.conn.open)) guestConnect();
});

function startGuest() {
  const peer = net.peer = new Peer(PEER_OPTS);
  peer.on('open', guestConnect);
  peer.on('disconnected', () => setTimeout(() => { try { peer.reconnect(); } catch {} }, 1500));
  peer.on('error', err => {
    if (err.type === 'peer-unavailable') {
      if (!session.token) failJoin('Room not found. Check the code — and the host must keep the game open.');
      else { banner('Host is offline — waiting for them to come back…'); scheduleRetry(); }
    } else if (['network', 'server-error', 'socket-error'].includes(err.type)) { banner('Connection problem — retrying…'); scheduleRetry(); }
  });
}
function scheduleRetry() { clearTimeout(net.retry); net.retry = setTimeout(guestConnect, 3000); }
function failJoin(msg) {
  clearTimeout(net.joinTimer);
  try { net.peer.destroy(); } catch {}
  net = { conns: new Map() }; session = null;
  localStorage.removeItem('uno_session');
  $('joinErr').textContent = msg; $('joinBtn').disabled = false; banner(''); show('home'); openM('joinModal');
}
function guestConnect() {
  if (!session || !net.peer) return;
  if (net.peer.disconnected) { try { net.peer.reconnect(); } catch {} return; }
  if (!net.peer.open) return;
  try { net.conn && net.conn.close(); } catch {}
  const conn = net.conn = net.peer.connect(PREFIX + session.code, { reliable: true });
  clearTimeout(net.joinTimer);
  net.joinTimer = setTimeout(() => {
    if (conn.open) return;
    if (!session.token) failJoin("Couldn't reach the host. Make sure their game is open, then try again.");
    else { banner('Still trying to reach the host…'); scheduleRetry(); }
  }, 15000);
  conn.on('open', () => sendTo(conn, { t: 'join', name: profile.name, avatar: profile.avatar, token: session.token }));
  conn.on('data', raw => {
    let d; try { d = JSON.parse(raw); } catch { return; }
    if (d.t === 'joined') {
      clearTimeout(net.joinTimer); session.token = d.token; save('uno_session', session);
      history.replaceState(null, '', `${location.pathname}?room=${session.code}`);
      banner(''); $('joinBtn').disabled = false; $('joinErr').textContent = ''; closeM('joinModal');
    } else if (d.t === 'joinErr') failJoin(d.msg);
    else if (d.t === 'state') { S = d.s; render(); }
    else if (d.t === 'err') { toast(d.msg); sfx('err'); }
    else if (d.t === 'kicked') { toast('You were removed from the room'); leaveLocal(); }
    else if (d.t === 'closed') { toast('The host closed the room'); leaveLocal(); }
  });
  conn.on('close', () => { if (session && net.conn === conn) { banner('Lost the host — reconnecting…'); scheduleRetry(); } });
}

// ---------------- lobby ----------------
$('shareBtn').onclick = shareInvite;
$('menuInvite').onclick = copyInvite;
$('waBtn').onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Join my UNO No Mercy game! 🔥 Room code: ${session.code}\n${inviteLink()}`)}`, '_blank');
$('startBtn').onclick = () => { sfx('click'); act('start'); };
$('addBotBtn').onclick = () => { sfx('click'); act('addBot'); };
$('leaveBtn').onclick = () => {
  if (session.mode === 'host' && !confirm('Close the room for everyone?')) return;
  act('leave'); if (session && session.mode === 'guest') setTimeout(leaveLocal, 200);
};
$('lminus').onclick = () => act('settings', { maxPlayers: S.maxPlayers - 1 });
$('lplus').onclick = () => act('settings', { maxPlayers: S.maxPlayers + 1 });
$('lobbyList').onclick = e => { const b = e.target.closest('[data-kick]'); if (b) act('kick', { targetId: b.dataset.kick }); };

function renderLobby() {
  show('lobby');
  const isHost = S.hostId === S.you;
  $('lobbyCode').textContent = S.code;
  $('lobbyTitle').textContent = `Players (${S.players.length}/${S.maxPlayers})`;
  let html = S.players.map((p, i) => `<div class="prow">${avaHTML({ ...p, ring: SEAT_COLORS[i % 10] })}
    <span class="nm">${esc(p.name)}${p.id === S.you ? ' (you)' : ''}</span>
    ${p.id === S.hostId ? '<span class="tag host">HOST</span>' : ''}${p.bot ? '<span class="tag">CPU</span>' : ''}${!p.connected ? '<span class="tag off">offline</span>' : ''}
    ${isHost && p.id !== S.you ? `<button class="x" data-kick="${p.id}">✕</button>` : ''}</div>`).join('');
  for (let i = S.players.length; i < S.maxPlayers; i++) html += `<div class="slot">Waiting for player ${i + 1}…</div>`;
  $('lobbyList').innerHTML = html;
  $('hostCtl').classList.toggle('hidden', !isHost);
  $('addBotBtn').classList.toggle('hidden', !isHost || S.players.length >= S.maxPlayers);
  $('lmax').textContent = S.maxPlayers;
  if (isHost) {
    seg($('lTimer'), TIMER_OPTS, S.turnTime, v => act('settings', { turnTime: v }));
    seg($('lLevel'), LEVEL_OPTS, S.botLevel, v => act('settings', { botLevel: v }));
  }
  $('startBtn').classList.toggle('hidden', !isHost);
  $('startBtn').disabled = S.players.length < 2;
  $('startBtn').textContent = S.players.length < 2 ? 'NEED 2+ PLAYERS' : `START GAME (${S.players.length})`;
  $('lobbyErr').textContent = isHost ? '📌 Keep this screen open — your device is running the game.' : '⏳ Waiting for the host to start…';
}

// ---------------- game render ----------------
function render() {
  if (!S) return;
  const g = S.game;
  if (!g) return renderLobby();
  const wasHidden = $('game').classList.contains('hidden');
  show('game');
  const me = pl(S.you);
  const myTurn = g.phase === 'playing' && S.actorId === S.you;
  const first = view.topId === null;
  const animate = !first && !wasHidden && document.visibilityState === 'visible';

  // where did the newly played card come from? (capture before the DOM changes)
  let flyFrom = null;
  const topChanged = g.top && g.top.id !== view.topId;
  if (topChanged && animate) {
    const hc = document.querySelector(`#hand .card[data-id="${g.top.id}"]`);
    flyFrom = hc ? hc.getBoundingClientRect() : seatRect(view.actor);
  }

  // timer bookkeeping
  if (S.turnKey !== timer.key) {
    timer.key = S.turnKey;
    timer.deadline = S.turnLeft == null ? null : performance.now() + S.turnLeft;
    clearTimeout(timer.warnT);
    if (timer.deadline && S.actorId === S.you && S.turnLeft > 5500) {
      timer.warnT = setTimeout(() => { if (S && S.actorId === S.you) { sfx('tick'); buzz(40); } }, S.turnLeft - 5000);
    }
  }

  // pass n play: hide cards while the device changes hands
  const humans = S.players.filter(p => !p.bot && p.inGame).length;
  const needCover = session && session.mode === 'pass' && humans > 1 && g.phase === 'playing' && view.viewerShown !== S.you;
  if (needCover) {
    $('coverAva').textContent = me.avatar || '🙂';
    $('coverAva').style.setProperty('--ring', seatColor(S.you));
    $('coverTitle').textContent = `Pass to ${me.name}`;
    $('cover').classList.remove('hidden');
  } else $('cover').classList.add('hidden');

  $('gInfo').textContent = session.mode === 'cpu' ? '🤖 VS COMPUTER' : session.mode === 'pass' ? '📱 PASS N PLAY' : `🌐 ROOM ${S.code}`;
  renderSeats(g);

  // center
  $('topWrap').innerHTML = g.top ? cardHTML(g.top, 'lg') + `<div class="halo" style="--hc:var(--${g.color || 'red'})"></div>` : '';
  $('deckCount').textContent = `${g.deckCount} left`;
  $('deckPile').classList.toggle('can', !!g.canDraw && !needCover);
  $('dirRing').classList.toggle('ccw', g.dir !== 1);
  $('stackBanner').classList.toggle('hidden', !g.stack);
  $('stackBanner').textContent = `+${g.stack} STACKED!`;

  let st;
  const actor = pl(S.actorId);
  if (g.phase === 'over') st = 'Hand over';
  else if (g.pending && g.pending.playerId === S.you) st = '🎰 Pick a colour for Color Roulette!';
  else if (g.pending) st = `🎰 ${esc(actor.name)} is picking a colour…`;
  else if (me.out) st = '💀 Knocked out — spectating';
  else if (myTurn && g.stack) st = `Stack +${g.stackMin} or higher — or take ${g.stack}!`;
  else if (myTurn && g.mustPlay != null) st = 'Play the card you drew';
  else if (myTurn) st = '⭐ Your turn!';
  else st = actor.bot ? `${esc(actor.name)} is thinking…` : `${esc(actor.name)}'s turn`;
  $('status').innerHTML = st;
  $('status').classList.toggle('me', myTurn || (g.pending && g.pending.playerId === S.you));
  $('feed').textContent = g.log.length ? g.log[g.log.length - 1].msg : '';

  // my seat
  const myRing = S.actorId === S.you && S.turnTime && timer.deadline ? ringSVG() : '';
  $('mySeat').innerHTML = `<span class="avw" style="position:relative">${avaHTML({ ...me, ring: seatColor(S.you) })}${myRing}</span>
    <span class="tx"><b>${esc(me.name || '')}</b>${me.score != null ? `⭐ ${me.score} pts` : ''}</span>`;
  $('mySeat').dataset.pid = S.you;

  // hand
  const rank = c => (c.color === 'wild' ? 4 : COLORS.indexOf(c.color)) * 100 + (c.type === 'number' ? c.value : 20 + Object.keys(SYM).indexOf(c.type));
  const hand = needCover ? [] : [...g.hand].sort((a, b) => rank(a) - rank(b));
  const playable = new Set(g.playable);
  $('hand').innerHTML = hand.map(c => cardHTML(c, (myTurn ? (playable.has(c.id) ? 'ok' : 'dim') : '') + (g.mustPlay === c.id ? ' must' : ''))).join('');
  layoutHand();
  const n = g.hand.length;
  $('handInfo').innerHTML = me.out || needCover ? '' : `${n} card${n === 1 ? '' : 's'} · knocked out at ${g.mercyLimit}${n >= 18 ? ' · <b>DANGER!</b>' : ''}`;
  $('drawBtn').disabled = !g.canDraw || needCover;
  $('drawBtn').textContent = g.stack && myTurn ? `TAKE +${g.stack}` : 'DRAW';
  $('drawBtn').className = 'btn3d' + (g.stack && myTurn ? ' red' : '');
  $('unoBtn').disabled = me.out || g.phase !== 'playing' || n > 2 || needCover;
  $('unoBtn').classList.toggle('hint', myTurn && n === 2);

  // roulette colour pick
  if (g.pending && g.pending.playerId === S.you && g.phase === 'playing' && !needCover) {
    pendingPlay = { roulette: true };
    $('colorTitle').textContent = '🎰 Color Roulette!';
    $('colorSub').textContent = "Pick a colour. You'll flip cards until it shows up — and keep them all.";
    $('colorCancel').classList.add('hidden');
    openM('colorModal');
  } else if (pendingPlay && pendingPlay.roulette) { pendingPlay = null; closeM('colorModal'); }

  $('logList').innerHTML = [...g.log].reverse().map(l => `<div>${esc(l.msg)}</div>`).join('');

  // ----- effects: sounds, animations, emotes -----
  if (topChanged && animate && flyFrom) flyCard(cardHTML(g.top, 'lg'), flyFrom, $('topWrap').querySelector('.card'));
  if (!first) {
    for (const p of S.players) {
      const before = view.counts[p.id], now = p.count;
      if (before != null && now > before && animate) dealTo(p.id, Math.min(6, now - before));
    }
  }
  const newLogs = newLogEntries(g.log);
  if (!first) {
    if (topChanged) sfx(g.stack ? 'stack' : 'play');
    for (const l of newLogs) {
      if (l.msg.includes('📣')) sfx('uno');
      else if (l.msg.includes('🚨')) sfx('catch');
      else if (l.msg.includes('💀')) { sfx('knock'); buzz([80, 40, 80]); }
      else if (l.msg.includes('drew')) sfx('draw');
    }
    if (myTurn && !view.myTurn) { sfx('turn'); buzz(120); }
  }
  showEmotes(first);
  view.myTurn = myTurn;
  view.topId = g.top ? g.top.id : null;
  view.actor = S.actorId;
  view.counts = Object.fromEntries(S.players.map(p => [p.id, p.count]));

  if (g.phase === 'over' && g.result) {
    const key = `${S.code}:${g.log[0] && g.log[0].t}:${g.result.winnerId}`;
    if (view.overKey !== key) { view.overKey = key; setTimeout(() => showOver(key), first ? 0 : 900); }
  } else closeM('overModal');
}

function ringSVG() {
  const el = Math.max(0, S.turnTime - Math.max(0, (timer.deadline - performance.now()) / 1000));
  return `<svg class="tring" viewBox="0 0 60 60" style="animation-duration:${S.turnTime}s;animation-delay:-${el.toFixed(2)}s"><circle cx="30" cy="30" r="27"/></svg>`;
}
function renderSeats(g) {
  const seats = S.players.filter(p => p.inGame);
  const myIdx = seats.findIndex(p => p.id === S.you);
  const order = myIdx < 0 ? seats : seats.slice(myIdx + 1).concat(seats.slice(0, myIdx));
  const A = $('arena'), W = A.clientWidth, H = A.clientHeight, k = order.length;
  const sz = Math.round((k > 6 ? 42 : k > 4 ? 48 : 56) * (W > 700 && H > 380 ? 1.3 : 1));
  $('seats').innerHTML = order.map((p, i) => {
    const spread = k > 2 ? 0.45 : 0;
    const ang = Math.PI + spread - (i + 1) / (k + 1) * (Math.PI + 2 * spread);
    const x = W / 2 + (W / 2 - 46) * Math.cos(ang);
    const y = H * 0.5 - (H * 0.5 - sz / 2 - 14) * Math.sin(ang);
    const isActor = p.id === S.actorId;
    const ring = isActor && S.turnTime && timer.deadline && !p.bot ? ringSVG() : '';
    const fan = !p.out && !p.left && p.count ? `<span class="fan">${Array.from({ length: Math.min(3, p.count) }, (_, j) => `<i style="transform:rotate(${(j - 1) * 14}deg)"></i>`).join('')}</span>` : '';
    return `<div class="seat ${isActor ? 'turn' : ''} ${p.out || p.left ? 'out' : ''}" data-pid="${p.id}" style="left:${x}px;top:${y}px;--sz:${sz}px">
      <div class="avw">${fan}${avaHTML({ ...p, ring: seatColor(p.id) })}${ring}
        ${p.uno ? '<span class="unotag">UNO!</span>' : ''}${!p.connected && !p.left ? '<span class="off"></span>' : ''}
        <span class="cnt ${p.count >= 18 ? 'hot' : ''}">${p.left ? '—' : p.out ? '💀' : p.count}</span></div>
      <div class="nm">${esc(p.name)}</div>
      ${p.out || p.left ? `<div style="font-size:10px;font-weight:900;color:#ffb3b3">${p.left ? 'LEFT' : 'KNOCKED OUT'}</div>`
        : `<div class="mercy"><i style="width:${Math.min(100, p.count / g.mercyLimit * 100)}%"></i></div>`}
      ${p.catchable && !pl(S.you).out ? `<button class="catch" data-catch="${p.id}">CATCH!</button>` : ''}
    </div>`;
  }).join('');
}
function seatRect(id) {
  const el = id === S.you ? document.querySelector('#mySeat .ava') : document.querySelector(`.seat[data-pid="${id}"] .ava`);
  return el ? el.getBoundingClientRect() : $('deckPile').getBoundingClientRect();
}
function layoutHand() {
  const el = $('hand'), cards = [...el.children], n = cards.length;
  const W = Math.min(980, el.parentElement.clientWidth - 28);
  const cs = getComputedStyle(document.documentElement);
  const cw = parseFloat(cs.getPropertyValue('--cw')) || 58, ch = parseFloat(cs.getPropertyValue('--ch')) || 86;
  const minStep = Math.max(24, cw * 0.42);
  const maxPer = Math.max(1, Math.floor((W - cw) / minStep) + 1);
  const rows = Math.max(1, Math.ceil(n / maxPer)), per = Math.ceil(n / rows) || 1;
  const step = per > 1 ? Math.min(cw + 6, (W - cw) / (per - 1)) : 0;
  const rowH = ch * 0.52;
  el.style.width = W + 'px';
  el.style.height = (ch + (rows - 1) * rowH + (rows === 1 ? 22 : 10)) + 'px';
  cards.forEach((c, i) => {
    const r = Math.floor(i / per), j = i % per;
    const cnt = r === rows - 1 ? n - per * (rows - 1) : per;
    const left = (W - (cw + step * (cnt - 1))) / 2 + j * step;
    let rot = 0, dy = 0;
    if (rows === 1 && cnt > 1) { const t = (j - (cnt - 1) / 2) / ((cnt - 1) / 2); rot = t * Math.min(8, cnt * 1.2); dy = t * t * Math.min(10, cnt * 1.4); }
    const lift = c.classList.contains('ok') ? -14 : 0;
    c.style.left = left + 'px'; c.style.top = (8 + r * rowH) + 'px'; c.style.zIndex = i + 1;
    c.style.transform = `translateY(${dy + lift}px) rotate(${rot}deg)`;
  });
}
window.addEventListener('resize', () => { if (S && S.game) render(); });

// ----- animations -----
function flyCard(html, from, toEl) {
  if (!toEl) return;
  const to = toEl.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'flyer'; f.innerHTML = html;
  document.body.appendChild(f);
  toEl.style.opacity = '0';
  const sx = (from.left + from.width / 2) - to.width / 2, sy = (from.top + from.height / 2) - to.height / 2;
  const sc = Math.max(0.4, Math.min(1, from.width / to.width));
  const a = f.animate([
    { transform: `translate(${sx}px,${sy}px) scale(${sc}) rotate(-25deg)` },
    { transform: `translate(${to.left}px,${to.top}px) scale(1) rotate(0deg)` },
  ], { duration: 380, easing: 'cubic-bezier(.2,.8,.25,1)' });
  a.onfinish = () => { f.remove(); toEl.style.opacity = ''; };
}
function dealTo(pid, n) {
  const from = $('deckPile').getBoundingClientRect();
  const to = pid === S.you ? $('hand').getBoundingClientRect() : seatRect(pid);
  for (let i = 0; i < n; i++) {
    const f = document.createElement('div');
    f.className = 'flyer'; f.innerHTML = backHTML('lg');
    f.style.opacity = '0';
    document.body.appendChild(f);
    const tx = to.left + to.width / 2 - 36, ty = to.top + to.height / 2 - 53;
    const a = f.animate([
      { opacity: 1, transform: `translate(${from.left}px,${from.top}px) scale(1)` },
      { opacity: 1, transform: `translate(${tx}px,${ty}px) scale(.45) rotate(${pid === S.you ? 0 : 20}deg)` },
    ], { duration: 420, delay: i * 70, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
    a.onfinish = () => f.remove();
  }
}
function newLogEntries(log) {
  const keyOf = l => l && `${l.t}|${l.msg}`;
  const last = keyOf(log[log.length - 1]);
  let out = [];
  if (view.logKey && last !== view.logKey) {
    const i = log.findIndex(l => keyOf(l) === view.logKey);
    out = i >= 0 ? log.slice(i + 1) : log.slice(-3);
  }
  view.logKey = last;
  return out;
}
function showEmotes(first) {
  const list = S.emotes || [];
  const maxN = list.length ? list[list.length - 1].n : 0;
  if (view.emoteN === null || first) { view.emoteN = maxN; return; }
  for (const e of list) {
    if (e.n <= view.emoteN) continue;
    const r = seatRect(e.from);
    const b = document.createElement('div');
    const isEmoji = [...e.e].length <= 2;
    b.className = 'bubble' + (isEmoji ? ' big' : '');
    b.textContent = e.e;
    const wrap = document.createElement('div');
    wrap.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top}px;z-index:95;pointer-events:none`;
    wrap.appendChild(b); document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 2700);
    sfx('emote');
  }
  view.emoteN = maxN;
}
function confetti() {
  const cols = ['#e8262f', '#f7c51e', '#1ea64b', '#1f6fe5', '#fff', '#ff4d9d'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = cols[i % cols.length];
    c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
    c.style.animationDelay = Math.random() * 0.6 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4500);
  }
}

// ----- hand over -----
function showOver(key) {
  if (!S || !S.game || !S.game.result) return;
  const g = S.game, r = g.result;
  const local = session.mode !== 'guest';
  const isHost = S.hostId === S.you || local;
  const iWon = r.winnerId === S.you;
  const w = pl(r.winnerId);
  const champ = S.matchWinner;
  $('overHd').textContent = champ ? '🏆 MATCH OVER' : 'HAND OVER';
  $('winBox').innerHTML = r.winnerId ? `<div class="crown">👑</div>${avaHTML({ ...w, ring: 'var(--gold)' })}
    <h2>${session.mode === 'pass' ? esc(w.name) + ' wins!' : iWon ? 'YOU WIN!' : esc(w.name) + ' wins'}</h2>
    <p>${r.how ? r.how[0].toUpperCase() + r.how.slice(1) : ''} · +${r.points} points</p>` : '<h2>No winner</h2>';
  const ranked = S.players.filter(p => p.inGame).sort((a, b) =>
    (b.id === r.winnerId) - (a.id === r.winnerId) || (a.out || a.left) - (b.out || b.left) || a.count - b.count);
  $('ranks').innerHTML = ranked.map((p, i) => `<div class="rank ${p.id === S.you && session.mode !== 'pass' ? 'me' : ''}"><span class="pos">${i + 1}</span>${avaHTML({ ...p, ring: seatColor(p.id) })}
    <span class="sp">${esc(p.name)}<br><small style="color:var(--dim)">${p.left ? 'left' : p.out ? '💀 knocked out' : p.id === r.winnerId ? 'winner' : p.count + ' cards left'}</small></span><b>${p.score}</b></div>`).join('');
  $('matchNote').textContent = champ ? `🏆 ${nameOf(champ)} reached ${S.target} points and wins the match!` : `First to ${S.target.toLocaleString()} points wins the match`;

  // stats & coins (once per hand, not in pass n play)
  $('coinsGot').classList.add('hidden');
  if (session.mode !== 'pass' && profile.lastKey !== key && pl(S.you).inGame) {
    profile.lastKey = key; profile.games++;
    let got;
    if (iWon) { profile.wins++; profile.streak++; profile.bestStreak = Math.max(profile.bestStreak, profile.streak); profile.best = Math.max(profile.best, r.points); got = 20 + Math.round(r.points / 10); profile.xp += 40; }
    else { profile.streak = 0; got = 5; profile.xp += 12; }
    if (champ === S.you) got += 100;
    profile.coins += got; saveProfile();
    $('coinsGot').textContent = `+${got} 🪙`; $('coinsGot').classList.remove('hidden');
  }
  if (iWon || session.mode === 'pass') { sfx('win'); confetti(); } else sfx('lose');
  $('againBtn').textContent = champ ? 'NEW MATCH' : 'NEXT HAND';
  $('againBtn').classList.toggle('hidden', !isHost);
  $('againWait').classList.toggle('hidden', isHost);
  openM('overModal');
}
$('againBtn').onclick = () => { closeM('overModal'); act('start'); };
$('homeBtn2').onclick = () => {
  if (session && session.mode === 'host' && !confirm('Leaving closes the room for everyone. Leave?')) return;
  act('leave'); if (session && session.mode === 'guest') setTimeout(leaveLocal, 200);
};

// ---------------- in-game input ----------------
$('coverBtn').onclick = () => { view.viewerShown = S.you; sfx('click'); render(); };
$('seats').onclick = e => { const b = e.target.closest('[data-catch]'); if (b) act('catch', { targetId: b.dataset.catch }); };
$('drawBtn').onclick = () => act('draw');
$('deckPile').onclick = () => { if (S && S.game && S.game.canDraw) act('draw'); };
$('unoBtn').onclick = () => act('uno');
$('emoBtn').onclick = () => {
  const emo = EMOTES.map((e, i) => [e, i]);
  $('emoGrid').innerHTML = emo.filter(([e]) => [...e].length <= 2).map(([e, i]) => `<button data-e="${i}">${e}</button>`).join('');
  $('phraseGrid').innerHTML = emo.filter(([e]) => [...e].length > 2).map(([e, i]) => `<button data-e="${i}">${esc(e)}</button>`).join('');
  openM('emoModal');
};
$('emoModal').addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (b) { closeM('emoModal'); act('emote', { e: +b.dataset.e }); } });
$('menuBtn').onclick = () => {
  const online = session.mode === 'host' || session.mode === 'guest';
  const isHost = S.hostId === S.you && session.mode === 'host';
  $('menuInvite').classList.toggle('hidden', !online);
  $('kickBox').innerHTML = isHost ? S.players.filter(p => p.id !== S.you).map(p =>
    `<button data-kick="${p.id}">${avaHTML({ ...p, ring: seatColor(p.id) })}<span class="sp">Remove ${esc(p.name)}</span><span>${p.connected ? '🟢' : '⚫'}</span></button>`).join('') : '';
  $('menuLeave').textContent = session.mode === 'host' ? 'Close room' : online ? 'Leave game' : 'Exit to home';
  openM('menuModal');
};
$('kickBox').onclick = e => {
  const b = e.target.closest('[data-kick]'); if (!b) return;
  if (confirm(`Remove ${nameOf(b.dataset.kick)}?`)) { act('kick', { targetId: b.dataset.kick }); closeM('menuModal'); }
};
$('menuLeave').onclick = () => {
  const msg = session.mode === 'host' ? 'You are the host — leaving ends the game for everyone. Leave?' : session.mode === 'guest' ? 'Leave this game?' : 'Exit this game?';
  if (!confirm(msg)) return;
  act('leave'); if (session && session.mode === 'guest') setTimeout(leaveLocal, 200);
};

$('hand').onclick = e => {
  const el = e.target.closest('.card'); if (!el || !S) return;
  const g = S.game, id = +el.dataset.id;
  if (S.actorId !== S.you || g.pending) { sfx('err'); return toast('Wait for your turn'); }
  if (!g.playable.includes(id)) { sfx('err'); el.animate([{ translate: '0' }, { translate: '-6px' }, { translate: '6px' }, { translate: '0' }], { duration: 220 }); return toast(g.stack ? `Only +${g.stackMin} or higher can stack — or take the cards` : g.mustPlay != null ? 'Play the card you drew' : "That card doesn't match"); }
  const c = g.hand.find(x => x.id === id);
  pendingPlay = { cardId: id };
  if (c.type === 'number' && c.value === 7 && g.hand.length > 1) return pickTarget();
  if (c.color === 'wild' && c.type !== 'roulette') return pickColor(c);
  sendPlay();
};
function pickColor(c) {
  $('colorTitle').textContent = 'Choose a colour';
  $('colorSub').textContent = { wildRev4: 'Wild Reverse +4', wild6: 'Wild +6', wild10: 'Wild +10' }[c.type] || '';
  $('colorCancel').classList.remove('hidden');
  openM('colorModal');
}
function pickTarget() {
  const others = S.players.filter(p => p.inGame && !p.out && !p.left && p.id !== S.you);
  $('targets').innerHTML = others.map(p => `<button data-t="${p.id}">${avaHTML({ ...p, ring: seatColor(p.id) })}<span class="sp">${esc(p.name)}</span><span>${p.count} cards</span></button>`).join('');
  openM('targetModal');
}
$('targets').onclick = e => {
  const b = e.target.closest('[data-t]'); if (!b || !pendingPlay) return;
  pendingPlay.targetId = b.dataset.t; closeM('targetModal'); sendPlay();
};
document.querySelector('#colorModal .colors').onclick = e => {
  const b = e.target.closest('[data-c]'); if (!b || !pendingPlay) return;
  closeM('colorModal');
  if (pendingPlay.roulette) { pendingPlay = null; act('roulette', { color: b.dataset.c }); }
  else { pendingPlay.color = b.dataset.c; sendPlay(); }
};
$('colorCancel').onclick = () => { pendingPlay = null; closeM('colorModal'); };
function sendPlay() { const p = pendingPlay; pendingPlay = null; act('play', p); }

// ---------------- install (PWA) ----------------
let deferredInstall = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; $('installBtn').classList.remove('hidden'); });
$('installBtn').onclick = async () => {
  if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; $('installBtn').classList.add('hidden'); }
  else openM('iosModal');
};
if (!standalone && !isApp && /iphone|ipad|ipod/i.test(navigator.userAgent)) $('installBtn').classList.remove('hidden');
if (!standalone && !isApp && /android/i.test(navigator.userAgent)) $('apkBtn').classList.remove('hidden');
if ('serviceWorker' in navigator && window.isSecureContext && !isApp) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------------- start-up / resume ----------------
refreshHome();
(async function boot() {
  const params = new URLSearchParams(location.search);
  const want = (params.get('room') || '').toUpperCase();
  const s = load('uno_session', null);
  if (s && s.code && (!want || want === s.code)) {
    try {
      if (s.mode === 'guest' && s.token) {
        session = s; banner('Reconnecting…');
        if (await loadPeer()) startGuest(); else banner('Offline — waiting for internet…');
        return;
      }
      const saved = localStorage.getItem('uno_room_' + s.code);
      if (saved) {
        const room = UnoRoom.Room.fromJSON(JSON.parse(saved));
        session = s;
        if (s.mode === 'host') { if (await loadPeer()) return startHost(room); session = null; }
        else return startLocal(room, false);
      }
    } catch (e) { console.error(e); }
    localStorage.removeItem('uno_session'); session = null;
  }
  if (want) needName(() => { $('joinCode').value = want; $('joinErr').textContent = ''; openM('joinModal'); });
  else if (!profile.name) openProfile();
})();
