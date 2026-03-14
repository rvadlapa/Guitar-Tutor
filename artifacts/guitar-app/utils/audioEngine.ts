import { Audio } from "expo-av";
import { Platform } from "react-native";
import { GuitarNote } from "@/context/TabContext";

// ─── Instrument type ──────────────────────────────────────────────────────────

export type InstrumentType = "guitar" | "sitar" | "piano" | "bansuri";

let currentInstrument: InstrumentType = "guitar";
export function setInstrument(inst: InstrumentType): void { currentInstrument = inst; }
export function getInstrument(): InstrumentType { return currentInstrument; }

// ─── Frequency helpers ────────────────────────────────────────────────────────

const OPEN_STRING_FREQS = [329.63, 246.94, 196.0, 146.83, 110.0, 82.41];

function getFretFrequency(stringIndex: number, fret: number | "x" | "0"): number {
  if (fret === "x") return 0;
  const fretNum = fret === "0" ? 0 : (fret as number);
  return OPEN_STRING_FREQS[stringIndex] * Math.pow(2, fretNum / 12);
}

// ─── GUITAR — Karplus-Strong with triangular pluck excitation ─────────────────
//
// The previous version seeded the delay line with pure noise, which sounds
// buzzy and harsh. A real plucked string is displaced into a triangular shape
// by the finger/pick, then released. Synthesizing this triangular initial
// condition gives the correct harmonic spectrum: the n-th harmonic amplitude
// follows 1/n², just like a real string. Mixing in a small amount of noise
// adds the pick-attack texture.
//
// Pluck position (fraction of string from bridge): ~0.15-0.20 for pick near
// bridge. This creates a comb-filter notch, killing every 1/pluckPos-th
// harmonic (e.g. pluck at 1/6 → kills harmonics 6, 12, 18...).

function ksGuitarSeed(P: number, si: number): Float32Array {
  const buf      = new Float32Array(P);
  const pluckPos = 0.14 + si * 0.018; // bridge pluck for treble, slightly more toward middle for bass
  for (let i = 0; i < P; i++) {
    const phase = i / P;
    // Triangular displacement shape (peaks at pluckPos)
    const tri = phase < pluckPos
      ? phase / pluckPos
      : (1.0 - phase) / (1.0 - pluckPos);
    // 60% triangular (harmonic profile) + 40% noise (pick texture)
    buf[i] = tri * 0.60 + (Math.random() * 2 - 1) * 0.40;
  }
  // Warmth lowpass: lower strings (higher si) = warmer, less high-frequency content
  const w = 0.08 + (5 - si) * 0.065;
  for (let i = 1; i < P; i++) buf[i] = buf[i] * (1 - w) + buf[i - 1] * w;
  return buf;
}

function ksGenerate(sr: number, freq: number, si: number, dur: number): Float32Array {
  const N     = Math.floor(sr * dur);
  const P     = Math.max(2, Math.round(sr / freq));
  const buf   = ksGuitarSeed(P, si);
  // Treble strings sustain a bit longer than bass strings
  const decay = 0.9943 + (5 - si) * 0.00055;
  const out   = new Float32Array(N);
  let ptr = 0;
  for (let i = 0; i < N; i++) {
    const nxt = (ptr + 1) % P;
    out[i]    = buf[ptr];
    buf[ptr]  = 0.5 * (buf[ptr] + buf[nxt]) * decay;
    ptr       = nxt;
  }
  return out;
}

// ─── SITAR — KS with strong jawari, chikari accent strings, tuned taraf ───────
//
// Three layers:
//
// 1. MAIN STRING with jawari: A custom waveshaper (soft cubic clip → hard limit)
//    creates the specific odd-harmonic "buzz" of the curved bridge. Unlike plain
//    tanh, the cubic region grows harmonics more aggressively at medium amplitudes.
//
// 2. CHIKARI strings: Two thin bright strings (octave + octave+fifth above) that
//    get plucked simultaneously on every stroke, giving the metallic "ting-ting"
//    accent. These are real on a sitar — two side strings for rhythmic accents.
//
// 3. TARAF sympathetic strings: 7 strings tuned to musical scale intervals
//    (Sa Re Ga Ma Pa Dha Ni — exact just-intonation ratios). These are not
//    plucked; they vibrate sympathetically when the corresponding harmonics are
//    present in the main string. This is the shimmer/sustain that fills the gaps
//    between strokes on a real sitar.

