/**
 * Prosedürel ses motoru — hiçbir ses dosyası kullanmaz.
 * Tarayıcı otomatik oynatma kısıtı nedeniyle AudioContext ilk kullanıcı
 * etkileşiminde (BAŞLA) oluşturulur ve resume() çağrılır.
 */

function noiseBuffer(ctx, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    // hafif "brown" gürültü: su/yağmur için daha organik
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.2 + white * 0.25;
  }
  return buf;
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ready = false;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // --- yağmur: döngülü gürültü + bant geçiren filtre
    const noise = noiseBuffer(ctx, 3);
    this.noiseBuf = noise;

    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noise;
    rainSrc.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 1400;
    rainFilter.Q.value = 0.55;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSrc.connect(rainFilter).connect(this.rainGain).connect(this.master);
    rainSrc.start();

    // yağmurda dalgalanma (LFO) — sabit "beyaz ses" hissini kırar
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(rainFilter.frequency);
    lfo.start();

    // --- rüzgar: alçak geçiren, yavaş nefes alan
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noise;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 320;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(this.windGain).connect(this.master);
    windSrc.start();

    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.06;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 190;
    windLfo.connect(windLfoGain).connect(windFilter.frequency);
    windLfo.start();

    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(muted) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /** Ambiyansı sahne ayarına göre ayarlar. */
  setAmbience({ rain = 0, wind = 0 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(rain * 0.34, t, 0.6);
    this.windGain.gain.setTargetAtTime(wind * 0.2, t, 0.6);
  }

  #env(node, peak, attack, decay) {
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g).connect(this.master);
    return g;
  }

  #tone(type, f0, f1, dur, peak) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    this.#env(o, peak, 0.008, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  #burst(filterType, freq, dur, peak, q = 1) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f);
    this.#env(f, peak, 0.006, dur);
    src.start();
    src.stop(ctx.currentTime + dur + 0.1);
  }

  jump()   { this.#tone("sine", 260, 620, 0.16, 0.16); this.#burst("bandpass", 900, 0.09, 0.06, 1.5); }
  land()   { this.#burst("lowpass", 260, 0.12, 0.2); this.#tone("sine", 130, 70, 0.1, 0.1); }
  step()   { this.#burst("bandpass", 1700, 0.045, 0.035, 2.2); }

  phase() {
    this.#tone("triangle", 340, 980, 0.22, 0.12);
    this.#burst("highpass", 2600, 0.22, 0.07, 0.8);
  }
  deny()   { this.#tone("square", 150, 90, 0.13, 0.07); }

  death() {
    this.#tone("sawtooth", 420, 48, 0.6, 0.15);
    this.#burst("lowpass", 420, 0.5, 0.22);
  }

  checkpoint() {
    this.#tone("sine", 660, 660, 0.5, 0.09);
    setTimeout(() => this.#tone("sine", 990, 990, 0.6, 0.07), 90);
  }

  exit() {
    this.#tone("sine", 520, 1040, 0.35, 0.1);
    setTimeout(() => this.#tone("sine", 780, 1560, 0.4, 0.07), 120);
  }

  thunder(delay = 0) {
    if (!this.ready || !this.enabled) return;
    setTimeout(() => {
      this.#burst("lowpass", 180, 1.8, 0.42, 0.6);
      this.#burst("lowpass", 70, 2.6, 0.3, 0.4);
    }, delay * 1000);
  }

  chase() { this.#tone("sawtooth", 90, 62, 0.5, 0.1); }
}
