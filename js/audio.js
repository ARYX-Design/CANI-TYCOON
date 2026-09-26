// Sound effects and procedural lo-fi background music (Web Audio, no files needed)

const Sound = {
  ctx: null,
  master: null, musicBus: null, sfxBus: null, musicFilter: null,
  musicOn: true,
  sfxOn: true,
  noise: null,
  step: 0,
  nextTime: 0,
  timer: null,
  lastPlayed: {},
  bar: 0,
};

(function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('cani-audio') || '{}');
    if (p.musicOn === false) Sound.musicOn = false;
    if (p.sfxOn === false) Sound.sfxOn = false;
  } catch (e) { /* storage unavailable */ }
})();

function saveAudioPrefs() {
  try { localStorage.setItem('cani-audio', JSON.stringify({ musicOn: Sound.musicOn, sfxOn: Sound.sfxOn })); } catch (e) { /* ignore */ }
}

// Browsers only allow audio after a user gesture, so this runs on the first tap
function unlockAudio() {
  if (Sound.ctx) { if (Sound.ctx.state === 'suspended') Sound.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = Sound.ctx = new AC();
  Sound.master = ctx.createGain(); Sound.master.gain.value = 0.9; Sound.master.connect(ctx.destination);
  Sound.sfxBus = ctx.createGain(); Sound.sfxBus.gain.value = Sound.sfxOn ? 0.8 : 0; Sound.sfxBus.connect(Sound.master);
  Sound.musicFilter = ctx.createBiquadFilter(); Sound.musicFilter.type = 'lowpass'; Sound.musicFilter.frequency.value = 5000;
  Sound.musicBus = ctx.createGain(); Sound.musicBus.gain.value = Sound.musicOn ? 0.5 : 0;
  Sound.musicBus.connect(Sound.musicFilter); Sound.musicFilter.connect(Sound.master);
  const len = ctx.sampleRate;
  Sound.noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = Sound.noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  Sound.nextTime = ctx.currentTime + 0.1;
  Sound.timer = setInterval(scheduleMusic, 25);
}

function setMusic(on) {
  Sound.musicOn = on;
  saveAudioPrefs();
  if (Sound.ctx) Sound.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, Sound.ctx.currentTime, 0.3);
}

function setSfx(on) {
  Sound.sfxOn = on;
  saveAudioPrefs();
  if (Sound.ctx) Sound.sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, Sound.ctx.currentTime, 0.05);
}

// muffle the music while the day summary is up
function musicMuffle(on) {
  if (!Sound.ctx) return;
  Sound.musicFilter.frequency.setTargetAtTime(on ? 700 : 5000, Sound.ctx.currentTime, 0.4);
}

// ---------- building blocks ----------

function tone(freq, start, dur, { type = 'sine', gain = 0.1, attack = 0.005, bus, slideTo, filter } = {}) {
  const ctx = Sound.ctx;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let node = o;
  if (filter) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter;
    o.connect(f); node = f;
  }
  node.connect(g).connect(bus || Sound.sfxBus);
  o.start(start); o.stop(start + dur + 0.05);
}

function noiseHit(start, dur, { gain = 0.1, type = 'highpass', freq = 3000, q = 1, bus, sweepTo } = {}) {
  const ctx = Sound.ctx;
  const src = ctx.createBufferSource();
  src.buffer = Sound.noise;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, start); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(bus || Sound.sfxBus);
  src.start(start, Math.random() * 0.5); src.stop(start + dur + 0.02);
}

// ---------- sound effects ----------

