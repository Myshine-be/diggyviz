// Automatic tempo lookup (Deezer) with a fake JSONP transport and an in-memory store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bpmFromTrack, createTempoLookup } from '../js/tempo-lookup.js';

const memStore = () => { const m = new Map(); return { m, get: (k, d) => m.has(k) ? m.get(k) : d, set: (k, v) => m.set(k, v) }; };
const fake = (routes) => { const calls = []; return { calls, fn: async (url) => { calls.push(url); for (const [re, v] of routes) if (re.test(url)) { if (v instanceof Error) throw v; return v; } return { error: { code: 800 } }; } }; };

test('bpm is normalised to 70–190 and 0 means unknown', () => {
  assert.equal(bpmFromTrack({ bpm: 128.04 }), 128);
  assert.equal(bpmFromTrack({ bpm: 63 }), 126);
  assert.equal(bpmFromTrack({ bpm: 260 }), 130);
  assert.equal(bpmFromTrack({ bpm: 0 }), 0);
  assert.equal(bpmFromTrack(null), 0);
});

test('Spotify ISRC is looked up first and the result is cached', async () => {
  const s = memStore(), f = fake([[/track\/isrc:USUM71703861/, { id: 1, bpm: 98.2 }]]);
  const L = createTempoLookup({ store: s, fetchJsonp: f.fn });
  assert.equal(await L.lookup({ id: 'sp1', isrc: 'usum71703861', name: 'x', artists: 'y' }), 98.2);
  assert.equal(L.cached('sp1'), 98.2);
  assert.equal(await L.lookup({ id: 'sp1', isrc: 'usum71703861' }), 98.2);
  assert.equal(f.calls.length, 1, 'second lookup comes from the cache');
});

test('without ISRC or BPM it searches artist + title (Last.fm)', async () => {
  const s = memStore(), f = fake([[/search\?q=/, { data: [{ id: 42 }] }], [/track\/42/, { id: 42, bpm: 174 }]]);
  const L = createTempoLookup({ store: s, fetchJsonp: f.fn });
  assert.equal(await L.lookup({ id: 'lf1', name: 'Song "One"', artists: 'Artist A, Artist B' }), 174);
  assert.match(decodeURIComponent(f.calls[0]), /artist:"Artist A" track:"Song One"/);
});

test('unknown songs are remembered as 0; network errors are not cached', async () => {
  const s = memStore();
  const none = createTempoLookup({ store: s, fetchJsonp: fake([[/search/, { data: [] }]]).fn });
  assert.equal(await none.lookup({ id: 'u1', name: 'a', artists: 'b' }), 0);
  assert.deepEqual(s.get('bpm.u1').bpm, 0);
  const down = createTempoLookup({ store: s, fetchJsonp: fake([[/./, new Error('network')]]).fn });
  assert.equal(await down.lookup({ id: 'u2', name: 'a', artists: 'b', isrc: 'GBAYE0601498' }), 0);
  assert.equal(s.get('bpm.u2'), undefined);
});

test('two lookups for the same song share one request', async () => {
  const s = memStore(), f = fake([[/isrc/, { bpm: 120 }]]);
  const L = createTempoLookup({ store: s, fetchJsonp: f.fn });
  const [a, b] = await Promise.all([L.lookup({ id: 'd', isrc: 'NLA501234567' }), L.lookup({ id: 'd', isrc: 'NLA501234567' })]);
  assert.equal(a, 120); assert.equal(b, 120); assert.equal(f.calls.length, 1);
});

test('API errors are retryable and distinguishable from a genuinely unknown song', async () => {
  const s = memStore(); let calls = 0;
  const L = createTempoLookup({store:s,fetchJsonp:async()=>{calls++;return {error:{code:4,message:'quota'}};}});
  const t={id:'quota',name:'Song',artists:'Artist'};
  await L.lookup(t); assert.equal(L.state(t.id),'unavailable'); assert.equal(s.get('bpm.quota'),undefined);
  await L.lookup(t); assert.equal(calls,2);
});
test('invalid cached tempo is ignored', async () => {
  const s=memStore();s.set('bpm.bad',{bpm:9999,at:Date.now()});
  const L=createTempoLookup({store:s,fetchJsonp:async()=>({data:[]})});
  assert.equal(L.cached('bad'),0);assert.equal(await L.lookup({id:'bad',name:'a',artists:'b'}),0);
  assert.equal(L.state('bad'),'missing');
});
