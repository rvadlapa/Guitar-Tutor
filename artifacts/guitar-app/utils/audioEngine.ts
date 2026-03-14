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

// ─── Guitar — Karplus-Strong plucked string ───────────────────────────────────
//
// Seed a delay line with filtered noise, feed back through averaging + decay.
// Produces the characteristic bright attack / warm sustain of a plucked string.

function ksGenerate(
  sr: number, freq: number, si: number, dur: number,
): Float32Array {
  const N   = Math.floor(sr * dur);
  const P   = Math.max(2, Math.round(sr / freq));
  const buf = new Float32Array(P);
  for (let i = 0; i < P; i++) buf[i] = Math.random() * 2 - 1;

  // Lowpass the seed: lower strings = warmer pluck
  const w = 0.12 + (5 - si) * 0.08;
  for (let i = 1; i < P; i++) buf[i] = buf[i] * (1 - w) + buf[i - 1] * w;

  const decay = 0.9940 + si * 0.00085;
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

// ─── Sitar — KS + jawari buzz + sympathetic strings (taraf) ──────────────────
//
// Key differences from guitar:
//   • Brighter seed (less warmth filtering) for that metallic brightness
//   • tanh nonlinearity in the KS feedback loop simulates jawari — the slight
//     distortion of the string against the curved bridge that creates the sitar's
//     characteristic hum/buzz. It's strongest at high amplitude (attack) and fades
//     as the string decays, just like the real instrument.
//   • 3 quiet sympathetic strings (taraf) detuned by small ratios add shimmer.

function ksGenerateSitar(
  sr: number, freq: number, si: number, dur: number,
): Float32Array {
  const N   = Math.floor(sr * dur);
  const P   = Math.max(2, Math.round(sr / freq));
  const buf = new Float32Array(P);
  for (let i = 0; i < P; i++) buf[i] = Math.random() * 2 - 1;

  // Much less warmth → brighter, more metallic attack
  const w = 0.03 + (5 - si) * 0.025;
  for (let i = 1; i < P; i++) buf[i] = buf[i] * (1 - w) + buf[i - 1] * w;

  // Longer decay (sitar strings are longer)
  const decay = 0.9975 + si * 0.00045;
  const out   = new Float32Array(N);
  let ptr = 0;
  for (let i = 0; i < N; i++) {
    const nxt    = (ptr + 1) % P;
    out[i]       = buf[ptr];
    // Jawari: tanh nonlinearity adds harmonics that naturally fade as amplitude drops
    const raw    = 0.5 * (buf[ptr] + buf[nxt]) * decay;
    buf[ptr]     = Math.tanh(raw * 2.4) / 2.4;
    ptr          = nxt;
  }

  // Taraf sympathetic strings: detuned very slightly, very quiet, long decay
  const taraf = [
    { ratio: 1.0018, amp: 0.09 },
    { ratio: 0.9988, amp: 0.06 },
    { ratio: 1.0035, amp: 0.04 },
  ];
  for (const t of taraf) {
    const tP  = Math.max(2, Math.round(sr / (freq * t.ratio)));
    const tBuf = new Float32Array(tP);
    for (let i = 0; i < tP; i++) tBuf[i] = (Math.random() * 2 - 1) * 0.35;
    let tp = 0;
    for (let i = 0; i < N; i++) {
      const tn   = (tp + 1) % tP;
      out[i]    += tBuf[tp] * t.amp;
      tBuf[tp]   = 0.5 * (tBuf[tp] + tBuf[tn]) * 0.9982;
      tp         = tn;
    }
  }
  return out;
}

// ─── Piano — additive harmonic synthesis ─────────────────────────────────────
//
// Sum of pure sine partials with piano-like amplitude and decay profiles.
// Fundamental decays very slowly; high harmonics die quickly. No pluck noise —
// a very brief, quiet hammer transient instead.

function generatePiano(
  sr: number, freq: number, _si: number, dur: number,
): Float32Array {
  const N   = Math.floor(sr * dur);
  const out = new Float32Array(N);
  const B   = 0.00008; // slight inharmonicity (much less than guitar)

  const harmonics = [
    { n: 1, amp: 0.70, dr: 0.45  },
    { n: 2, amp: 0.40, dr: 1.60  },
    { n: 3, amp: 0.24, dr: 3.20  },
    { n: 4, amp: 0.14, dr: 5.80  },
    { n: 5, amp: 0.08, dr: 9.00  },
    { n: 6, amp: 0.04, dr: 13.5  },
    { n: 7, amp: 0.02, dr: 19.0  },
    { n: 8, amp: 0.01, dr: 26.0  },
  ];

  // Very quiet hammer transient (piano ≠ plucked)
  const hamLen = Math.floor(sr * 0.006);
  for (let i = 0; i < hamLen; i++) {
    out[i] += (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.0018)) * 0.045;
  }

  for (const { n, amp, dr } of harmonics) {
    const fn = freq * n * Math.sqrt(1 + B * n * n);
    if (fn >= sr / 2) continue;
    const omega = (2 * Math.PI * fn) / sr;
    const g     = amp * 0.26;
    for (let i = 0; i < N; i++) {
      const env = Math.exp(-(i / sr) * dr);
      if (env < 0.0004) break;
      out[i] += Math.sin(omega * i) * env * g;
    }
  }
  return out;
}

