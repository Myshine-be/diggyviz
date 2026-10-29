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

// ---- 3.0: lyrics layer ----
import { lyricView, GLIDE_SEC } from '../js/lyrics.js';
import { wrapLine } from '../js/lyrics-layer.js';

const L3 = parseLRC('[00:01.00]one\n[00:05.00]two\n[00:09.00]\n[00:12.00]three\n[00:16.00]four');

test('enhanced LRC keeps real word times and strips them from the text; plain LRC has no word timing', () => {
  const l = parseLRC('[00:10.00]<00:10.00>Hello <00:10.60>bright <00:11.20>world');
  assert.equal(l[0].text, 'Hello bright world');
  assert.deepEqual(l[0].words.map((w) => [w.t, w.text]), [[10, 'Hello'], [10.6, 'bright'], [11.2, 'world']]);
  assert.equal(parseLRC('[00:01.00]plain line')[0].words, undefined);
  assert.equal(lyricView(l, 10.7).word, 1);
  assert.equal(lyricView(L3, 6).word, -1);              // never invented
});

test('no synced lines or no known position → nothing is shown', () => {
  assert.equal(lyricView([], 3), null);
  assert.equal(lyricView(L3, 3, false), null);          // Last.fm: position only guessed
  assert.equal(lyricView(L3, NaN), null);
  assert.equal(lyricView(parseLRC('[00:01.00]\n[00:02.00]'), 1.5), null);
});

test('before the first line and in an instrumental gap there is no current line', () => {
  const a = lyricView(L3, 0.5);
  assert.equal(a.cur, -1); assert.equal(L3[a.show[a.at]].text, 'one');
  const g = lyricView(L3, 10);
  assert.equal(g.cur, -1); assert.equal(L3[g.show[g.at]].text, 'three');
  assert.ok(!g.show.some((i) => !L3[i].text));          // empty lines are never drawn
});

test('a normal step to the next line slides softly; the current line then stands still', () => {
  const start = lyricView(L3, 5.0), mid = lyricView(L3, 5 + GLIDE_SEC / 2), done = lyricView(L3, 6.5);
  assert.equal(L3[start.show[start.cur]].text, 'two');
  assert.equal(start.glide, 0); assert.ok(mid.glide > 0 && mid.glide < 1); assert.equal(done.glide, 1);
  assert.equal(done.emph, 1);
});

test('seek, pause and resume: the right line at once, no slide', () => {
  const seek = lyricView(L3, 14.0);                     // jumped into the middle of "three"
  assert.equal(L3[seek.show[seek.cur]].text, 'three'); assert.equal(seek.glide, 1);
  const paused = lyricView(L3, 14.0);                   // paused: the position stands still → same view
  assert.deepEqual(paused, seek);
  const back = lyricView(L3, 2.0);                      // seek backwards
  assert.equal(L3[back.show[back.cur]].text, 'one');
  const afterGap = lyricView(L3, 12.1);                 // first line after a gap: no slide, the highlight eases in
  assert.equal(afterGap.glide, 1); assert.ok(afterGap.emph < 1);
});

test('a track change removes the old text at once and a late answer for the old track is never shown', async () => {
  const pending = {};
  const fetchFn = (url) => new Promise((res) => { pending[new URL(url).searchParams.get('track_name')] = res; });
  const Ly = createLyrics({ fetchFn });
  const A = { id: 'A', name: 'Alpha', artists: 'X', dur: 100000 }, B = { id: 'B', name: 'Beta', artists: 'Y', dur: 100000 };
  Ly.linesFor(A); Ly.linesFor(B);                       // A requested, then the song changes to B
  pending.Alpha({ ok: true, json: async () => ({ syncedLyrics: '[00:01.00]old song' }) });   // A answers late
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(Ly.linesFor(B), []);                 // B shows nothing of A
  pending.Beta({ ok: true, json: async () => ({ syncedLyrics: '[00:01.00]new song' }) });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(Ly.linesFor(B)[0].text, 'new song');
});

