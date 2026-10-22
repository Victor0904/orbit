// Audio 100 % synthétisé (DESIGN §11) : « carillon céleste ». Contexte créé/repris au premier geste.
// master → compresseur (−14 dB, ratio 4) → destination ; bus sfx / musique ; réverbération courte (convolution générée).
const SCALES = { // tonique MIDI, mode, progression (degrés 1-based), timbre du lead
  atlas: { root: 62, mode: [0, 2, 4, 6, 7, 9, 11], prog: [1, 2, 6, 1], lead: 'fm' },
  vesta: { root: 64, mode: [0, 2, 3, 5, 7, 9, 10], prog: [1, 4, 1, 7], lead: 'tri' },
  kepler: { root: 57, mode: [0, 2, 4, 5, 7, 9, 10], prog: [1, 7, 4, 1], lead: 'sq' },
  selene: { root: 66, mode: [0, 2, 3, 5, 7, 8, 10], prog: [1, 6, 3, 7], lead: 'det' },
  nyx: { root: 60, mode: [0, 1, 3, 5, 7, 8, 10], prog: [1, 2, 1, 7], lead: 'saw' },
  zenith: { root: 59, mode: [0, 2, 4, 6, 7, 9, 11], prog: [1, 2, 3, 2], lead: 'fm8' },
};
const mtof = n => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null; this.enabled = false; this.sfxVol = 0.8; this.musicVol = 0.6;
    this.voices = 0; this.MAX_VOICES = 28; this.last = Object.create(null); this.telN = 0; this.rayN = 0;
    this.state = 'off'; this.core = 'atlas'; this.palier = 1; this.sur = false; this.bpm = 90; this.pendingBpm = 0;
    this.step16 = 0; this.nextTime = 0; this.timer = null; this.seed = 1;
  }
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        const c = this.ctx = new AC();
        this.master = c.createGain(); this.master.gain.value = 0.9;
        const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
        this.master.connect(comp); comp.connect(c.destination);
        // réverbération : bruit décroissant 1,2 s, mix 18 %
        const len = Math.floor(c.sampleRate * 1.2), ir = c.createBuffer(2, len, c.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let s = 777 + ch; for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = ((s / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / len, 3); } }
        this.verb = c.createConvolver(); this.verb.buffer = ir; const wet = c.createGain(); wet.gain.value = 0.18; this.verb.connect(wet); wet.connect(this.master);
        this.sfx = c.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master); this.sfx.connect(this.verb);
        this.music = c.createGain(); this.music.gain.value = this.musicVol; this.music.connect(this.master); this.music.connect(this.verb);
        this.mFilter = c.createBiquadFilter(); this.mFilter.type = 'lowpass'; this.mFilter.frequency.value = 18000; this.mFilter.connect(this.music);
        this.mBus = c.createGain(); this.mBus.gain.value = 1; this.mBus.connect(this.mFilter);
        const nl = c.sampleRate; this.noise = c.createBuffer(1, nl, c.sampleRate);
        const nd = this.noise.getChannelData(0); let s = 12345; for (let i = 0; i < nl; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; nd[i] = (s / 0x7fffffff) * 2 - 1; }
        this.enabled = true; this.timer = setInterval(() => this.schedule(), 25);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { this.enabled = false; }
  }
  setVolumes(sfx, music) {
    this.sfxVol = sfx; this.musicVol = music;
    if (this.ctx) { const t = this.ctx.currentTime; this.sfx.gain.setTargetAtTime(sfx, t, 0.05); if (!this.paused) this.music.gain.setTargetAtTime(music, t, 0.05); }
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  ok() { return this.enabled && this.ctx && this.ctx.state === 'running'; }
  spam(key, ms) { const now = performance.now(); if (this.last[key] && now - this.last[key] < ms) return true; this.last[key] = now; return false; }
  voice(dur) { if (this.voices >= this.MAX_VOICES) return false; this.voices++; setTimeout(() => { this.voices--; }, dur * 1000 + 50); return true; }
  env(g, t, a, dur, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  osc(type, f0, f1, dur, peak, o = {}) {
    const c = this.ctx, t = c.currentTime + (o.delay || 0), os = c.createOscillator(), g = c.createGain();
    os.type = type; os.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) os.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, 0.002, dur, peak);
    let n = os; if (o.filter) { const f = c.createBiquadFilter(); f.type = o.filter[0]; f.frequency.value = o.filter[1]; if (o.filter[2]) f.Q.value = o.filter[2]; os.connect(f); n = f; }
    if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; }
    n.connect(g); g.connect(o.bus || this.sfx); os.start(t); os.stop(t + dur + 0.02);
  }
  fm(f, dur, peak, o = {}) { // cloche FM : porteuse sine, modulante ratio 3,5, indice 2 → 0
    const c = this.ctx, t = c.currentTime + (o.delay || 0), car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.frequency.value = f; mod.frequency.value = f * (o.ratio || 3.5); mg.gain.setValueAtTime(f * 2, t); mg.gain.exponentialRampToValueAtTime(0.01, t + Math.min(0.12, dur));
    mod.connect(mg); mg.connect(car.frequency); this.env(g, t, 0.002, dur, peak); car.connect(g); g.connect(o.bus || this.sfx);
    car.start(t); mod.start(t); car.stop(t + dur + 0.02); mod.stop(t + dur + 0.02);
  }
  noiseBurst(dur, peak, ftype, f0, f1, q, o = {}) {
    const c = this.ctx, t = c.currentTime + (o.delay || 0), s = c.createBufferSource(); s.buffer = this.noise; s.loop = dur > 0.9;
    const f = c.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur); if (q) f.Q.value = q;
    const g = c.createGain(); this.env(g, t, 0.002, dur, peak); s.connect(f); f.connect(g); g.connect(o.bus || this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  scaleNote(deg, oct = 0) { const S = SCALES[this.core], m = S.mode, i = ((deg % 7) + 7) % 7; return S.root + m[i] + 12 * (Math.floor(deg / 7) + oct); }

  play(name, a = 0, b = 0) {
    if (!this.ok()) return;
    switch (name) {
      case 'tick': if (this.spam(name, 30) || !this.voice(0.02)) return; this.osc('sine', 2400, 2400, 0.012, 0.03); break;
      case 'flip': if (this.spam(name, 30) || !this.voice(0.05)) return; this.osc('triangle', 1320, 880, 0.04, 0.07, { pan: Math.max(-0.3, Math.min(0.3, a * 0.3)) }); break;
      case 'whooshUp': if (!this.voice(0.17)) return; this.noiseBurst(0.16, 0.08, 'bandpass', 600, 2400, 1.5); break;
      case 'whooshDown': if (!this.voice(0.15)) return; this.noiseBurst(0.14, 0.06, 'bandpass', 2000, 500, 1.5); break;
      case 'graze': { if (this.spam(name, 45) || !this.voice(0.15)) return; const f = 1046 * Math.pow(2, Math.min(20, a + 2 * b) / 12); this.fm(f, 0.14, 0.07); break; }
      case 'perfect': { if (!this.voice(0.2)) return; const f = 1046 * Math.pow(2, Math.min(20, a + 2 * b) / 12); this.fm(f, 0.14, 0.09); this.fm(f * 1.5, 0.14, 0.08, { delay: 0.03 }); break; }
      case 'tierUp': { if (!this.voice(0.45)) return; const r = mtof(this.scaleNote(0, 1) + a); [0, 4, 7, 12].forEach((s, i) => this.osc('triangle', r * Math.pow(2, s / 12), 0, 0.4 - i * 0.03, 0.13, { delay: i * 0.03 })); break; }
      case 'tierDown': if (!this.voice(0.2)) return; this.osc('triangle', 660, 440, 0.18, 0.05); break;
      case 'surcharge': { if (!this.voice(0.85)) return; this.noiseBurst(0.6, 0.16, 'highpass', 300, 6000); const r = mtof(this.scaleNote(0)); [0, 4, 7].forEach(s => this.osc('sawtooth', r * Math.pow(2, s / 12), 0, 0.8, 0.07, { filter: ['lowpass', 2000] })); break; }
      case 'photon': if (this.spam(name, 30) || !this.voice(0.05)) return; this.osc('sine', 1568, 2093, 0.04, 0.05); break;
      case 'resonance': if (!this.voice(0.3)) return; for (let i = 0; i < 4; i++) this.fm(mtof(this.scaleNote(i * 2, 1)), 0.18, 0.14 / 1.4, { delay: i * 0.06 }); break;
      case 'rayTel': {
        if (this.telN >= 2 || !this.voice(a)) return; this.telN++; setTimeout(() => this.telN--, a * 1000);
        const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.frequency.value = 1800; lfo.frequency.value = 14; lg.gain.value = 0.02;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.04, t + a); g.gain.linearRampToValueAtTime(0.0001, t + a + 0.02);
        lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(this.sfx); o.start(t); lfo.start(t); o.stop(t + a + 0.03); lfo.stop(t + a + 0.03); break;
      }
      case 'rayFire': { if (this.rayN >= 3 || !this.voice(a + 0.1)) return; this.rayN++; setTimeout(() => this.rayN--, a * 1000); const d = Math.max(0.12, a);
        this.osc('sawtooth', 90, 90, d, 0.09); this.noiseBurst(d, 0.05, 'lowpass', 1500, 1500); break; }
      case 'arcTel': if (this.spam(name, 100) || !this.voice(0.3)) return; this.osc('sine', 220, 330, 0.3, 0.06); break;
      case 'orbTel': if (!this.voice(0.5)) return; for (let i = 0; i < 2; i++) { this.osc('square', 392, 392, 0.12, 0.08, { filter: ['lowpass', 1000], delay: i * 0.24 }); this.osc('square', 311, 311, 0.12, 0.08, { filter: ['lowpass', 1000], delay: i * 0.24 + 0.12 }); } break;
      case 'ecl': if (this.spam(name, 60) || !this.voice(0.03)) return; this.osc('square', 660, 660, 0.02, 0.03, { filter: ['lowpass', 2000] }); break;
      case 'sat': if (this.spam(name, 120) || !this.voice(0.4)) return; {
        const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), v = c.createOscillator(), vg = c.createGain();
        o.type = 'sawtooth'; o.frequency.value = 110; v.frequency.value = 8; vg.gain.value = 6; v.connect(vg); vg.connect(o.frequency);
        this.env(g, t, 0.01, 0.4, 0.06); o.connect(g); g.connect(this.sfx); o.start(t); v.start(t); o.stop(t + 0.42); v.stop(t + 0.42); } break;
      case 'palier': if (!this.voice(1.2)) return; this.fm(mtof(this.scaleNote(0, -2)), 1.2, 0.18, { ratio: 1.4 }); for (let i = 0; i < 3; i++) this.fm(mtof(this.scaleNote(i * 2, 1)), 0.4, 0.08, { delay: 0.15 + i * 0.12 }); break;
      case 'phase': if (!this.voice(0.9)) return; this.osc('sine', 55, 30, 0.8, 0.3); this.noiseBurst(0.8, 0.12, 'lowpass', 4000, 200); this.fm(mtof(this.scaleNote(0, -1)), 0.9, 0.1); break;
      case 'shield': if (!this.voice(0.2)) return; for (let i = 0; i < 6; i++) this.osc('sine', 2000 + Math.random() * 3000, 0, 0.06, 0.05, { delay: i * 0.01 }); this.noiseBurst(0.15, 0.12, 'highpass', 3000, 3000); break;
      case 'reflex': if (!this.voice(0.4)) return; this.osc('sine', 880, 220, 0.4, 0.1); this.musicLP(900, 0.05, 0.6); break;
      case 'death': {
        if (!this.voice(0.9)) return; this.osc('sawtooth', 330, 40, 0.6, 0.2); this.noiseBurst(0.8, 0.2, 'lowpass', 3000, 100); this.osc('sine', 50, 50, 0.5, 0.25);
        if (this.ctx) { const t = this.ctx.currentTime; this.mFilter.frequency.cancelScheduledValues(t); this.mFilter.frequency.setValueAtTime(8000, t); this.mFilter.frequency.exponentialRampToValueAtTime(120, t + 0.5);
          this.mBus.gain.cancelScheduledValues(t); this.mBus.gain.setValueAtTime(1, t); this.mBus.gain.linearRampToValueAtTime(0.0001, t + 0.6); }
        break;
      }
      case 'fanfare': if (!this.voice(0.6)) return; [0, 4, 7, 9].forEach((d, i) => this.fm(mtof(this.scaleNote(d, 1)), 0.3, 0.15 / 1.3, { delay: i * 0.12 })); break;
      case 'ui': if (this.spam(name, 30) || !this.voice(0.03)) return; this.osc('sine', 880, 880, 0.02, 0.06); break;
      case 'buy': if (!this.voice(0.5)) return; [523, 659, 784, 1047].forEach((f, i) => this.osc('triangle', f, f, 0.06, 0.1, { delay: i * 0.05 })); this.osc('sine', 2093, 2093, 0.2, 0.14, { delay: 0.2 }); break;
      case 'count': if (this.spam(name, 40) || !this.voice(0.02)) return; this.osc('square', 2000, 2000, 0.01, 0.025); break;
    }
  }
  musicLP(freq, att, hold) {
    if (!this.ctx) return; const t = this.ctx.currentTime, f = this.mFilter.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.exponentialRampToValueAtTime(freq, t + att); f.setValueAtTime(freq, t + att + hold); f.exponentialRampToValueAtTime(18000, t + att + hold + 0.3);
  }

  // ------------------------------------------------------------ musique générative §11.2
  // state : 'menu' (pad + arpège, 90 BPM), 'game' (couches selon le palier), 'end' (pad seul), 'off'
  setMusic(state, core) {
    if (core) this.core = core;
    if (state === this.state) return;
    this.state = state;
    if (state === 'menu' || state === 'end') this.bpm = 90;
    if (state === 'game') { this.palier = 1; this.sur = false; this.bpm = 112; }
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.mFilter.frequency.cancelScheduledValues(t); this.mFilter.frequency.setValueAtTime(18000, t);
      this.mBus.gain.cancelScheduledValues(t); this.mBus.gain.setValueAtTime(Math.max(0.0001, this.mBus.gain.value), t); this.mBus.gain.linearRampToValueAtTime(state === 'off' ? 0.0001 : 1, t + 0.6);
    }
  }
  setPalier(n) { this.palier = n; this.pendingBpm = Math.min(150, 112 + 4 * (Math.min(10, n) - 1) + (n > 10 ? 2 : 0)); }
  setSurcharge(on) { this.sur = on; }
  setSeed(s) { this.seed = s >>> 0; }
  pauseMusic(p) {
    this.paused = p; if (!this.ctx) return; const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t); this.music.gain.setValueAtTime(Math.max(0.0001, this.music.gain.value), t); this.music.gain.linearRampToValueAtTime(p ? 0.0001 : this.musicVol, t + 0.2);
  }
  schedule() {
    if (!this.ok() || this.state === 'off') return;
    const c = this.ctx;
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.1) {
      if (this.pendingBpm && this.step16 % 4 === 0) { this.bpm = this.state === 'game' ? this.pendingBpm : 90; this.pendingBpm = 0; } // tempo : au temps fort suivant
      this.playStep(this.step16, this.nextTime); this.nextTime += 60 / this.bpm / 4; this.step16 = (this.step16 + 1) % 256;
    }
  }
  playStep(s, t) {
    const c = this.ctx, S = SCALES[this.core], bar = Math.floor(s / 16) % 4, pos = s % 16, deg = S.prog[bar] - 1;
    const chord = [this.scaleNote(deg), this.scaleNote(deg + 2), this.scaleNote(deg + 4)];
    const six = 60 / this.bpm / 4, game = this.state === 'game', P = game ? this.palier : 0, bus = this.mBus;
    const seed = ((Math.floor(s / 16) * 2654435761) ^ this.seed) >>> 0;
    const note = (type, f, dur, gain, fl) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let n = o; if (fl) { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = fl; o.connect(f2); n = f2; }
      n.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
    };
    // pad (2 sawtooth ±7 cents, LP 900 Hz ; SURCHARGE : 4 kHz) en début de mesure
    if (pos === 0) for (const d of [-7, 7]) { const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = mtof(chord[0] - 12); o.detune.value = d;
      f.type = 'lowpass'; f.frequency.value = this.sur ? 4000 : 900; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.025, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + six * 16);
      o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + six * 16 + 0.05); }
    if (this.state === 'end') return;
    // arpège cloche (croches), motif 1-3-5-8 seedé par mesure
    if (pos % 2 === 0) { const motif = [0, 1, 2, 3, 2, 1, 0, 3], i = motif[((pos >> 1) + (seed % 4)) % 8], n = i === 3 ? chord[0] + 12 : chord[i];
      const o = c.createOscillator(), m = c.createOscillator(), mg = c.createGain(), g = c.createGain(), f = mtof(n + 12);
      o.frequency.value = f; m.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 1.5, t); mg.gain.exponentialRampToValueAtTime(0.01, t + 0.12); m.connect(mg); mg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + six * 2.5);
      o.connect(g); g.connect(bus); o.start(t); m.start(t); o.stop(t + six * 2.6); m.stop(t + six * 2.6); }
    if (!game) return;
    // P2 kick (tous les temps)
    if (P >= 2 && pos % 4 === 0) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.11); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.12); if (this.onKick) this.onKick(t); }
    // P3 basse (croches)
    if (P >= 3 && pos % 2 === 0) note('sawtooth', mtof(chord[0] - 24), six * 1.8, 0.06, 500);
    // P4 charleston (contretemps) ; P9 en doubles-croches
    if ((P >= 4 && pos % 4 === 2) || (P >= 9 && pos % 2 === 1)) { const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); n.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 8000; g.gain.setValueAtTime(0.045, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025); n.connect(f); f.connect(g); g.connect(bus); n.start(t, (pos * 0.013) % 0.5); n.stop(t + 0.03); }
    // P7 clap (temps 2 et 4)
    if (P >= 7 && (pos === 4 || pos === 12)) { const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); n.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 1500; g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); n.connect(f); f.connect(g); g.connect(bus); n.start(t, 0.2); n.stop(t + 0.09); }
    // P5 lead : 1 note par noire, 40 % de silences, gamme du noyau (SURCHARGE : à l'octave)
    if (P >= 5 && pos % 4 === 0) {
      const r = ((seed ^ (pos * 7919)) >>> 0) % 100; if (r >= 40) {
        const n = this.scaleNote((r % 7) + 7, this.sur ? 1 : 0), f = mtof(n), d = six * 3.5;
        switch (S.lead) {
          case 'fm': case 'fm8': { const o = c.createOscillator(), m = c.createOscillator(), mg = c.createGain(), g = c.createGain(); o.frequency.value = f; m.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 2, t); mg.gain.exponentialRampToValueAtTime(0.01, t + 0.15); m.connect(mg); mg.connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(bus); o.start(t); m.start(t); o.stop(t + d + 0.02); m.stop(t + d + 0.02); if (S.lead === 'fm8') note('sine', f * 2, d, 0.02); break; }
          case 'tri': { const o = c.createOscillator(), v = c.createOscillator(), vg = c.createGain(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = f; v.frequency.value = 5; vg.gain.value = f * 0.01; v.connect(vg); vg.connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(bus); o.start(t); v.start(t); o.stop(t + d + 0.02); v.stop(t + d + 0.02); break; }
          case 'sq': note('square', f, six * 0.8, 0.035, 1800); break;
          case 'det': { const o1 = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(); o1.frequency.value = f; o2.frequency.value = f; o1.detune.value = 6; o2.detune.value = -6; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o1.connect(g); o2.connect(g); g.connect(bus); o1.start(t); o2.start(t); o1.stop(t + d + 0.02); o2.stop(t + d + 0.02); break; }
          case 'saw': note('sawtooth', f, six * 7, 0.03, 600); break;
        }
      }
    }
  }
}

export class Haptics {
  constructor() { this.enabled = true; this.last = 0; }
  vibrate(p) {
    if (!this.enabled || !navigator.vibrate) return;
    const now = performance.now(); if (now - this.last < 80) return; this.last = now; // max 1 appel / 80 ms
    try { navigator.vibrate(p); } catch { /* ignoré */ }
  }
}