function jawari(x: number): number {
  const g = 3.4;
  const s = x * g;
  // Cubic soft-clip below ±1, then hard flat above — stronger than tanh
  if (s >  1.0) return  (2.0 / 3.0) + 0.28 * Math.tanh((s - 1.0) * 2.5);
  if (s < -1.0) return -(2.0 / 3.0) - 0.28 * Math.tanh((-s - 1.0) * 2.5);
  return s - (s * s * s) / 3.0;
}

function ksGenerateSitar(sr: number, freq: number, si: number, dur: number): Float32Array {
  const N   = Math.floor(sr * dur);
  const P   = Math.max(2, Math.round(sr / freq));
  const buf = new Float32Array(P);
  for (let i = 0; i < P; i++) buf[i] = Math.random() * 2 - 1;

  // Very minimal warmth → metallic brightness characteristic of sitar
  const w = 0.018 + (5 - si) * 0.013;
  for (let i = 1; i < P; i++) buf[i] = buf[i] * (1 - w) + buf[i - 1] * w;

  const decay = 0.9982 + si * 0.00030;
  const out   = new Float32Array(N);
  const jScale = 1.0 / (2.0 / 3.0 + 0.28); // normalize jawari output
  let ptr = 0;
  for (let i = 0; i < N; i++) {
    const nxt = (ptr + 1) % P;
    out[i]    = buf[ptr];
    const raw = 0.5 * (buf[ptr] + buf[nxt]) * decay;
    buf[ptr]  = jawari(raw) * jScale * 0.70;
    ptr       = nxt;
  }

  // ── Chikari: octave (2×) and octave+fifth (3×) above main string ──────────
  const chikariDefs = [
    { ratio: 2.0, amp: 0.14, initAmp: 0.70 },
    { ratio: 3.0, amp: 0.10, initAmp: 0.55 },
  ];
  for (const cd of chikariDefs) {
    const cP   = Math.max(2, Math.round(sr / (freq * cd.ratio)));
    const cBuf = new Float32Array(cP);
    // Very bright seed for chikari (no warmth filter)
    for (let i = 0; i < cP; i++) cBuf[i] = (Math.random() * 2 - 1) * cd.initAmp;
    const cDecay = 0.9960;
    let cp = 0;
    for (let i = 0; i < N; i++) {
      const cn   = (cp + 1) % cP;
      out[i]    += cBuf[cp] * cd.amp;
      const cRaw = 0.5 * (cBuf[cp] + cBuf[cn]) * cDecay;
      cBuf[cp]   = jawari(cRaw) * jScale * 0.70;
      cp = cn;
    }
  }

  // ── Taraf: 7 sympathetic strings at just-intonation intervals ─────────────
  // Sa=1, Re=9/8, Ga=5/4, Ma=4/3, Pa=3/2, Dha=5/3, Ni=15/8
  const tarafRatios = [1.0, 1.125, 1.25, 1.3333, 1.5, 1.6667, 1.875];
  const tarafAmps   = [0.11, 0.07,  0.065, 0.055, 0.09, 0.055, 0.065];
  for (let t = 0; t < tarafRatios.length; t++) {
    const tP   = Math.max(2, Math.round(sr / (freq * tarafRatios[t])));
    const tBuf = new Float32Array(tP);
    // Very quiet seed — sympathetic strings are not struck, just resonating
    for (let i = 0; i < tP; i++) tBuf[i] = (Math.random() * 2 - 1) * 0.18;
    const tDecay = 0.9990 + t * 0.00005;
    let tp = 0;
    for (let i = 0; i < N; i++) {
      const tn   = (tp + 1) % tP;
      out[i]    += tBuf[tp] * tarafAmps[t];
      tBuf[tp]   = 0.5 * (tBuf[tp] + tBuf[tn]) * tDecay;
      tp = tn;
    }
  }
  return out;
}

// ─── PIANO — additive synthesis with double-slope decay ───────────────────────
//
// The defining feature of a piano tone is the two-stage "double-slope" decay:
//
//   Stage 1  ("prompt" sound): a fast initial transient lasting ~50-300ms.
//            Think of this as the hammer blow's resonance in the soundboard.
//   Stage 2  ("duplet" sound): a very slow sustain that can last several seconds.
//            This is the string itself continuing to vibrate at low amplitude.
//
// For each harmonic n:
//   - "blend" controls how much is Stage 1 vs Stage 2
//   - High harmonics (n≥8) are almost all Stage 1 → they vanish quickly
//   - The fundamental (n=1) is mostly Stage 2 → it sustains long after attack
//   This blend shift across harmonics is what makes piano sound like piano.
//
// String inharmonicity (B coefficient): strings are slightly stiff, so the
// n-th partial is at f_n = n·f·√(1 + B·n²) rather than exactly n·f.

