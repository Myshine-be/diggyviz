import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFileName, parseID3 } from '../js/id3.js';
import { acquireTabAudio, TAB_MESSAGES } from '../js/tab-audio.js';
import { isAudioFile } from '../js/file-player.js';

// ---- helpers to build ID3 tags ----
const synch = (n) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function frame(id, body, ver) { return [...id].map((c) => c.charCodeAt(0)).concat(ver === 4 ? synch(body.length) : be(body.length), [0, 0], body); }
function tag(frames, ver) { const body = frames.flat(); return new Uint8Array([0x49, 0x44, 0x33, ver, 0, 0, ...synch(body.length), ...body]); }
const utf8 = (s) => [...new TextEncoder().encode(s)];
const utf16bom = (s) => { const out = [0xff, 0xfe]; for (const ch of s) { const c = ch.charCodeAt(0); out.push(c & 255, c >> 8); } return out; };

test('file names become artist and title', () => {
  assert.deepEqual(parseFileName('03 - Daft Punk - One More Time.mp3'), { artists: 'Daft Punk', name: 'One More Time' });
  assert.deepEqual(parseFileName('SadiQ_-_D\'Elmar_Zaya.m4a'), { artists: 'SadiQ', name: "D'Elmar Zaya" });
  assert.deepEqual(parseFileName('voice memo.wav'), { artists: '', name: 'voice memo' });
  assert.deepEqual(parseFileName(''), { artists: '', name: 'Onbekend nummer' });
});

test('ID3v2.3: title, artist (UTF-16) and cover picture', () => {
  const jpeg = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4];
  const apic = [0, ...utf8('image/jpeg'), 0, 3, ...utf8('cover'), 0, ...jpeg];
  const t = tag([frame('TIT2', [3, ...utf8('Papercut')], 3), frame('TPE1', [1, ...utf16bom('Linkin Park'), 0, 0], 3), frame('APIC', apic, 3)], 3);
  const r = parseID3(t);
  assert.equal(r.title, 'Papercut');
  assert.equal(r.artist, 'Linkin Park');
  assert.equal(r.picture.mime, 'image/jpeg');
  assert.deepEqual([...r.picture.bytes], jpeg);
});

test('ID3v2.4 synchsafe frame sizes and UTF-16 picture description', () => {
  const png = [0x89, 0x50, 0x4e, 0x47, 9, 9];
  const apic = [1, ...utf8('image/png'), 0, 3, ...utf16bom('x'), 0, 0, ...png];
  const long = 'A'.repeat(200);    // > 127 bytes: synchsafe and plain sizes differ
  const r = parseID3(tag([frame('TALB', [3, ...utf8(long)], 4), frame('TIT2', [0, ...utf8('Zaya')], 4), frame('APIC', apic, 4)], 4));
  assert.equal(r.album, long);
  assert.equal(r.title, 'Zaya');
  assert.deepEqual([...r.picture.bytes], png);
});

test('missing or broken tags return nothing instead of throwing', () => {
  assert.deepEqual(parseID3(new Uint8Array([1, 2, 3])), {});
  assert.deepEqual(parseID3(new Uint8Array([0x49, 0x44, 0x33, 9, 0, 0, 0, 0, 0, 10])), {});
  const cut = tag([frame('TIT2', [3, ...utf8('Half')], 3)], 3).slice(0, 14);
  assert.doesNotThrow(() => parseID3(cut));
});

test('audio files are recognised by type or extension', () => {
  assert.ok(isAudioFile({ name: 'song.MP3', type: '' }));
  assert.ok(isAudioFile({ name: 'x', type: 'audio/mp4' }));
  assert.ok(!isAudioFile({ name: 'cover.jpg', type: 'image/jpeg' }));
});

function fakeStream(kinds) {
  const tracks = kinds.map((kind) => ({ kind, stopped: false, stop() { this.stopped = true; } }));
  return {
    tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video' && !t.removed),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio' && !t.removed),
    getTracks: () => tracks.filter((t) => !t.removed),
    removeTrack(t) { t.removed = true; },
  };
}

test('tab sound keeps only the audio track and stops the video at once', async () => {
  const s = fakeStream(['video', 'audio']);
  let asked;
  const got = await acquireTabAudio(() => ({ getDisplayMedia: async (c) => { asked = c; return s; } }));
  assert.equal(asked.video, true);
  assert.equal(asked.audio.echoCancellation, false);
  assert.ok(s.tracks[0].stopped && !s.tracks[1].stopped);
  assert.equal(got.getTracks().length, 1);
});

test('sharing a tab without its audio fails with a clear Dutch hint and releases everything', async () => {
  const s = fakeStream(['video']);
  await assert.rejects(acquireTabAudio(() => ({ getDisplayMedia: async () => s })), (e) => e.name === 'NoAudio');
  assert.ok(s.tracks.every((t) => t.stopped));
  assert.match(TAB_MESSAGES.failed({ name: 'NoAudio' }), /Tabblad-audio delen/);
});
