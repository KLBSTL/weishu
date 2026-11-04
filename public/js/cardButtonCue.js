// Settings audition 08: reuse the installed g_ui_pick recording at 89% speed.
const RATE = 48000;
const SPEED = 0.89;
const START = 2352; // 49 ms after slowing the recording
const FRAMES = 7104; // 148 ms

// Third-order Butterworth band-pass (70–2190 Hz at RATE), applied in both directions.
const SECTIONS = [
  [0.002061672691304, 0.004123345382607, 0.002061672691304, -1.695761456957432, 0.765790550474065],
  [1, 0, -1, -1.752603878722106, 0.754923152513724],
  [1, -2, 1, -1.991107280427612, 0.991193345786835],
];

/** @param {BaseAudioContext} ctx @param {AudioBuffer} source */
export function makeCardButtonCue(ctx, source) {
  const step = source.sampleRate / RATE * SPEED;
  const length = Math.min(Math.floor((source.length - 1) / step), RATE);
  if (length < START + FRAMES) return null;
  const pcm = new Float64Array(length);
  for (let channel = 0; channel < source.numberOfChannels; channel++) {
    const samples = source.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const position = i * step;
      const left = Math.floor(position);
      const sample = samples[left] + (samples[left + 1] - samples[left]) * (position - left);
      pcm[i] += sample / source.numberOfChannels;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const [b0, b1, b2, a1, a2] of SECTIONS) {
      let z1 = 0, z2 = 0;
      for (let i = 0; i < length; i++) {
        const input = pcm[i];
        const output = b0 * input + z1;
        z1 = b1 * input - a1 * output + z2;
        z2 = b2 * input - a2 * output;
        pcm[i] = output;
      }
    }
    pcm.reverse();
  }
  const cue = pcm.subarray(START, START + FRAMES);
  const attack = Math.round(RATE * 0.003);
  const release = Math.round(RATE * 0.027);
  let peak = 0, energy = 0, maxEnergy = 0;
  const window = RATE / 50;
  for (let i = 0; i < cue.length; i++) {
    const edge = Math.min(1, i / (attack - 1), (cue.length - 1 - i) / (release - 1));
    cue[i] *= Math.sin(edge * Math.PI / 2) ** 2;
    peak = Math.max(peak, Math.abs(cue[i]));
    energy += cue[i] ** 2;
    if ((i + 1) % window === 0) {
      maxEnergy = Math.max(maxEnergy, energy);
      energy = 0;
    }
  }
  if (!(maxEnergy > 0)) return null;
  const gain = Math.min(0.058 / Math.sqrt(maxEnergy / window), 0.37 / peak);
  const buffer = ctx.createBuffer(1, FRAMES, RATE);
  buffer.copyToChannel(Float32Array.from(cue, sample => sample * gain), 0);
  return buffer;
}
