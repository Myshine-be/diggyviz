// Microphone lifecycle races (review PR #3): double start, stop during the permission prompt,
// external stop. Uses fake getUserMedia / AudioContext so we control when each promise resolves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createListener } from '../js/listen.js';

function fakes() {
  const streams = [], contexts = [], requests = [];
  class Track extends EventTarget { constructor() { super(); this.stopped = false; } stop() { this.stopped = true; } }
  const makeStream = () => { const t = new Track(); const s = { track: t, getTracks: () => [t], getAudioTracks: () => [t] }; streams.push(s); return s; };
  class Ctx extends EventTarget {
    constructor() { super(); this.state = 'running'; this.sampleRate = 48000; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; this.dispatchEvent(new Event('statechange')); return Promise.resolve(); }
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { frequencyBinCount: 1024, getByteFrequencyData(b) { b.fill(0); } }; }
  }
  const media = {
    getUserMedia() {
      let ok, fail; const p = new Promise((a, b) => { ok = a; fail = b; });
      requests.push({ allow: () => ok(makeStream()), deny: () => fail(Object.assign(new Error('no'), { name: 'NotAllowedError' })) });
      return p;
    },
  };
  const changes = [], statuses = [];
  const L = createListener({ media: () => media, AudioCtx: () => Ctx, doc: () => null,
    onChange: (on) => changes.push(on), onStatus: (m, err) => statuses.push([m, !!err]) });
  const leaks = () => ({
    liveTracks: streams.filter(s => !s.track.stopped).length,
    openContexts: contexts.filter(c => c.state !== 'closed').length,
  });
  return { L, requests, streams, contexts, changes, statuses, leaks };
}
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('double start shares one request and leaves no orphan stream', async () => {
  const f = fakes();
  const a = f.L.start(), b = f.L.start();
  assert.equal(a, b, 'second start reuses the pending start');
  assert.equal(f.requests.length, 1);
  f.requests[0].allow(); await tick();
  assert.equal(await a, true);
  assert.equal(f.L.active, true);
  f.L.stop();
  assert.deepEqual(f.leaks(), { liveTracks: 0, openContexts: 0 });
});

test('stop during the permission prompt cancels it; a late "allow" is released', async () => {
  const f = fakes();
  const p = f.L.start();
  assert.equal(f.L.starting, true);
  f.L.stop();
  assert.equal(f.L.starting, false);
  f.requests[0].allow(); await tick();
  assert.equal(await p, false);
  assert.equal(f.L.active, false);
  assert.deepEqual(f.leaks(), { liveTracks: 0, openContexts: 0 });
  assert.deepEqual(f.changes, [], 'never reported as active');
});

test('start, stop, start: only the newest request wins, the old one is cleaned up', async () => {
  const f = fakes();
  const first = f.L.start(); f.L.stop();
  const second = f.L.start();
  assert.equal(f.requests.length, 2);
  f.requests[1].allow(); await tick();
  f.requests[0].allow(); await tick();   // old prompt answered last
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.equal(f.L.active, true);
  assert.deepEqual(f.leaks(), { liveTracks: 1, openContexts: 1 });
  f.L.stop();
  assert.deepEqual(f.leaks(), { liveTracks: 0, openContexts: 0 });
});

test('denied permission reports an error and stays off', async () => {
  const f = fakes();
  const p = f.L.start(); f.requests[0].deny(); await tick();
  assert.equal(await p, false);
  assert.equal(f.L.active, false);
  assert.equal(f.statuses.at(-1)[1], true);
  assert.match(f.statuses.at(-1)[0], /microfoon/);
});

test('microphone ending or the audio context closing turns listening off and notifies', async () => {
  for (const kind of ['track-ended', 'context-closed']) {
    const f = fakes();
    const p = f.L.start(); f.requests[0].allow(); await tick(); await p;
    assert.equal(f.L.active, true);
    if (kind === 'track-ended') f.streams[0].track.dispatchEvent(new Event('ended'));
    else f.contexts[0].close();
    assert.equal(f.L.active, false, kind);
    assert.deepEqual(f.changes, [true, false], kind);
    assert.equal(f.statuses.at(-1)[1], true, kind);
    assert.deepEqual(f.leaks(), { liveTracks: 0, openContexts: 0 }, kind);
  }
});

test('an interrupted audio context (iOS call/Siri) is resumed, not stopped', async () => {
  const f = fakes();
  const p = f.L.start(); f.requests[0].allow(); await tick(); await p;
  const c = f.contexts[0];
  c.state = 'interrupted'; c.dispatchEvent(new Event('statechange'));
  assert.equal(c.state, 'running');
  assert.equal(f.L.active, true);
});

test('synchronous device failure does not leave start permanently pending', async () => {
  let calls=0;
  const L=createListener({media:()=>({getUserMedia(){calls++;throw new Error('device unavailable');}}),AudioCtx:()=>class{},doc:()=>null});
  assert.equal(await L.start(),false); assert.equal(L.starting,false);
  assert.equal(await L.start(),false); assert.equal(calls,2);
});
test('failed resume cannot reuse a frozen microphone frame as live sound', async () => {
  const f=fakes();const p=f.L.start();f.requests[0].allow();await p;
  const c=f.contexts[0];c.resume=()=>Promise.reject(new Error('interrupted'));
  c.state='interrupted';c.dispatchEvent(new Event('statechange'));await tick();
  assert.equal(f.L.active,true);assert.equal(f.L.receiving,false);
  const out={bands:new Float32Array(32),peaks:new Float32Array(32)};
  f.L.analyse(out,1/60);assert.equal(out.kick,0);
  const wave=new Float32Array(128).fill(1);f.L.wave(wave,1/60);assert.ok(wave.every(v=>v===0));
  f.L.stop();assert.deepEqual(f.leaks(),{liveTracks:0,openContexts:0});
});
