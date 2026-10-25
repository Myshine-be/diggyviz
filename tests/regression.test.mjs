import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { audio, analyse } from '../js/rhythm.js';
import { createPoller } from '../js/sources/polling.js';
import { CONFIG } from '../js/config.js';
import { createLastfmSource, parseRecent } from '../js/sources/lastfm.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: k => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k),
};
globalThis.location = { origin: 'https://example.test', pathname: '/', href: '' };
globalThis.history = { replaceState() {} };
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
const spotify = await import('../js/sources/spotify.js');
const { store } = await import('../js/store.js');
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const tokenResponse = () => Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 });
const oldSession = () => store.set('tok', { access: 'old-access', refresh: 'old-refresh', exp: Date.now() + 3600000 });
const clock = t => t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
beforeEach(() => { spotify.logout(); storage.clear(); document.visibilityState = 'visible'; });

test('release envelopes match at 30, 60 and 120 Hz', () => {
  const values = [30, 60, 120].map(hz => {
    audio.bands.fill(1); audio.peaks.fill(1);
    for (let n = 0; n < hz / 5; n++) analyse(10000, false, 1, 120, 0, 1 / hz);
    return [audio.bands[0], audio.peaks[0]];
  });
  for (const [band, peak] of values) {
    assert.ok(Math.abs(band - .58) < 1e-5);
    assert.ok(Math.abs(peak - .904) < 1e-5);
  }
});

test('PKCE verifier stays local; matching state is consumed once', async t => {
  let request;
  t.mock.method(globalThis, 'fetch', async (url, init) => { request = init; return tokenResponse(); });
  await spotify.login();
  const url = new URL(location.href), state = url.searchParams.get('state');
  const verifier = store.get('verifier');
  assert.ok(verifier.length >= 43);
  assert.ok(!location.href.includes(verifier));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(await spotify.handleRedirect(new URLSearchParams({ code: 'code', state })), 'ok');
  assert.equal(request.body.get('code_verifier'), verifier);
  assert.equal(store.get('verifier'), null);
  assert.equal(store.get('oauth'), null);
  assert.match(await spotify.handleRedirect(new URLSearchParams({ code: 'code', state })), /^error:/);
  assert.equal(globalThis.fetch.mock.calls.length, 1);
});

test('unsolicited, mismatched and expired callbacks never exchange credentials', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not call'); });
  assert.match(await spotify.handleRedirect(new URLSearchParams({ code: 'x', state: 'web.attacker' })), /^error:/);
  await spotify.login();
  assert.match(await spotify.handleRedirect(new URLSearchParams({ code: 'x', state: 'wrong' })), /^error:/);
  const pending = store.get('oauth');
  store.set('oauth', { ...pending, at: Date.now() - 600001 });
  assert.match(await spotify.handleRedirect(new URLSearchParams({ code: 'x', state: pending.state })), /^error:/);
  assert.equal(globalThis.fetch.mock.calls.length, 0);
});

test('denied authorization consumes the matching pending login', async () => {
  await spotify.login();
  const state = store.get('oauth').state;
  assert.match(await spotify.handleRedirect(new URLSearchParams({ error: 'access_denied', state })), /geweigerd/);
  assert.equal(store.get('oauth'), null);
  assert.equal(store.get('verifier'), null);
});

test('pairing replaces stale custom Client ID with built-in ID', async t => {
  store.set('clientId', 'a'.repeat(32));
  let sentClient;
  t.mock.method(globalThis, 'fetch', async (url, init) => { sentClient = init.body.get('client_id'); return tokenResponse(); });
  await spotify.usePairingCode(btoa(JSON.stringify({ c: CONFIG.SPOTIFY_CLIENT_ID, r: 'pair-refresh' })));
  assert.equal(sentClient, CONFIG.SPOTIFY_CLIENT_ID);
  assert.equal(store.get('clientId'), CONFIG.SPOTIFY_CLIENT_ID);
});

