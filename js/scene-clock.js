// Narrative time belongs to the selected visual, not to a track's seek position.
// The app only supplies visible, playing, unobscured time. Re-selecting a different
// visual creates a new clock; track changes, BPM changes and resize do not reset it.
export class SceneClock {
  constructor() { this.seconds = 0; this.beats = 0; }
  advance(seconds, bpm = 120, phase) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.seconds += seconds;
    this.beats += seconds * (Number.isFinite(bpm) ? Math.max(50, Math.min(220, bpm)) : 120) / 60;
    // Follow the measured/tapped beat without resetting the story or jumping backwards.
    // Limit corrections to half a beat per second; even at 50 BPM motion stays forward.
    if (Number.isFinite(phase)) {
      let error = phase - (this.beats % 1);
      error -= Math.floor(error + 0.5);
      this.beats += Math.max(-seconds * 0.5, Math.min(seconds * 0.5, error));
    }
  }
}
export function autoDuration(visual, fallback) { return visual?.duration ?? fallback; }
export function switchOnTrack(visual) { return !visual?.story; }
