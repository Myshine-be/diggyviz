import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesktopListener, isDesktop, DESKTOP_MESSAGES } from '../js/desktop-audio.js';

class Ctx extends EventTarget { constructor() { super(); this.state = 'running'; this.sampleRate = 48000; } createMediaStreamSource() { return { connect() {} }; } createAnalyser() { return { frequencyBinCount: 1024 }; } close() { this.state = 'closed'; return Promise.resolve(); } }
function track(kind) { const t = new EventTarget(); t.kind = kind; t.stop = () => { t.stopped = true; }; return t; }
function stream(kinds) { const ts = kinds.map(track); return { ts, getTracks: () => ts.filter((t) => !t.removed), getVideoTracks: () => ts.filter((t) => t.kind === 'video' && !t.removed), getAudioTracks: () => ts.filter((t) => t.kind === 'audio' && !t.removed), removeTrack(t) { t.removed = true; } }; }

test('isDesktop only inside the app (preload sets window.diggyDesktop)', () => {
  assert.equal(isDesktop({}), false);
  assert.equal(isDesktop({ diggyDesktop: { platform: 'win32' } }), true);
});

test('desktop input asks screen + loopback audio, keeps only the sound and stops the picture at once', async () => {
  globalThis.window = { diggyDesktop: { platform: 'win32' } };
  const s = stream(['video', 'audio']); let asked;
  const L = createDesktopListener({ media: () => ({ getDisplayMedia: async (c) => { asked = c; return s; } }), AudioCtx: () => Ctx, doc: () => null });
  assert.equal(L.supported, true);
  assert.equal(await L.start(), true);
  assert.equal(asked.video, true);
  assert.equal(asked.audio.echoCancellation, false);
  assert.equal(s.ts[0].stopped, true);
  assert.equal(s.ts[1].stopped, undefined);
  L.stop(); assert.equal(s.ts[1].stopped, true);
  delete globalThis.window;
});

test('no audio track gives a clear Dutch message; not offered in a normal browser', async () => {
  globalThis.window = { diggyDesktop: {} };
  const msgs = [];
  const L = createDesktopListener({ media: () => ({ getDisplayMedia: async () => stream(['video']) }), AudioCtx: () => Ctx, doc: () => null, onStatus: (m) => msgs.push(m) });
  assert.equal(await L.start(), false);
  assert.match(msgs.at(-1), /Geen systeemgeluid/);
  globalThis.window = {};
  assert.equal(createDesktopListener({ media: () => ({ getDisplayMedia() {} }) }).supported, false);
  delete globalThis.window;
  assert.match(DESKTOP_MESSAGES.failed(new Error('x')), /lukt niet/);
});
