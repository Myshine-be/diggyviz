// Demo source: plays a loop of made-up tracks so the visuals always have something to show.

import { paletteFromHue } from "../palette.js";

const TRACKS = [
  { id: "demo-1", name: "Nachtrit", artists: "DiggyViz Demo", dur: 48000, hue: 0.36, bpm: 122 },
  { id: "demo-2", name: "Glas", artists: "DiggyViz Demo", dur: 48000, hue: 0.48, bpm: 96 },
  { id: "demo-3", name: "Soul Beat", artists: "DiggyViz Demo", dur: 48000, hue: 0.11, bpm: 118 },
  { id: "demo-4", name: "Chroom", artists: "DiggyViz Demo", dur: 48000, hue: 0.78, bpm: 128 },
];

export function createDemoSource({ onTrack, onStatus }) {
  let timer = 0, idx = 0, started = 0;
  function emit() {
    const t = TRACKS[idx];
    const prog = Date.now() - started;
    if (prog >= t.dur) { idx = (idx + 1) % TRACKS.length; started = Date.now(); return emit(); }
    onTrack({ id: t.id, name: t.name, artists: t.artists, art: "", dur: t.dur, prog, playing: true, palette: paletteFromHue(t.hue), bpm: t.bpm });
  }
  return {
    start() { started = Date.now(); onStatus(""); emit(); timer = setInterval(emit, 1000); },
    stop() { clearInterval(timer); },
  };
}
