// Música de fundo composta e sintetizada na hora com Web Audio: sem arquivos e sem direitos autorais.
// Loop leve em Dó maior (C–G–Am–F) com pad, baixo, arpejo, melodia com eco e bateria suave.
// O navegador só libera áudio após um gesto do usuário; por isso o AudioContext nasce no primeiro
// clique/tecla/toque (o formulário de entrada já garante isso antes de o jogo começar).
import { MUSIC_BPM, MUSIC_VOLUME } from "@jogo/shared/constants";

/** Colcheias por compasso (4/4). */
const STEPS_PER_BAR = 8;
/** Quanto à frente (s) o agendador programa as notas. */
const LOOKAHEAD_S = 0.2;
const SCHEDULER_MS = 25;
const FADE_IN_S = 2;
const STORAGE_KEY = "empurrao.musicaMudo";

type Note = number | null;

interface Bar {
  /** Nota MIDI do baixo. */
  root: number;
  /** Acorde do pad (MIDI). */
  chord: readonly [number, number, number];
  /** Melodia em colcheias (null = pausa). */
  melody: readonly Note[];
}

// Duas frases de 4 compassos: a segunda responde à primeira.
const BARS: readonly Bar[] = [
  { root: 36, chord: [60, 64, 67], melody: [76, null, 79, null, 81, 79, 76, null] },
  { root: 43, chord: [59, 62, 67], melody: [74, null, 79, null, 74, null, 71, null] },
  { root: 45, chord: [57, 60, 64], melody: [72, null, 76, null, 81, null, 79, 76] },
  { root: 41, chord: [57, 60, 65], melody: [77, null, 76, null, 72, null, null, null] },
  { root: 36, chord: [60, 64, 67], melody: [79, null, 76, 79, 84, null, 81, null] },
  { root: 43, chord: [59, 62, 67], melody: [79, null, 74, null, 71, 74, 79, null] },
  { root: 45, chord: [57, 60, 64], melody: [81, 79, 76, null, 72, null, 76, null] },
  { root: 41, chord: [57, 60, 65], melody: [74, null, 72, null, null, null, null, null] },
];
/** Ordem das notas do acorde no arpejo. */
const ARP = [0, 1, 2, 1, 0, 2, 1, 2] as const;

const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private echoIn: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private playing = false;
  private _muted = readMuted();

  constructor() {
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("keydown", this.unlock);
    document.addEventListener("visibilitychange", this.sync);
  }

  get muted(): boolean {
    return this._muted;
  }

  /** Começa a tocar (ou espera o primeiro gesto do usuário, se o áudio ainda estiver bloqueado). */
  start(): void {
    this.playing = true;
    this.startScheduler();
    this.sync();
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.sync();
  }

  toggleMuted(): boolean {
    this._muted = !this._muted;
    try {
      localStorage.setItem(STORAGE_KEY, this._muted ? "1" : "0");
    } catch {
      // Sem localStorage (ex.: modo privado restrito): só não lembra a escolha.
    }
    this.sync();
    return this._muted;
  }

  // ---------- Contexto de áudio ----------

  private readonly unlock = (): void => {
    if (!this.ctx) {
      if (typeof AudioContext === "undefined") return;
      this.createGraph(new AudioContext());
      this.startScheduler();
    }
    this.sync();
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
  };

  private createGraph(ctx: AudioContext): void {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // Eco da melodia: atraso de 3 colcheias com realimentação.
    this.echoIn = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = (60 / MUSIC_BPM / 2) * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.echoIn.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.master);

    // Ruído branco para a bateria.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Toca só se o jogo começou, não está no mudo e a aba está visível. */
  private readonly sync = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    const shouldRun = this.playing && !this._muted && !document.hidden;
    if (shouldRun && ctx.state !== "running") ctx.resume().catch(() => undefined);
    if (!shouldRun && ctx.state === "running") ctx.suspend().catch(() => undefined);
  };

  private startScheduler(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!this.playing || !ctx || !master || this.timer !== null) return;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(MUSIC_VOLUME, ctx.currentTime + FADE_IN_S);
    this.timer = window.setInterval(this.schedule, SCHEDULER_MS);
  }

  // ---------- Sequenciador ----------

  private readonly schedule = (): void => {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const stepDur = 60 / MUSIC_BPM / 2;
    // Se o agendador atrasou (aba em segundo plano etc.), pula em vez de tocar tudo de uma vez.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % (BARS.length * STEPS_PER_BAR * 2);
    }
  };

  private playStep(step: number, t: number, stepDur: number): void {
    const s = step % STEPS_PER_BAR;
    const barIndex = Math.floor(step / STEPS_PER_BAR);
    const bar = BARS[barIndex % BARS.length];
    if (!bar) return;
    // A melodia entra só na segunda volta do loop, para variar.
    const withMelody = barIndex >= BARS.length;

    if (s === 0) for (const n of bar.chord) this.pad(midiToHz(n), t, stepDur * STEPS_PER_BAR);
    if (s === 0 || s === 3 || s === 4 || s === 6) this.bass(midiToHz(bar.root), t, stepDur * 1.5);
    const arpNote = bar.chord[ARP[s] ?? 0];
    if (arpNote !== undefined) this.pluck(midiToHz(arpNote + 12), t, 0.06);
    const lead = bar.melody[s];
    if (withMelody && lead !== null && lead !== undefined) this.lead(midiToHz(lead), t, stepDur * 1.6);

    if (s === 0 || s === 4) this.kick(t);
    if (s === 2 || s === 6) this.noiseHit(t, 0.12, "bandpass", 1800, 0.18);
    if (s % 2 === 1) this.noiseHit(t, 0.04, "highpass", 7000, 0.07);
  }

  // ---------- Instrumentos ----------

  /** Oscilador com envelope ataque/decaimento ligado a `dest`. */
  private voice(
    type: OscillatorType,
    freq: number,
    t: number,
    attack: number,
    dur: number,
    peak: number,
    dest: AudioNode,
    detune = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    osc.connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + attack + dur + 0.05);
  }

  private filtered(type: BiquadFilterType, freq: number): BiquadFilterNode | null {
    if (!this.ctx || !this.master) return null;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.connect(this.master);
    return f;
  }

  private pad(freq: number, t: number, dur: number): void {
    const f = this.filtered("lowpass", 1100);
    if (!f) return;
    this.voice("triangle", freq, t, 0.4, dur, 0.05, f, -6);
    this.voice("triangle", freq, t, 0.4, dur, 0.05, f, 6);
  }

  private bass(freq: number, t: number, dur: number): void {
    if (!this.master) return;
    this.voice("sine", freq, t, 0.01, dur, 0.32, this.master);
    const f = this.filtered("lowpass", 500);
    if (f) this.voice("triangle", freq, t, 0.01, dur * 0.6, 0.12, f);
  }

  private pluck(freq: number, t: number, peak: number): void {
    const f = this.filtered("lowpass", 2500);
    if (f) this.voice("square", freq, t, 0.005, 0.18, peak, f);
  }

  private lead(freq: number, t: number, dur: number): void {
    if (!this.master || !this.echoIn) return;
    this.voice("sine", freq, t, 0.02, dur, 0.16, this.master);
    this.voice("triangle", freq, t, 0.02, dur, 0.08, this.echoIn);
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private noiseHit(t: number, dur: number, type: BiquadFilterType, freq: number, peak: number): void {
    const ctx = this.ctx;
    const f = this.filtered(type, freq);
    if (!ctx || !f || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const env = ctx.createGain();
    env.gain.setValueAtTime(peak, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(env).connect(f);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