test('the request goes only to LRCLIB, without cookies, referrer, auth header or tokens', async () => {
  const calls = [];
  const Ly = createLyrics({ fetchFn: async (url, opts) => { calls.push({ url, opts }); return { ok: false }; } });
  Ly.linesFor({ id: 'spotify:track:abc', name: 'Song', artists: 'Artist', dur: 180000 });
  await new Promise((r) => setTimeout(r, 10));
  for (const c of calls) {
    const u = new URL(c.url);
    assert.equal(u.host, 'lrclib.net');
    assert.deepEqual([...u.searchParams.keys()].sort(), c.url.includes('/get') ? ['artist_name', 'duration', 'track_name'] : ['artist_name', 'track_name']);
    assert.equal(c.opts.credentials, 'omit'); assert.equal(c.opts.referrerPolicy, 'no-referrer');
    assert.deepEqual(Object.keys(c.opts.headers), ['Accept']);
    assert.ok(!/token|bearer|spotify|access/i.test(c.url));
  }
});

test('long lines wrap into two balanced rows', () => {
  const m = (t) => t.length * 10;
  assert.deepEqual(wrapLine('short', m, 200), ['short']);
  assert.deepEqual(wrapLine('aaaa bbbb cccc dddd', m, 120), ['aaaa bbbb', 'cccc dddd']);
});

// ---- 3.0.2: one calm block ----
import { blockLayout, LYRIC_ALPHA, SLOTS, CENTER } from '../js/lyrics-layer.js';

test('the block: sung line marked only by opacity/tint, neighbours soft, nothing else shown', () => {
  const rows = [1, 1, 1, 1, 1];
  const L = blockLayout(rows, { cur: 2, glide: 1, emph: 1 }, 20, 8, 3);
  assert.equal(L.length, SLOTS);
  assert.equal(L[CENTER].a, LYRIC_ALPHA.cur); assert.equal(L[CENTER].y, 0); assert.equal(L[CENTER].tint, 1);
  assert.equal(L[CENTER - 1].a, LYRIC_ALPHA.near); assert.equal(L[CENTER + 1].a, LYRIC_ALPHA.near);
  assert.equal(L[0].a, 0); assert.equal(L[4].a, 0);                       // at most one line before and after
  assert.ok(L[CENTER - 1].y > 0 && L[CENTER + 1].y < 0);                 // past above, next below
  assert.ok(LYRIC_ALPHA.cur <= 0.5 && LYRIC_ALPHA.near <= 0.15);
  const one = blockLayout(rows, { cur: 2, glide: 1, emph: 1 }, 20, 8, 1);
  assert.equal(one[CENTER - 1].a, 0); assert.equal(one[CENTER + 1].a, 0);   // "Eén zin"
});

test('a new line: the block slides up one line and the opacities flow over, without jumps', () => {
  const rows = [1, 2, 1, 1, 1];
  let prev = null;
  for (let g = 0; g <= 1.0001; g += 0.05) {
    const L = blockLayout(rows, { cur: 2, glide: Math.min(1, g), emph: 1 }, 20, 8, 3);
    if (prev) for (let j = 0; j < SLOTS; j++) { assert.ok(Math.abs(L[j].y - prev[j].y) < 6); assert.ok(Math.abs(L[j].a - prev[j].a) < 0.05); }
    prev = L;
  }
  const start = blockLayout(rows, { cur: 2, glide: 0, emph: 1 }, 20, 8, 3);
  assert.equal(start[CENTER - 1].y, 0); assert.equal(start[CENTER - 1].a, LYRIC_ALPHA.cur);   // starts where the old line was
});

test('no current line (gap, before the first line): only quiet text, no marking', () => {
  const L = blockLayout([1, 1, 1, 1, 1], { cur: -1, glide: 1, emph: 0 }, 20, 8, 3);
  assert.ok(L.every((l) => l.tint === 0 && l.a <= LYRIC_ALPHA.none));
});

test('a neighbour that needs more than 3 rows is left out (the visual gets the space)', () => {
  const L = blockLayout([1, 5, 1, 1, 1], { cur: 2, glide: 1, emph: 1 }, 20, 8, 3);
  assert.equal(L[CENTER - 1].a, 0); assert.equal(L[CENTER + 1].a, LYRIC_ALPHA.near);
});
