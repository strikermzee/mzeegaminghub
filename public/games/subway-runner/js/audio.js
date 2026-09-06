/* =========================================================================
   Audio engine — 100% synthesized with the Web Audio API.
   No sound files needed, works fully offline. Music intensifies per stage.
   ========================================================================= */
window.GameAudio = (function () {
  let ctx = null, master, musicBus, sfxBus;
  let schedTimer = null, nextTime = 0, step = 0;
  let bpm = 100, playing = false, muted = false, stage = 1;

  // A-minor pentatonic lead + low roots (MIDI note numbers)
  const SCALE = [57, 60, 62, 64, 67, 69, 72];
  const BASS = [33, 33, 40, 38]; // A, A, E, D (low)
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0.0001 : 0.9; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.0001; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  // one short oscillator note with a quick attack + exponential decay
  function tone(freq, t, dur, type, peak, bus) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // white-noise burst (hats, slide, crash)
  function noise(t, dur, peak, bus) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = peak;
    src.connect(g); g.connect(bus || sfxBus);
    src.start(t); src.stop(t + dur);
  }

  // ---- Sound effects ------------------------------------------------------
  function jump() {
    if (!ctx) return; const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.22);
  }
  function coin() {
    if (!ctx) return; const t = ctx.currentTime;
    tone(mtof(96), t, 0.08, 'square', 0.22, sfxBus);
    tone(mtof(100), t + 0.06, 0.12, 'square', 0.2, sfxBus);
  }
  function slide() {
    if (!ctx) return; const t = ctx.currentTime;
    noise(t, 0.25, 0.16, sfxBus);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.25);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.26);
  }
  function crash() {
    if (!ctx) return; const t = ctx.currentTime;
    noise(t, 0.5, 0.4, sfxBus);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.5);
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.52);
  }
  function stageUp() {
    if (!ctx) return; const t = ctx.currentTime;
    [0, 4, 7, 12].forEach((s, i) => tone(mtof(72 + s), t + i * 0.09, 0.2, 'square', 0.22, sfxBus));
  }
  function button() { if (ctx) tone(mtof(84), ctx.currentTime, 0.1, 'square', 0.18, sfxBus); }

  // ---- Music sequencer (16-step loop, layers grow with stage) -------------
  function playStep(s, t) {
    const spb = 60 / bpm;            // seconds per beat (quarter note)
    const beat = Math.floor(s / 4);

    // bassline on every beat
    if (s % 4 === 0) tone(mtof(BASS[beat % BASS.length]), t, spb * 0.9, 'triangle', 0.5, musicBus);

    // lead arpeggio — denser/brighter at higher stages
    if (s % 2 === 0 || stage >= 2) {
      const note = SCALE[(s + beat * 2) % SCALE.length] + (stage >= 4 ? 12 : 0);
      tone(mtof(note), t, 0.12, 'square', 0.12, musicBus);
    }
    // hi-hats from stage 2
    if (stage >= 2 && s % 2 === 1) noise(t, 0.03, 0.045, musicBus);
    // kick from stage 3
    if (stage >= 3 && s % 4 === 2) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(125, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.4, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.14);
    }
  }
  function scheduler() {
    const sixteenth = 60 / bpm / 4;
    while (nextTime < ctx.currentTime + 0.12) {
      playStep(step, nextTime);
      nextTime += sixteenth;
      step = (step + 1) % 16;
    }
  }
  function startMusic() {
    if (!ctx || playing) return;
    playing = true; step = 0; nextTime = ctx.currentTime + 0.06;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.6);
    schedTimer = setInterval(scheduler, 25);
  }
  function stopMusic() {
    if (!ctx) return;
    playing = false;
    if (schedTimer) clearInterval(schedTimer);
    schedTimer = null;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
  }
  function setStage(s) { stage = s; bpm = 100 + (s - 1) * 8; }   // tempo rises per stage
  function setMuted(m) {
    muted = m;
    if (ctx) master.gain.linearRampToValueAtTime(m ? 0.0001 : 0.9, ctx.currentTime + 0.1);
  }

  return {
    init, resume, jump, coin, slide, crash, stageUp, button,
    startMusic, stopMusic, setStage, setMuted, isMuted: () => muted,
  };
})();
