import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLRC, lineAt, createLyrics } from '../js/lyrics.js';

test('LRC lines become timed lines, also with several stamps per line', () => {
  const l = parseLRC('[ar:x]\n[00:12.50] Hello world\n[00:15.00][01:02.3] Chorus line\n[00:20.1]\nno stamp');
  assert.deepEqual(l.map((x) => [x.t, x.text]), [[12.5, 'Hello world'], [15, 'Chorus line'], [20.1, ''], [62.3, 'Chorus line']]);
});

test('the current line follows the position', () => {
  const l = parseLRC('[00:01.00]a\n[00:05.00]b\n[00:09.00]c');
  assert.equal(lineAt(l, 0.5), -1); assert.equal(lineAt(l, 1), 0); assert.equal(lineAt(l, 7), 1); assert.equal(lineAt(l, 99), 2);
});

test('fetches with only artist/title/duration, no credentials, and falls back to search', async () => {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('/get?')) return { ok: false };
    return { ok: true, json: async () => [{ duration: 200, syncedLyrics: '[00:01.00]x' }, { duration: 120, syncedLyrics: '[00:02.00]y' }] };
  };
  const L = createLyrics({ fetchFn });
  const tr = { id: 's1', name: 'Song (feat. Z) - Remastered 2011', artists: 'Artist A, Artist B', dur: 199000 };
  assert.deepEqual(L.linesFor(tr), []);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(L.linesFor(tr)[0].text, 'x');
  assert.equal(L.stateFor('s1'), 'ok');
  assert.match(calls[0].url, /artist_name=Artist\+A&track_name=Song&duration=199/);
  assert.equal(calls[0].opts.credentials, 'omit');
  assert.ok(!JSON.stringify(calls).includes('token'));
});

test('no lyrics → state none, and the next ask does not fetch again', async () => {
  let n = 0; const L = createLyrics({ fetchFn: async () => { n++; return { ok: false }; } });
  L.linesFor({ id: 'q', name: 't', artists: 'a' }); await new Promise((r) => setTimeout(r, 10));
  L.linesFor({ id: 'q', name: 't', artists: 'a' });
  assert.equal(L.stateFor('q'), 'none'); assert.equal(n, 2);
});