function generatePiano(sr: number, freq: number, _si: number, dur: number): Float32Array {
  const N   = Math.floor(sr * dur);
  const out = new Float32Array(N);

  // ── Hammer strike noise: bandpass 1500-4000 Hz, 8ms, ~11% amplitude ────────
  // Models the felt hammer hitting the string — a dull thump, not a click.
  let lpA = 0, lpB = 0;
  const cA = 1 - Math.exp(-2 * Math.PI * 1400 / sr);
  const cB = 1 - Math.exp(-2 * Math.PI * 4200 / sr);
  const hamLen = Math.floor(sr * 0.009);
  for (let i = 0; i < hamLen; i++) {
    const n = Math.random() * 2 - 1;
    lpA += cA * (n - lpA);
    lpB += cB * (n - lpB);
    out[i] += (lpB - lpA) * Math.exp(-i / (sr * 0.0022)) * 0.14;
  }

  // ── String inharmonicity: scales with frequency (higher notes = stiffer) ───
  const B = Math.min(0.00028, Math.max(0.000028, 2.8e-5 * Math.pow(freq / 100, 0.85)));

  // ── Harmonic partials with double-slope decay ──────────────────────────────
  // Columns: harmonic n, amplitude, Stage-1 blend, Stage-1 rate, Stage-2 rate
  const partials: [number, number, number, number, number][] = [
    [ 1, 0.72, 0.18,   3.5,  0.055],
    [ 2, 0.50, 0.26,   6.5,  0.20 ],
    [ 3, 0.30, 0.34,  10.5,  0.44 ],
    [ 4, 0.18, 0.42,  15.5,  0.85 ],
    [ 5, 0.10, 0.50,  22.0,  1.55 ],
    [ 6, 0.063,0.57,  30.0,  2.60 ],
    [ 7, 0.038,0.63,  40.0,  4.00 ],
    [ 8, 0.024,0.69,  52.0,  6.20 ],
    [ 9, 0.015,0.74,  66.0,  9.00 ],
    [10, 0.009,0.79,  82.0, 12.5  ],
    [11, 0.006,0.84, 100.0, 17.0  ],
    [12, 0.004,0.88, 120.0, 24.0  ],
  ];

  // Tone starts 3ms after hammer (propagation delay through soundboard)
  const t0 = Math.floor(sr * 0.003);

  for (const [n, amp, blend, drF, drS] of partials) {
    const fn = freq * n * Math.sqrt(1 + B * n * n);
    if (fn >= sr / 2) continue;
    const omega = 2 * Math.PI * fn / sr;
    const g     = amp * 0.23;
    for (let i = t0; i < N; i++) {
      const t  = (i - t0) / sr;
      const e1 = Math.exp(-t * drF) * blend;
      const e2 = Math.exp(-t * drS) * (1.0 - blend);
      const ev = (e1 + e2) * g;
      if (ev < 0.00018) break;
      out[i] += Math.sin(omega * i) * ev;
    }
  }
  return out;
}

// ─── BANSURI — FM synthesis with breath turbulence noise ─────────────────────
//
// What separates a bamboo flute from a generic sine wave is the breath noise:
// a turbulent air stream rushing past the blow hole creates high-frequency
// friction noise that is always present but loudest during the attack. This is
// synthesized by generating high-passed white noise and mixing it in.
//
// FM: carrier at f, modulator at f·√2 (irrational ratio). Unlike modulator=2f
// (which produces integer harmonics, like an organ), the √2 ratio creates a
// non-harmonic partial spectrum that sounds more like a real flute's inharmonic
// overtones from the cylindrical bore.
//
// Vibrato: onset at 160ms, grows over 280ms to 11 cents (gentle, natural).
// Pitch sag: each note starts 10 cents flat and arrives at pitch in 40ms,
// simulating the player's finger covering the hole and settling.