const SFX = {
  door(t) { tone(1318, t, 0.9, { gain: 0.07 }); tone(2636, t, 0.4, { gain: 0.02 }); tone(988, t + 0.22, 1.1, { gain: 0.07 }); tone(1976, t + 0.22, 0.4, { gain: 0.02 }); },
  // scissors: two crisp metallic snips
  snip(t) {
    noiseHit(t, 0.04, { gain: 0.2, type: 'bandpass', freq: 5200, q: 3 });
    tone(4200, t, 0.03, { type: 'triangle', gain: 0.03 });
    noiseHit(t + 0.11, 0.035, { gain: 0.16, type: 'bandpass', freq: 5800, q: 3 });
    tone(4600, t + 0.11, 0.03, { type: 'triangle', gain: 0.025 });
  },
  // clippers: a short buzzing pass
  buzz(t) {
    tone(118, t, 0.5, { type: 'sawtooth', gain: 0.07, filter: 1400, attack: 0.03 });
    tone(236, t, 0.5, { type: 'square', gain: 0.025, filter: 1800, attack: 0.03 });
    noiseHit(t, 0.5, { gain: 0.025, type: 'bandpass', freq: 3000, q: 1 });
  },
  water(t) { noiseHit(t, 0.5, { gain: 0.035, type: 'bandpass', freq: 1400, q: 0.8, sweepTo: 2600 }); },
  // register: drawer "ka-chunk", bell "ching", coins
  cash(t) {
    noiseHit(t, 0.08, { gain: 0.25, type: 'lowpass', freq: 900 });
    tone(160, t, 0.12, { gain: 0.18, slideTo: 90 });
    noiseHit(t + 0.08, 0.06, { gain: 0.2, type: 'bandpass', freq: 2600, q: 2 });
    tone(2093, t + 0.1, 0.7, { gain: 0.12 }); tone(2637, t + 0.16, 0.8, { gain: 0.11 }); tone(3136, t + 0.22, 0.9, { gain: 0.08 });
    [0.34, 0.4, 0.47].forEach((d, i) => tone(1760 + i * 400, t + d, 0.12, { type: 'square', gain: 0.03, filter: 5000 }));
  },
  coin(t) { tone(1760, t, 0.12, { type: 'square', gain: 0.025, filter: 4000 }); tone(2637, t + 0.05, 0.18, { type: 'square', gain: 0.025, filter: 4000 }); },
  select(t) { tone(880, t, 0.07, { type: 'triangle', gain: 0.06 }); },
  go(t) { tone(523, t, 0.1, { type: 'triangle', gain: 0.07 }); tone(784, t + 0.07, 0.16, { type: 'triangle', gain: 0.07 }); },
  error(t) { tone(196, t, 0.09, { type: 'square', gain: 0.04, filter: 900 }); tone(165, t + 0.11, 0.12, { type: 'square', gain: 0.04, filter: 900 }); },
  sweep(t) { noiseHit(t, 0.28, { gain: 0.08, type: 'bandpass', freq: 700, q: 1.2, sweepTo: 3500 }); noiseHit(t + 0.2, 0.22, { gain: 0.06, type: 'bandpass', freq: 3000, q: 1.2, sweepTo: 900 }); },
  angry(t) { tone(330, t, 0.35, { type: 'sawtooth', gain: 0.035, slideTo: 150, filter: 1400 }); },
  done(t) { [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.06, 0.3, { type: 'triangle', gain: 0.045 })); },
  stamp(t) { tone(90, t, 0.18, { gain: 0.2, slideTo: 50 }); noiseHit(t, 0.07, { gain: 0.1, type: 'lowpass', freq: 1200 }); tone(1046, t + 0.12, 0.25, { type: 'triangle', gain: 0.04 }); },
  bill(t) { tone(880, t, 0.15, { type: 'triangle', gain: 0.06 }); tone(660, t + 0.14, 0.25, { type: 'triangle', gain: 0.06 }); },
  power(t) { tone(440, t, 0.8, { type: 'sawtooth', gain: 0.05, slideTo: 40, filter: 1000 }); },
  place(t) { tone(440, t, 0.1, { type: 'triangle', gain: 0.07 }); tone(660, t + 0.05, 0.14, { type: 'triangle', gain: 0.07 }); noiseHit(t, 0.05, { gain: 0.05, type: 'lowpass', freq: 800 }); },
  sell(t) { tone(660, t, 0.1, { type: 'triangle', gain: 0.06 }); tone(440, t + 0.06, 0.14, { type: 'triangle', gain: 0.06 }); },
  hire(t) { [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.08, 0.25, { type: 'triangle', gain: 0.06 })); },
  fanfare(t) { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, t + i * 0.12, 0.35, { type: 'square', gain: 0.035, filter: 3000 })); },
  // sad trombone "wah wah wah waaah" and a slammed door
  walkout(t) {
    [[392, 0, 0.28], [370, 0.3, 0.28], [349, 0.6, 0.28], [330, 0.9, 0.7]].forEach(([f, d, len], i) => {
      tone(f, t + d, len, { type: 'sawtooth', gain: 0.05, filter: 1100, attack: 0.03, slideTo: i === 3 ? 290 : f * 0.97 });
    });
    tone(70, t + 1.55, 0.25, { gain: 0.25, slideTo: 40 });
    noiseHit(t + 1.55, 0.12, { gain: 0.14, type: 'lowpass', freq: 700 });
  },
  bell(t) { tone(2637, t, 0.25, { gain: 0.05 }); tone(3520, t + 0.02, 0.2, { gain: 0.03 }); tone(2637, t + 0.14, 0.35, { gain: 0.05 }); tone(3520, t + 0.16, 0.3, { gain: 0.03 }); },
  click(t) { tone(1200, t, 0.03, { type: 'square', gain: 0.02, filter: 3000 }); },
};

