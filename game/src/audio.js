// Synthesised sound with WebAudio, no files: pistol shots, metal pings, thuds, explosions, reload
// clicks, the mission chime, a police siren that swells as units close in, and a soft bed of
// surf and city hum. At the wheel: an engine whose pitch climbs through the gears with speed and
// throttle, a tyre squeal while sliding, crunches on impact and car doors. Sounds fade and pan with distance from the listener. Starts on first input.

/** Create the audio engine (silent until unlock() is called from a user gesture). */
export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let siren = null;
  let ambience = null;
  let engine = null;
  let muted = false;

  function makeNoise() {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < data.length; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    return buffer;
  }

  function burst(dest, duration, filterType, freq, gain, q = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5, duration + 0.05);
    return filter;
  }

  function tone(dest, type, f0, f1, duration, gain) {
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  function startAmbience() {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    ambience = ctx.createGain();
    ambience.gain.value = 0.05;
    src.connect(filter).connect(ambience).connect(master);
    src.start();
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const sg = ctx.createGain();
    sg.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.45;
    const depth = ctx.createGain();
    depth.gain.value = 320;
    lfo.connect(depth).connect(osc.frequency);
    osc.frequency.value = 980;
    osc.connect(sg).connect(master);
    osc.start();
    lfo.start();
    siren = sg;
    startEngine();
  }

  /** Two detuned saw oscillators through a lowpass (the engine) and band-passed noise (the tyres). */
  function startEngine() {
    const out = ctx.createGain();
    out.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 45;
    const b = ctx.createOscillator();
    b.type = 'square';
    b.frequency.value = 22.5;
    const bg = ctx.createGain();
    bg.gain.value = 0.5;
    a.connect(filter);
    b.connect(bg).connect(filter);
    filter.connect(out).connect(master);
    a.start();
    b.start();
    const tyreSrc = ctx.createBufferSource();
    tyreSrc.buffer = noise;
    tyreSrc.loop = true;
    const tyreFilter = ctx.createBiquadFilter();
    tyreFilter.type = 'bandpass';
    tyreFilter.frequency.value = 2300;
    tyreFilter.Q.value = 6;
    const tyres = ctx.createGain();
    tyres.gain.value = 0;
    tyreSrc.connect(tyreFilter).connect(tyres).connect(master);
    tyreSrc.start();
    engine = { out, filter, a, b, tyres };
  }

  return {
    /** Start the audio context (call from a key or click handler). */
    unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      noise = makeNoise();
      startAmbience();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.6;
      return muted;
    },
    /** Play a world sound heard from (lx, ly). */
    play(kind, x, y, lx, ly, power0) {
      if (!ctx || muted) return;
      const d = Math.hypot(x - lx, y - ly);
      const vol = Math.max(0, 1 - d / 1400);
      if (vol <= 0.01) return;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, (x - lx) / 700));
      const g = ctx.createGain();
      g.gain.value = vol * vol;
      g.connect(pan).connect(master);
      if (kind === 'shot') {
        burst(g, 0.16, 'highpass', 900, 0.9);
        burst(g, 0.28, 'lowpass', 1400, 0.7);
        tone(g, 'sine', 150, 40, 0.16, 0.8);
      } else if (kind === 'ping') {
        tone(g, 'square', 1900, 1200, 0.07, 0.12);
        burst(g, 0.05, 'bandpass', 3000, 0.4, 3);
      } else if (kind === 'thud') {
        tone(g, 'sine', 120, 50, 0.14, 0.5);
      } else if (kind === 'boom') {
        burst(g, 1.4, 'lowpass', 600, 1.2);
        burst(g, 0.5, 'lowpass', 2500, 0.6);
        tone(g, 'sine', 70, 25, 1, 1);
      } else if (kind === 'reload') {
        tone(g, 'square', 700, 500, 0.03, 0.12);
        setTimeout(() => ctx && tone(g, 'square', 900, 600, 0.03, 0.12), 380);
      } else if (kind === 'mission') {
        [523, 659, 784, 1046].forEach((f, k) => setTimeout(() => ctx && tone(master, 'triangle', f, f, 0.35, 0.18), k * 110));
      } else if (kind === 'down') {
        tone(g, 'sawtooth', 300, 60, 0.8, 0.2);
      } else if (kind === 'crash') {
        const power = power0 ?? 0.5;
        burst(g, 0.18 + power * 0.3, 'lowpass', 900 + power * 1600, 0.4 + power * 0.8);
        tone(g, 'sine', 110, 40, 0.2 + power * 0.2, 0.3 + power * 0.6);
        if (power > 0.4) burst(g, 0.25, 'bandpass', 3800, 0.35, 4);
      } else if (kind === 'door') {
        tone(g, 'sine', 180, 70, 0.09, 0.35);
        burst(g, 0.06, 'lowpass', 1200, 0.3);
      }
    },
    /** The player's engine: null on foot, else { speed (0..1 of top speed), throttle (-1..1), slip }. */
    setEngine(state) {
      if (!ctx || !engine) return;
      const t = ctx.currentTime;
      if (!state || muted) {
        engine.out.gain.setTargetAtTime(0, t, 0.08);
        engine.tyres.gain.setTargetAtTime(0, t, 0.05);
        return;
      }
      // Four gears: revs climb within each band and drop back on the shift.
      const v = Math.max(0, Math.min(1, state.speed));
      const gear = Math.min(3, Math.floor(v * 4));
      const inGear = v * 4 - gear;
      const rev = 0.25 + inGear * 0.65 + (gear === 0 ? 0 : 0.12) + Math.max(0, state.throttle) * 0.12;
      const f = 38 + rev * 95 + gear * 6;
      engine.a.frequency.setTargetAtTime(f, t, 0.05);
      engine.b.frequency.setTargetAtTime(f / 2, t, 0.05);
      engine.filter.frequency.setTargetAtTime(380 + rev * 1300 + Math.abs(state.throttle) * 300, t, 0.06);
      engine.out.gain.setTargetAtTime(0.07 + Math.abs(state.throttle) * 0.05 + v * 0.04, t, 0.08);
      const squeal = Math.max(0, Math.min(1, (state.slip - 34) / 160));
      engine.tyres.gain.setTargetAtTime(squeal * 0.09, t, 0.05);
    },
    /** Siren loudness from the nearest pursuing unit; ambience from the time of day. */
    setLevels(sirenDistance) {
      if (!ctx || !siren) return;
      const v = sirenDistance < 1000 ? 0.05 * (1 - sirenDistance / 1000) : 0;
      siren.gain.setTargetAtTime(muted ? 0 : v, ctx.currentTime, 0.2);
    },
  };
}
