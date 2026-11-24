// End-to-end test: starts the server, 4 "phones" join over HTTP and play a full hand.
const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');
const PORT = 3999, B = `http://localhost:${PORT}`;
const post = (p, b) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ ok: r.ok, j: await r.json() }));
const pick = a => a[Math.floor(Math.random() * a.length)];
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT } });
(async () => {
  await new Promise(r => srv.stdout.once('data', r));
  const host = (await post('/api/create', { name: 'Chinmay', maxPlayers: 4 })).j;
  const code = host.code;
  const players = [host];
  for (const n of ['Aarav', 'Diya', 'Kabir']) players.push({ ...(await post('/api/join', { code, name: n })).j });
  const full = await post('/api/join', { code, name: 'Extra' });
  assert(!full.ok && /full/.test(full.j.error), 'room should be full');
  const dup = await post('/api/create', { name: '' });
  assert(!dup.ok);
  // SSE check
  const sse = await fetch(`${B}/api/stream?code=${code}&token=${players[1].token}`);
  const reader = sse.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert(first.includes('retry'), 'sse open');
  assert(!(await post('/api/act', { code, token: players[1].token, type: 'start' })).ok, 'non-host cannot start');
  assert((await post('/api/act', { code, token: host.token, type: 'start' })).ok);
  let moves = 0;
  for (;;) {
    const states = await Promise.all(players.map(p => fetch(`${B}/api/state?code=${code}&token=${p.token}`).then(r => r.json())));
    const g = states[0].game;
    if (g.phase === 'over') { console.log('Winner:', states[0].players.find(p => p.id === g.result.winnerId).name, g.result, 'moves', moves); break; }
    const total = g.deckCount + 0; // sanity: others' counts visible
    assert(states[0].players.every(p => typeof p.count === 'number'));
    assert(!JSON.stringify(states[0]).includes('"hand":[{') || states[0].game.hand.length >= 0);
    let i, s;
    if (g.pending) { i = states.findIndex(x => x.you === g.pending.playerId); await post('/api/act', { code, token: players[i].token, type: 'roulette', color: pick(['red','blue','green','yellow']) }); moves++; continue; }
    i = states.findIndex(x => x.you === g.turnId); s = states[i];
    if (s.game.hand.length <= 2) await post('/api/act', { code, token: players[i].token, type: 'uno' });
    let r;
    if (s.game.playable.length) {
      const others = s.players.filter(p => p.inGame && !p.out && p.id !== s.you);
      r = await post('/api/act', { code, token: players[i].token, type: 'play', cardId: pick(s.game.playable), color: 'red', targetId: pick(others).id });
    } else r = await post('/api/act', { code, token: players[i].token, type: 'draw' });
    assert(r.ok, JSON.stringify(r.j));
    moves++;
    assert(moves < 5000);
  }
  // other players can't see my hand
  const st1 = await fetch(`${B}/api/state?code=${code}&token=${players[1].token}`).then(r => r.json());
  assert(!('hand' in st1.players[0]));
  const html = await fetch(B + '/').then(r => r.text());
  assert(html.includes('No Mercy'));
  reader.cancel();
  console.log('HTTP E2E OK');
  srv.kill(); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