// ─── Bansuri — FM synthesis (Indian bamboo flute) ───────────────────────────
//
// Two-operator FM: carrier at f modulated by a sine at 2f (modulation index 0.8).
// This gives the characteristic breathy, woody flute tone.
// Breath envelope: 35ms attack. Vibrato (5.5 Hz) onsets at 200ms and grows
// slowly, just as a real flautist adds vibrato mid-note.

function generateBansuri(
  sr: number, freq: number, _si: number, dur: number,
): Float32Array {
  const N   = Math.floor(sr * dur);
  const out = new Float32Array(N);

  const modFreq  = freq * 2;   // modulator at octave above carrier
  const modIdx   = 0.82;       // FM depth — controls breathiness
  const cInc     = (2 * Math.PI * freq)    / sr;
  const mInc     = (2 * Math.PI * modFreq) / sr;
  const vibInc   = (2 * Math.PI * 5.5)     / sr; // 5.5 Hz vibrato

  let cp = 0, mp = 0, vp = 0;

  for (let i = 0; i < N; i++) {
    const t = i / sr;

    // Breath amplitude: 35ms attack, tail fade in last 25% of note
    const attack  = Math.min(1, t / 0.035);
    const sustain = 1 - Math.max(0, (t - dur * 0.75) / (dur * 0.25));
    const env     = attack * Math.max(0, sustain) * 0.68;

    // Vibrato: onset after 200ms, grows to 7 cents over the following 200ms
    const vibGrow  = Math.max(0, Math.min(1, (t - 0.2) / 0.2));
    const vibDepth = vibGrow * (7 / 1200);
    const vibratoMult = 1 + vibDepth * Math.sin(vp);

    // FM output
    out[i] = env * Math.sin(cp + modIdx * Math.sin(mp));

    // Advance phases
    cp += cInc * vibratoMult;
    mp += mInc;
    vp += vibInc;

    if (cp > 6.2832) cp -= 6.2832;
    if (mp > 6.2832) mp -= 6.2832;
    if (vp > 6.2832) vp -= 6.2832;
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

// ─── Web Audio ────────────────────────────────────────────────────────────────

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
let reverbNode:   ConvolverNode | null = null;
let reverbGain:   GainNode | null = null;
let masterOut:    GainNode | null = null;

function buildReverbBuffer(ctx: AudioContext): AudioBuffer {
  if (reverbBuffer) return reverbBuffer;
  const sr  = ctx.sampleRate;
  const len = Math.floor(sr * 0.9);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t     = i / sr;
      const early = i < sr * 0.025 ? Math.exp(-t * 90) * 1.1 : 0;
      const tail  = Math.exp(-t * 8.0);
      d[i] = (Math.random() * 2 - 1) * (early + tail * 0.30);
    }
  }
  reverbBuffer = buf;
  return buf;
}