// sfx(name, chance) — chance < 1 thins out ambient sounds; repeats are rate-limited
function sfx(name, volume = 1) {
  if (!Sound.ctx || !Sound.sfxOn || !SFX[name]) return;
  const now = Sound.ctx.currentTime;
  const gap = { snip: 0.1, buzz: 0.3, water: 0.5, coin: 0.04, door: 0.5 }[name] || 0.03;
  if (now - (Sound.lastPlayed[name] || 0) < gap) return;
  Sound.lastPlayed[name] = now;
  if (volume < 1) {
    // quieter ambient version through a temporary gain
    const g = Sound.ctx.createGain(); g.gain.value = volume; g.connect(Sound.sfxBus);
    const saved = Sound.sfxBus; Sound.sfxBus = g;
    try { SFX[name](now); } finally { Sound.sfxBus = saved; }
    return;
  }
  SFX[name](now);
}

// ---------- music: a laid-back jazzy hip-hop loop ----------

const BPM = 86;
const STEP = 60 / BPM / 2;          // eighth notes
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
// ii–V–I–IV in G: Am9, D13, Gmaj9, Cmaj9
const CHORDS = [
  { bass: 45, notes: [57, 60, 64, 67, 71] },
  { bass: 50, notes: [54, 60, 64, 66, 71] },
  { bass: 43, notes: [55, 59, 62, 66, 69] },
  { bass: 48, notes: [52, 55, 59, 62, 64] },
];
const PENTA = [67, 69, 71, 74, 76, 79, 81];
const KICK = [1, 0, 0, 1, 0, 1, 0, 0];
const SNARE = [0, 0, 1, 0, 0, 0, 1, 0];
const BASSLINE = [1, 0, 0, 1, 1, 0, 0, 0];

function scheduleMusic() {
  const ctx = Sound.ctx;
  if (!ctx) return;
  while (Sound.nextTime < ctx.currentTime + 0.15) {
    playStep(Sound.step, Sound.nextTime);
    Sound.nextTime += STEP;
    Sound.step = (Sound.step + 1) % 32;
  }
}

function playStep(step, t) {
  if (!Sound.musicOn) return;
  const bus = Sound.musicBus;
  const s8 = step % 8;
  const chord = CHORDS[Math.floor(step / 8)];
  const swing = s8 % 2 ? STEP * 0.18 : 0;
  const level = Game.state ? Game.state.stage : 0;
  t += swing;

  // drums
  if (KICK[s8]) { tone(110, t, 0.25, { gain: 0.35, slideTo: 42, bus }); }
  if (SNARE[s8]) { noiseHit(t, 0.18, { gain: 0.12, type: 'bandpass', freq: 1800, q: 0.7, bus }); tone(190, t, 0.1, { gain: 0.06, bus }); }
  noiseHit(t, s8 % 2 ? 0.03 : 0.05, { gain: s8 % 2 ? 0.018 : 0.03, freq: 7000, bus });
  if (level >= 2 && s8 % 2) noiseHit(t + STEP / 2, 0.025, { gain: 0.012, freq: 8000, bus });

  // warm electric-piano chord
  if (s8 === 0 || s8 === 5) {
    const g = s8 === 0 ? 0.03 : 0.018;
    chord.notes.forEach((n, i) => {
      tone(midi(n), t + i * 0.012, 1.6, { type: 'triangle', gain: g, attack: 0.02, bus, filter: 1800 });
      tone(midi(n + 12), t + i * 0.012, 0.6, { type: 'sine', gain: g * 0.25, bus });
    });
  }
  // bass
  if (BASSLINE[s8]) tone(midi(chord.bass + (s8 === 4 ? 7 : 0)), t, STEP * 1.8, { type: 'triangle', gain: 0.11, attack: 0.01, bus, filter: 600 });

  // melody grows with the business
  if (level >= 1 && Math.random() < 0.18 + level * 0.05 && s8 !== 7) {
    tone(midi(pick(PENTA)), t, STEP * 1.6, { type: 'sine', gain: 0.03, attack: 0.01, bus });
  }
  // vinyl crackle
  if (Math.random() < 0.3) noiseHit(t + Math.random() * STEP, 0.01, { gain: 0.02, freq: 2000, bus });
}