function generateBansuri(sr: number, freq: number, _si: number, dur: number): Float32Array {
  const N   = Math.floor(sr * dur);
  const out = new Float32Array(N);

  // ── Breath turbulence: highpass noise peaking at attack ──────────────────
  let bnLP = 0;
  const bnC = 1 - Math.exp(-2 * Math.PI * 480 / sr); // ~480 Hz highpass
  const breath = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const n = Math.random() * 2 - 1;
    bnLP  += bnC * (n - bnLP);
    breath[i] = n - bnLP; // highpass output
  }

  // ── FM synthesis ──────────────────────────────────────────────────────────
  const modFreq = freq * 1.4142; // √2 modulator ratio
  const modIdx  = 0.92;
  const cInc    = 2 * Math.PI * freq    / sr;
  const mInc    = 2 * Math.PI * modFreq / sr;
  const vibInc  = 2 * Math.PI * 5.8    / sr;

  let cp = 0, mp = 0, vp = 0;

  for (let i = 0; i < N; i++) {
    const t = i / sr;

    // Amplitude: 40ms attack, gentle release in last 20%
    const atk = Math.min(1.0, t / 0.040);
    const rel = 1.0 - Math.max(0, (t - dur * 0.80) / (dur * 0.20));
    const env = atk * Math.max(0, rel);

    // Breath noise: large burst at attack (air turbulence) → quiet steady hiss
    const noiseAmp = env * (0.24 * Math.exp(-t / 0.028) + 0.048);

    // Vibrato: delayed onset, natural growth
    const vibGrow  = Math.max(0, Math.min(1, (t - 0.16) / 0.28));
    const vibDepth = vibGrow * (11.0 / 1200); // 11 cents max depth
    const vibrMult = 1 + vibDepth * Math.sin(vp);

    // Pitch sag: arrive at target pitch over first 40ms
    const sagCents  = 10.0 * Math.max(0, 1 - t / 0.040);
    const sagMult   = Math.pow(2, -sagCents / 1200);

    // FM tone + breath
    out[i] = Math.sin(cp + modIdx * Math.sin(mp)) * env * 0.70 + breath[i] * noiseAmp;

    cp += cInc * vibrMult * sagMult;
    mp += mInc;
    vp += vibInc;
    if (cp > 6.28318) cp -= 6.28318;
    if (mp > 6.28318) mp -= 6.28318;
    if (vp > 6.28318) vp -= 6.28318;
  }
  return out;
}

// ─── PCM dispatch ─────────────────────────────────────────────────────────────

function generatePCM(
  sr: number, freq: number, si: number, dur: number, inst: InstrumentType,
): Float32Array {
  switch (inst) {
    case "guitar":  return ksGenerate(sr, freq, si, dur);
    case "sitar":   return ksGenerateSitar(sr, freq, si, dur);
    case "piano":   return generatePiano(sr, freq, si, dur);
    case "bansuri": return generateBansuri(sr, freq, si, dur);
  }
}

// ─── Web Audio context + shared processing chain ─────────────────────────────

let webCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof AudioContext === "undefined" && !(window as any).webkitAudioContext) return null;
  if (!webCtx || webCtx.state === "closed") {
    const Ctor = typeof AudioContext !== "undefined" ? AudioContext : (window as any).webkitAudioContext;
    webCtx = new Ctor();
  }
  if (webCtx.state === "suspended") webCtx.resume();
  return webCtx;
}

let reverbBuffer: AudioBuffer | null = null;
let masterGain:   GainNode | null = null;

// ── Improved reverb IR: clear early reflections + warm diffuse tail ───────────
// Early reflections at 10/18/27/40/57ms give a sense of space without muddiness.
// The late tail uses lowpass-filtered noise starting at 80ms for warmth.
function buildReverbBuffer(ctx: AudioContext): AudioBuffer {
  if (reverbBuffer) return reverbBuffer;
  const sr  = ctx.sampleRate;
  const len = Math.floor(sr * 1.8);
  const buf = ctx.createBuffer(2, len, sr);

  for (let ch = 0; ch < 2; ch++) {
    const d    = buf.getChannelData(ch);
    const sign = ch === 0 ? 1 : -1; // slight stereo difference

    // Early reflections: discrete room echoes
    const early = [
      { ms: 10, amp: 0.62 },
      { ms: 18, amp: 0.48 },
      { ms: 27, amp: 0.38 },
      { ms: 40, amp: 0.28 },
      { ms: 57, amp: 0.20 },
      { ms: 78, amp: 0.14 },
    ];
    for (const { ms, amp } of early) {
      const idx = Math.floor((ms / 1000) * sr);
      const w2  = Math.floor(sr * 0.0018); // 1.8ms smear
      for (let j = -w2; j <= w2; j++) {
        const ii = idx + j;
        if (ii >= 0 && ii < len) {
          d[ii] += amp * sign * Math.exp(-Math.abs(j) / (sr * 0.0007)) *
                   (0.85 + Math.random() * 0.30);
        }
      }
    }

    // Diffuse late tail: lowpass-filtered noise from 80ms onward
    let lp = 0;
    const lpC = 1 - Math.exp(-2 * Math.PI * 2200 / sr); // 2.2 kHz lowpass
    const tailStart = Math.floor(sr * 0.080);
    for (let i = tailStart; i < len; i++) {
      const t = i / sr;
      lp      += lpC * (Math.random() * 2 - 1 - lp);
      d[i]    += lp * sign * Math.exp(-t * 4.8) * 0.38;
    }
  }

  reverbBuffer = buf;
  return buf;
}

