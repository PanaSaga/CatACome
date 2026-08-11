// 절차 생성 SFX (§7-4). 나중에 샘플 음원으로 교체할 수 있도록 play(name) 한 창구만 쓴다.
// 동시 16채널 · 같은 이름은 40ms 내 중복 억제 (풀업 곡괭이가 25칸을 부술 때 겹치는 것 방지)
const DEDUPE_MS = 40;
const MAX_VOICES = 16;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.last = new Map();
    this.voices = 0;
    this.muted = false;
    this.underwater = false;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 20000;
    this.master.connect(this.lp);
    this.lp.connect(this.ctx.destination);
    return this.ctx;
  }

  resume() { const c = this.ensure(); if (c && c.state === 'suspended') c.resume(); }

  setUnderwater(b) {
    if (this.underwater === b) return;
    this.underwater = b;
    if (this.lp) this.lp.frequency.value = b ? 700 : 20000;
  }

  noiseBuffer(dur) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  noise(dur, freq, q, vol) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.track(src, dur);
  }

  tone(type, f0, f1, dur, vol) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, c.currentTime);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, c.currentTime + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(this.master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
    this.track(o, dur);
  }

  track(node, dur) {
    this.voices++;
    setTimeout(() => { this.voices--; }, dur * 1000 + 40);
  }

  play(name, pitch = 1, vol = 1) {
    if (this.muted) return;
    const c = this.ensure();
    if (!c || c.state !== 'running') return;
    if (this.voices >= MAX_VOICES) return;
    const now = performance.now();
    const key = name;
    if (now - (this.last.get(key) || -1e9) < DEDUPE_MS) return;
    this.last.set(key, now);
    const p = pitch;
    switch (name) {
      // 채굴음 — 경도별 4종, 스윙마다 피치 ±8% 랜덤화
      case 'dig1': this.noise(0.08, 320 * p, 1.2, 0.5 * vol); break;
      case 'dig2': this.noise(0.09, 520 * p, 2.0, 0.5 * vol); break;
      case 'dig3': this.noise(0.10, 840 * p, 3.0, 0.5 * vol); break;
      case 'dig4': this.noise(0.11, 1300 * p, 5.0, 0.55 * vol); break;
      case 'jump': this.tone('square', 300 * p, 620 * p, 0.09, 0.16 * vol); break;
      case 'land': this.noise(0.07, 180, 1.0, 0.28 * vol); break;
      case 'hurt': this.tone('sawtooth', 420, 90, 0.22, 0.3 * vol); break;
      case 'death': this.tone('sawtooth', 300, 50, 0.9, 0.32 * vol); break;
      case 'sonar': this.tone('sine', 900, 1500, 0.28, 0.2 * vol); break;
      case 'pingCat': this.tone('sine', 1560, 2100, 0.16, 0.2 * vol); break;
      case 'pingStation': this.tone('triangle', 780, 1180, 0.2, 0.16 * vol); break;
      case 'pingEnemy': this.tone('square', 320, 240, 0.16, 0.18 * vol); break;
      case 'pingChest': this.tone('triangle', 1050, 1400, 0.14, 0.15 * vol); break;
      case 'pingCorpse': this.tone('sine', 240, 180, 0.24, 0.16 * vol); break;
      case 'grapple': this.tone('square', 700, 1200, 0.09, 0.16 * vol); break;
      case 'grappleMiss': this.noise(0.14, 380, 1.4, 0.18 * vol); break;
      case 'explode':
        this.noise(0.45, 140, 0.7, 0.7 * vol);
        this.tone('sine', 160 * p, 40, 0.5, 0.4 * vol);
        break;
      case 'bombThrow': this.noise(0.07, 700, 2, 0.14 * vol); break;
      case 'drill': this.noise(0.12, 420 * p, 1.6, 0.2 * vol); break;
      case 'laser': this.tone('sawtooth', 1500 * p, 500, 0.14, 0.18 * vol); break;
      case 'pickup': this.tone('triangle', 900 * p, 1400 * p, 0.08, 0.18 * vol); break;
      case 'gold':
        this.tone('triangle', 1050, 1500, 0.1, 0.2 * vol);
        setTimeout(() => this.tone('triangle', 1500, 2000, 0.12, 0.18 * vol), 70);
        break;
      case 'splashIn': this.noise(0.2, 500, 0.9, 0.3 * vol); break;
      case 'burn': this.noise(0.25, 260, 0.8, 0.28 * vol); break;
      case 'scratch': this.noise(0.12, 900, 6, 0.12 * vol); break;
      case 'centiWarn': this.tone('sawtooth', 120, 300, 0.3, 0.22 * vol); break;
      case 'chest': this.tone('triangle', 500, 900, 0.2, 0.2 * vol); break;
      case 'potion': this.tone('sine', 600, 1200, 0.22, 0.2 * vol); break;
      case 'buy': this.tone('square', 700, 1100, 0.1, 0.16 * vol); break;
      case 'error': this.tone('square', 220, 160, 0.14, 0.16 * vol); break;
      case 'cat': this.tone('sine', 1200, 900, 0.2, 0.22 * vol); break;
      case 'deliver':
        this.tone('triangle', 800, 1200, 0.12, 0.2 * vol);
        setTimeout(() => this.tone('triangle', 1200, 1600, 0.16, 0.2 * vol), 90);
        break;
      case 'elevator': this.tone('sine', 400, 1000, 0.5, 0.16 * vol); break;
      case 'flag': this.tone('triangle', 520, 780, 0.16, 0.16 * vol); break;
      case 'buff':
        this.tone('sine', 600, 1400, 0.3, 0.2 * vol);
        setTimeout(() => this.tone('sine', 900, 1800, 0.3, 0.16 * vol), 100);
        break;
      default: break;
    }
  }

  /** 경도별 채굴음 + 피치 랜덤화 */
  dig(hardness) {
    const p = 1 + (Math.random() - 0.5) * 0.16;
    this.play('dig' + Math.min(4, Math.max(1, hardness)), p);
  }
}
