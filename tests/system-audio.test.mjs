import test from 'node:test';
import assert from 'node:assert/strict';
import { findLoopback, createSystemListener, permissionGranted } from '../js/system-audio.js';

const dev = (label, deviceId = label, kind = 'audioinput') => ({ kind, label, deviceId });
class Ctx extends EventTarget { constructor() { super(); this.state = 'running'; this.sampleRate = 48000; this.baseLatency = 0.01; } createMediaStreamSource() { return { connect() {} }; } createAnalyser() { return { frequencyBinCount: 1024 }; } close() { this.state = 'closed'; return Promise.resolve(); } }
function track(label) { const t = new EventTarget(); t.label = label; t.stop = () => { t.stopped = true; }; return t; }
const stream = (label) => { const t = track(label); return { t, getTracks: () => [t], getAudioTracks: () => [t] }; };

test('finds Windows Stereomix in Dutch and English, VB-Cable and BlackHole; ignores microphones and outputs', () => {
  assert.equal(findLoopback([dev('Microfoonmatrix (Realtek)'), dev('Stereomix (Realtek(R) Audio)', 'sm')])?.deviceId, 'sm');
  assert.equal(findLoopback([dev('Stereo Mix (Realtek High Definition Audio)', 'en')])?.deviceId, 'en');
  assert.equal(findLoopback([dev('Microphone'), dev('CABLE Output (VB-Audio Virtual Cable)', 'vb')])?.deviceId, 'vb');
  assert.equal(findLoopback([dev('BlackHole 2ch', 'bh')])?.deviceId, 'bh');
  assert.equal(findLoopback([dev('Stereomix', 'out', 'audiooutput'), dev('Headset Microphone')]), null);
  assert.equal(findLoopback([dev('Standaard - Stereomix', 'default'), dev('Stereomix', 'communications')])?.deviceId, 'default');
  assert.equal(findLoopback([dev('Standaard - Stereo-mix (Realtek(R) Audio)', 'default'), dev('Microfoonmatrix (Realtek(R) Audio)', 'm'), dev('Stereo-mix (Realtek(R) Audio)', 'sm2')])?.deviceId, 'sm2');
});

test('first start: asks once, finds the loopback by name, remembers it and opens exactly that input', async () => {
  let saved = '', named = false; const asked = [];
  const media = () => ({
    enumerateDevices: async () => named ? [dev('Microfoon', 'mic'), dev('Stereomix (Realtek)', 'sm')] : [dev('', 'mic'), dev('', 'sm')],
    getUserMedia: async (c) => { asked.push(c); named = true; return stream(c.audio?.deviceId ? 'Stereomix (Realtek)' : 'Microfoon'); },
  });
  const L = createSystemListener({ media, AudioCtx: () => Ctx, doc: () => null, getDevice: () => saved, setDevice: (id) => { saved = id; } });
  assert.equal(await L.start(), true);
  assert.equal(saved, 'sm');
  assert.deepEqual(asked.at(-1).audio.deviceId, { exact: 'sm' });
  assert.equal(asked.at(-1).audio.echoCancellation, false);
  assert.equal(L.inputName, 'Stereomix (Realtek)');
  assert.equal(L.latency, 0.01);
  L.stop(); assert.equal(L.inputName, '');
});

test('saved input opens directly without probing; no loopback gives a clear Dutch hint', async () => {
  const asked = []; const msgs = [];
  const media = () => ({ enumerateDevices: async () => [dev('Microfoon', 'mic')], getUserMedia: async (c) => { asked.push(c); return stream('x'); } });
  const L = createSystemListener({ media, AudioCtx: () => Ctx, doc: () => null, getDevice: () => 'cable' });
  assert.equal(await L.start(), true);
  assert.equal(asked.length, 1); assert.deepEqual(asked[0].audio.deviceId, { exact: 'cable' });
  const N = createSystemListener({ media, AudioCtx: () => Ctx, doc: () => null, onStatus: (m) => msgs.push(m) });
  assert.equal(await N.start(), false);
  assert.match(msgs.at(-1), /Stereomix/);
});

test('auto-start only when the permission is already granted', async () => {
  assert.equal(await permissionGranted({ permissions: { query: async () => ({ state: 'granted' }) } }), true);
  assert.equal(await permissionGranted({ permissions: { query: async () => ({ state: 'prompt' }) } }), false);
  assert.equal(await permissionGranted({}), false);
});