// ── Master processing chain with compressor ────────────────────────────────────
// master gain → warm EQ → compressor → destination
//                       ↘ reverb send → reverb convolver → destination
let masterChainInput: GainNode | null = null;
let reverbSendGain:   GainNode | null = null;

function getSharedChain(ctx: AudioContext): GainNode {
  if (masterChainInput) return masterChainInput;

  masterChainInput = ctx.createGain();
  masterChainInput.gain.value = 1.0;

  // Gentle warmth boost in the low-mids
  const warmEq = ctx.createBiquadFilter();
  warmEq.type = "peaking";
  warmEq.frequency.value = 180;
  warmEq.gain.value = 2.8;
  warmEq.Q.value = 0.85;

  // Mild air presence boost
  const airEq = ctx.createBiquadFilter();
  airEq.type = "peaking";
  airEq.frequency.value = 5200;
  airEq.gain.value = 1.2;
  airEq.Q.value = 1.2;

  // High cut: remove any harshness above 8 kHz
  const highCut = ctx.createBiquadFilter();
  highCut.type = "lowpass";
  highCut.frequency.value = 8000;
  highCut.Q.value = 0.7;

  // Soft limiter / compressor: tames transients, glues the mix together
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value       = 8;
  comp.ratio.value      = 4.5;
  comp.attack.value     = 0.004;
  comp.release.value    = 0.14;

  // Reverb send
  const reverbNode = ctx.createConvolver();
  reverbNode.buffer    = buildReverbBuffer(ctx);
  reverbNode.normalize = true;
  reverbSendGain       = ctx.createGain();
  reverbSendGain.gain.value = 0.0; // set per-note in playWebNote

  // Chain: input → warmEq → airEq → highCut → comp → destination
  masterChainInput.connect(warmEq);
  warmEq.connect(airEq);
  airEq.connect(highCut);
  highCut.connect(comp);
  comp.connect(ctx.destination);

  // Reverb branch: tap before comp (pre-compression reverb sounds more natural)
  highCut.connect(reverbSendGain);
  reverbSendGain.connect(reverbNode);
  reverbNode.connect(ctx.destination);

  return masterChainInput;
}

// ── Per-instrument reverb send amounts ────────────────────────────────────────
const REVERB_SEND: Record<InstrumentType, number> = {
  guitar:  0.18, // medium room
  sitar:   0.26, // resonator body + sympathetic strings fill the room
  piano:   0.10, // dry — real piano recordings use little room reverb
  bansuri: 0.16, // natural room
};

// ── Buffer cache keyed by (instrument, stringIndex, frequency) ────────────────
const webCache = new Map<string, AudioBuffer>();

function getBuffer(ctx: AudioContext, freq: number, si: number, inst: InstrumentType): AudioBuffer {
  const key    = `${inst}:${si}:${freq.toFixed(2)}`;
  const cached = webCache.get(key);
  if (cached) return cached;
  const pcm = generatePCM(ctx.sampleRate, freq, si, 3.8, inst);
  const ab  = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
  ab.copyToChannel(pcm, 0);
  webCache.set(key, ab);
  return ab;
}

function playWebNote(
  ctx: AudioContext, freq: number, si: number, delaySeconds: number, inst: InstrumentType,
): void {
  const t0    = ctx.currentTime + delaySeconds;
  const chain = getSharedChain(ctx);
  const ab    = getBuffer(ctx, freq, si, inst);
  const src   = ctx.createBufferSource();
  src.buffer  = ab;

  // Per-note gain: set reverb send and volume together
  const gain = ctx.createGain();
  gain.gain.value =
    inst === "bansuri" ? 1.05 :
    inst === "piano"   ? 0.80 :
    inst === "sitar"   ? 0.55 + si * 0.035 :
    /* guitar */         0.50 + si * 0.040;

  // Update shared reverb send level for this instrument
  if (reverbSendGain) {
    reverbSendGain.gain.setTargetAtTime(REVERB_SEND[inst], t0, 0.01);
  }

  src.connect(gain);
  gain.connect(chain);
  src.start(t0);
}