test('malformed and rejected pairing codes preserve the existing session', async t => {
  oldSession(); const before = store.get('tok');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
  await assert.rejects(spotify.usePairingCode(btoa(JSON.stringify({ c: 'bad', r: '' }))));
  assert.equal(globalThis.fetch.mock.calls.length, 0);
  await assert.rejects(spotify.usePairingCode(btoa(JSON.stringify({ c: CONFIG.SPOTIFY_CLIENT_ID, r: 'invalid' }))));
  assert.deepEqual(store.get('tok'), before);
});

test('logout cannot be undone by an outstanding token refresh', async t => {
  clock(t);
  store.set('tok', { refresh: 'old-refresh', exp: 0 });
  const response = deferred();
  t.mock.method(globalThis, 'fetch', () => response.promise);
  const source = spotify.createSpotifySource({ onTrack() {}, onStatus() {} });
  t.after(() => source.stop());
  source.start(); t.mock.timers.tick(0); await settle();
  spotify.logout(); source.stop(); response.resolve(tokenResponse()); await settle();
  assert.equal(store.get('tok'), null);
});

test('late Spotify response cannot emit after stopping the source', async t => {
  clock(t); oldSession();
  const response = deferred(); const tracks = [], statuses = [];
  t.mock.method(globalThis, 'fetch', () => response.promise);
  const source = spotify.createSpotifySource({ onTrack: x => tracks.push(x), onStatus: x => statuses.push(x) });
  source.start(); t.mock.timers.tick(0); await settle(); source.stop();
  response.resolve(Response.json({ item: { id: 'late', name: 'Late', duration_ms: 1000 }, is_playing: true })); await settle();
  t.mock.timers.tick(60000); await settle();
  assert.deepEqual(tracks, []); assert.deepEqual(statuses, []);
  assert.equal(globalThis.fetch.mock.calls.length, 1);
});

test('poller serializes visibility events and respects retry delay', async t => {
  clock(t);
  const response = deferred(); let calls = 0;
  const source = createPoller({ run: () => { calls++; return response.promise; }, onError: assert.fail });
  t.after(() => source.stop()); source.start(); t.mock.timers.tick(0); await settle();
  document.dispatchEvent(new Event('visibilitychange')); t.mock.timers.tick(0); await settle();
  assert.equal(calls, 1);
  response.resolve(10000); await settle();
  document.dispatchEvent(new Event('visibilitychange')); t.mock.timers.tick(9999); await settle();
  assert.equal(calls, 1);
  t.mock.timers.tick(1); await settle(); assert.equal(calls, 2);
});

test('Spotify Retry-After survives background/foreground changes', async t => {
  clock(t); oldSession();
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429, headers: { 'Retry-After': '30' } }));
  const source = spotify.createSpotifySource({ onTrack() {}, onStatus() {} });
  t.after(() => source.stop()); source.start(); t.mock.timers.tick(0); await settle();
  document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(29999); await settle(); assert.equal(globalThis.fetch.mock.calls.length, 1);
  t.mock.timers.tick(1); await settle(); assert.equal(globalThis.fetch.mock.calls.length, 2);
});

test('Last.fm parser accepts single/array now-playing and excludes historical scrobbles', () => {
  const track = { name: 'Song', artist: { '#text': 'Artist' }, '@attr': { nowplaying: 'true' } };
  assert.equal(parseRecent({ recenttracks: { track } }).id, 'Artist::Song');
  assert.equal(parseRecent({ recenttracks: { track: [track] } }).id, 'Artist::Song');
  assert.equal(parseRecent({ recenttracks: { track: [{ ...track, '@attr': {} }] } }), null);
});

test('stopping Last.fm during duration lookup suppresses late updates', async t => {
  clock(t); t.mock.property(CONFIG, 'LASTFM_API_KEY', 'test-key');
  const duration = deferred(); let calls = 0; const tracks = [];
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? Response.json({ recenttracks: { track: [{ name: 'Song', artist: { '#text': 'Artist' }, '@attr': { nowplaying: 'true' } }] } }) : duration.promise);
  const source = createLastfmSource({ user: 'tester', onTrack: x => tracks.push(x), onStatus() {} });
  source.start(); t.mock.timers.tick(0); await settle(); assert.equal(calls, 2); source.stop();
  duration.resolve(Response.json({ track: { duration: 180000 } })); await settle();
  assert.deepEqual(tracks, []);
});
