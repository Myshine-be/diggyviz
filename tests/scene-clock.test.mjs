import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneClock, autoDuration, switchOnTrack } from '../js/scene-clock.js';
import nightdrive from '../js/visuals/night-drive.js';
import bloop from '../js/visuals/bloop.js';

test('90 seconds is elapsed playback time, independently of display refresh',()=>{
  for (const hz of [30,60,120]) {
    const c=new SceneClock();
    for(let i=0;i<90*hz;i++)c.advance(1/hz,120);
    assert.ok(Math.abs(c.seconds-90)<1e-8);
    assert.ok(Math.abs(c.beats-180)<1e-8);
  }
});
test('pause/hidden time does not advance story or beat; tempo changes are continuous',()=>{
  const c=new SceneClock();c.advance(45,120);
  c.advance(0,90);c.advance(NaN,90);c.advance(-1,90);
  assert.equal(c.seconds,45);assert.equal(c.beats,90);
  c.advance(45,90);assert.equal(c.seconds,90);assert.equal(c.beats,157.5);
});
test('story survives track changes and gets enough time for its 90-second reward',()=>{
  for(const v of [nightdrive,bloop]) {
    assert.equal(switchOnTrack(v),false);
    assert.equal(autoDuration(v,45),120);
    assert.ok(autoDuration(v,45)>105);
  }
  assert.equal(switchOnTrack({id:'urchin'}),true);
  assert.equal(autoDuration({id:'urchin'},45),45);
});

test('story beat gently converges to measured phase without reversing or changing elapsed time', () => {
  for (const hz of [30, 60, 120]) {
    const c = new SceneClock(); let before = 0;
    for (let i = 1; i <= hz * 4; i++) {
      c.advance(1 / hz, 120, (i * 2 / hz + 0.37) % 1);
      assert.ok(c.beats > before); before = c.beats;
    }
    assert.ok(Math.abs(c.beats - 8.37) < 1e-8);
    assert.ok(Math.abs(c.seconds - 4) < 1e-8);
    c.advance(0, 120, 0.9); assert.equal(c.beats, before);
  }
});