export function playWebChord(notes: GuitarNote[]): void {
  const ctx  = getCtx();
  if (!ctx)  return;
  const inst    = currentInstrument;
  const playable = notes.filter((n) => n.fret !== "x");
  // Bansuri is monophonic
  const toPlay  = inst === "bansuri" ? playable.slice(0, 1) : playable;
  // Strum arpeggio for guitar/sitar; attack together for piano/bansuri
  const strum   = (inst === "guitar" || inst === "sitar") ? 0.013 : 0;
  toPlay.forEach((note, i) => {
    const freq = getFretFrequency(note.string, note.fret);
    if (freq > 0) playWebNote(ctx, freq, note.string, i * strum, inst);
  });
}

export function preloadWebSamples(): void {
  if (Platform.OS !== "web") return;
  const ctx = getCtx();
  if (!ctx) return;
  buildReverbBuffer(ctx);
  // Pre-generate guitar buffers for the most common positions
  const positions: [number, number][] = [
    [2, 3], [2, 5], [2, 7], [2, 8],
    [1, 3], [1, 4], [1, 6],
    [0, 3], [0, 5], [0, 6],
  ];
  positions.forEach(([si, fret]) => {
    const freq = getFretFrequency(si, fret);
    if (freq > 0) getBuffer(ctx, freq, si, "guitar");
  });
}

// ─── Native (iOS / Android) via expo-av ──────────────────────────────────────

let audioSessionConfigured = false;
async function ensureAudioSession(): Promise<void> {
  if (audioSessionConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });
    audioSessionConfigured = true;
  } catch {}
}

function pcmToWav(pcm: Float32Array, sr: number): string {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const norm = peak > 0 ? 0.85 / peak : 1;
  const N    = pcm.length;
  const size = 44 + N * 2;
  const ab   = new ArrayBuffer(size);
  const v    = new DataView(ab);
  const ws   = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ws(0, "RIFF"); v.setUint32(4, size - 8, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); ws(36, "data"); v.setUint32(40, N * 2, true);
  for (let i = 0; i < N; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i] * norm)) * 32767, true);
  }
  let bin = "";
  const bytes = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const nativeCache = new Map<string, Audio.Sound>();

async function playNativeNote(si: number, fret: number | "x" | "0"): Promise<void> {
  if (fret === "x") return;
  const freq = getFretFrequency(si, fret);
  if (freq <= 0) return;
  const inst     = currentInstrument;
  const cacheKey = `${inst}_${si}_${fret}`;
  try {
    await ensureAudioSession();
    let sound = nativeCache.get(cacheKey);
    if (!sound) {
      const pcm = generatePCM(22050, freq, si, 3.0, inst);
      const wav = pcmToWav(pcm, 22050);
      const { FileSystem } = await import("expo-file-system");
      const uri = `${FileSystem.cacheDirectory}${cacheKey}.wav`;
      await FileSystem.writeAsStringAsync(uri, wav, { encoding: "base64" as any });
      const { sound: s } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false, volume: 0.9 });
      nativeCache.set(cacheKey, s);
      sound = s;
    }
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (err) {
    console.warn("Audio error:", err);
  }
}

export async function playNativeChord(notes: GuitarNote[]): Promise<void> {
  const inst     = currentInstrument;
  const playable = notes.filter((n) => n.fret !== "x");
  const toPlay   = inst === "bansuri" ? playable.slice(0, 1) : playable;
  for (let i = 0; i < toPlay.length; i++) {
    if (i > 0) await new Promise<void>((r) => setTimeout(r, 13));
    playNativeNote(toPlay[i].string, toPlay[i].fret);
  }
}

// ─── Unified public API ───────────────────────────────────────────────────────

export async function playChord(notes: GuitarNote[]): Promise<void> {
  if (notes.length === 0) return;
  if (Platform.OS === "web") {
    playWebChord(notes);
  } else {
    await playNativeChord(notes);
  }
}

export function disposeAudio(): void {
  nativeCache.forEach((s) => s.unloadAsync().catch(() => {}));
  nativeCache.clear();
  webCache.clear();
  reverbBuffer     = null;
  masterGain       = null;
  masterChainInput = null;
  reverbSendGain   = null;
  webCtx           = null;
}