function getSharedChain(ctx: AudioContext): AudioNode {
  if (masterOut) return masterOut;
  masterOut = ctx.createGain();
  masterOut.gain.value = 1.0;

  const warmEq = ctx.createBiquadFilter();
  warmEq.type = "peaking";
  warmEq.frequency.value = 200;
  warmEq.gain.value = 3.0;
  warmEq.Q.value = 1.0;

  const highCut = ctx.createBiquadFilter();
  highCut.type = "lowpass";
  highCut.frequency.value = 6500;

  reverbNode = ctx.createConvolver();
  reverbNode.buffer = buildReverbBuffer(ctx);
  reverbNode.normalize = true;
  reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.20;

  masterOut.connect(warmEq);
  warmEq.connect(highCut);
  highCut.connect(ctx.destination);
  highCut.connect(reverbGain);
  reverbGain.connect(reverbNode);
  reverbNode.connect(ctx.destination);
  return masterOut;
}

// Buffer cache keyed by (instrument, stringIndex, frequency)
const webCache = new Map<string, AudioBuffer>();

function getBuffer(
  ctx: AudioContext, freq: number, si: number, inst: InstrumentType,
): AudioBuffer {
  const key    = `${inst}:${si}:${freq.toFixed(2)}`;
  const cached = webCache.get(key);
  if (cached) return cached;
  const pcm = generatePCM(ctx.sampleRate, freq, si, 3.5, inst);
  const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
  buf.copyToChannel(pcm, 0);
  webCache.set(key, buf);
  return buf;
}

function playWebNote(
  ctx: AudioContext, freq: number, si: number,
  delaySeconds: number, inst: InstrumentType,
): void {
  const t0    = ctx.currentTime + delaySeconds;
  const chain = getSharedChain(ctx);
  const buf   = getBuffer(ctx, freq, si, inst);
  const src   = ctx.createBufferSource();
  src.buffer  = buf;

  const gain  = ctx.createGain();
  // Per-instrument volume trim
  gain.gain.value =
    inst === "bansuri" ? 1.10 :
    inst === "piano"   ? 0.85 :
    0.52 + si * 0.04; // guitar / sitar — lower strings a touch louder

  src.connect(gain);
  gain.connect(chain);
  src.start(t0);
}

export function playWebChord(notes: GuitarNote[]): void {
  const ctx  = getCtx();
  if (!ctx)  return;
  const inst = currentInstrument;
  const playable = notes.filter((n) => n.fret !== "x");
  // Bansuri is monophonic — only play the first note
  const toPlay = inst === "bansuri" ? playable.slice(0, 1) : playable;
  // Sitar and guitar strum in a tiny arpeggio; piano/bansuri play together
  const delay  = (inst === "guitar" || inst === "sitar") ? 0.014 : 0;
  toPlay.forEach((note, i) => {
    const freq = getFretFrequency(note.string, note.fret);
    if (freq > 0) playWebNote(ctx, freq, note.string, i * delay, inst);
  });
}

export function preloadWebSamples(): void {
  if (Platform.OS !== "web") return;
  const ctx = getCtx();
  if (!ctx) return;
  buildReverbBuffer(ctx);
  // Pre-warm guitar buffers for the most common cross-string notes
  const notes: [number, number][] = [
    [2, 3], [2, 5], [2, 7], [2, 8],
    [1, 3], [1, 4], [1, 6],
    [0, 3], [0, 5], [0, 6],
  ];
  notes.forEach(([si, fret]) => {
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
  const buf  = new ArrayBuffer(size);
  const v    = new DataView(buf);
  const ws   = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, size - 8, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); ws(36, "data"); v.setUint32(40, N * 2, true);
  for (let i = 0; i < N; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i] * norm)) * 32767, true);
  }
  let bin = "";
  const bytes = new Uint8Array(buf);
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
      const pcm = generatePCM(22050, freq, si, 2.5, inst);
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
  const inst    = currentInstrument;
  const playable = notes.filter((n) => n.fret !== "x");
  const toPlay   = inst === "bansuri" ? playable.slice(0, 1) : playable;
  for (let i = 0; i < toPlay.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 14));
    playNativeNote(toPlay[i].string, toPlay[i].fret);
  }
}

// ─── Unified API ─────────────────────────────────────────────────────────────

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
  reverbBuffer = null;
  reverbNode   = null;
  reverbGain   = null;
  masterOut    = null;
  webCtx       = null;
}
