import { Audio } from "expo-av";
import { Platform } from "react-native";
import { GuitarNote } from "@/context/TabContext";

// ─── Frequency helpers ────────────────────────────────────────────────────────

const OPEN_STRING_FREQS = [329.63, 246.94, 196.0, 146.83, 110.0, 82.41];

function getFretFrequency(stringIndex: number, fret: number | "x" | "0"): number {
  if (fret === "x") return 0;
  const fretNum = fret === "0" ? 0 : (fret as number);
  return OPEN_STRING_FREQS[stringIndex] * Math.pow(2, fretNum / 12);
}

// ─── Karplus-Strong plucked string synthesis ─────────────────────────────────
//
// Seed a short delay line (length = sample_rate / frequency) with filtered
// white noise, then iterate: output the front sample, replace it with the
// average of the two front samples times a decay constant.
// This one feedback loop naturally produces: sharp attack (from the noise),
// pitch-accurate sustain (from the delay period), and exponential decay
// (from the averaging filter acting as a low-pass, losing energy each cycle).
// The result is unmistakably "plucked string" and nothing like a piano.

function ksGenerate(
  sampleRate: number,
  frequency: number,
  stringIndex: number,
  durationSec: number,
): Float32Array {
  const numSamples = Math.floor(sampleRate * durationSec);
  const period = Math.max(2, Math.round(sampleRate / frequency));

  // Seed the delay line with white noise.
  const delayLine = new Float32Array(period);
  for (let i = 0; i < period; i++) delayLine[i] = Math.random() * 2 - 1;

  // Lowpass-filter the seed noise: higher strings → brighter, lower → warmer.
  // warmth = fraction of one-pole IIR applied to the initial burst.
  const warmth = 0.12 + (5 - stringIndex) * 0.08; // high-e→0.12 … low-E→0.52
  for (let i = 1; i < period; i++) {
    delayLine[i] = delayLine[i] * (1 - warmth) + delayLine[i - 1] * warmth;
  }

  // Per-string decay constant: lower/thicker strings ring longer.
  // Empirically tuned: high-e ≈ 0.994, low-E ≈ 0.9985.
  const decay = 0.9940 + stringIndex * 0.00085;

  const out = new Float32Array(numSamples);
  let ptr = 0;
  for (let i = 0; i < numSamples; i++) {
    const nextPtr = (ptr + 1) % period;
    out[i] = delayLine[ptr];
    delayLine[ptr] = 0.5 * (delayLine[ptr] + delayLine[nextPtr]) * decay;
    ptr = nextPtr;
  }
  return out;
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

// Shared guitar-body reverb — synthetic impulse response for a small wooden box.
let reverbBuffer: AudioBuffer | null = null;
let reverbNode: ConvolverNode | null = null;
let reverbGain: GainNode | null = null;
let masterOut: GainNode | null = null;

function buildReverbBuffer(ctx: AudioContext): AudioBuffer {
  if (reverbBuffer) return reverbBuffer;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.85);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
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

  // Body warmth: gentle boost at 180 Hz (guitar body resonance)
  const warmEq = ctx.createBiquadFilter();
  warmEq.type = "peaking";
  warmEq.frequency.value = 180;
  warmEq.gain.value = 4.0;
  warmEq.Q.value = 1.0;

  // High cut at 5 kHz — removes the "digital" harshness
  const highCut = ctx.createBiquadFilter();
  highCut.type = "lowpass";
  highCut.frequency.value = 5000;

  // Reverb wet path (22% wet — guitar body ambience, not hall reverb)
  reverbNode = ctx.createConvolver();
  reverbNode.buffer = buildReverbBuffer(ctx);
  reverbNode.normalize = true;
  reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.22;

  masterOut.connect(warmEq);
  warmEq.connect(highCut);
  highCut.connect(ctx.destination);     // dry path
  highCut.connect(reverbGain);          // send to reverb
  reverbGain.connect(reverbNode);
  reverbNode.connect(ctx.destination);  // wet path

  return masterOut;
}

// KS buffer cache: avoids re-generating the same note every playback.
const ksWebCache = new Map<string, AudioBuffer>();

function getKSBuffer(ctx: AudioContext, frequency: number, stringIndex: number): AudioBuffer {
  const key = `${stringIndex}:${frequency.toFixed(2)}`;
  const cached = ksWebCache.get(key);
  if (cached) return cached;

  const pcm = ksGenerate(ctx.sampleRate, frequency, stringIndex, 3.0);
  const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
  buf.copyToChannel(pcm, 0);
  ksWebCache.set(key, buf);
  return buf;
}

function playWebNote(
  ctx: AudioContext,
  frequency: number,
  stringIndex: number,
  delaySeconds: number,
): void {
  const t0 = ctx.currentTime + delaySeconds;
  const chain = getSharedChain(ctx);

  const buf = getKSBuffer(ctx, frequency, stringIndex);
  const src = ctx.createBufferSource();
  src.buffer = buf;

  const gain = ctx.createGain();
  // Lower strings slightly louder in a mix (compensates for less high-frequency energy)
  gain.gain.value = 0.52 + stringIndex * 0.04;

  src.connect(gain);
  gain.connect(chain);
  src.start(t0);
}

export function playWebChord(notes: GuitarNote[]): void {
  const ctx = getCtx();
  if (!ctx) return;
  const playable = notes.filter((n) => n.fret !== "x");
  playable.forEach((note, i) => {
    const freq = getFretFrequency(note.string, note.fret);
    if (freq > 0) playWebNote(ctx, freq, note.string, i * 0.014);
  });
}

export function preloadWebSamples(): void {
  if (Platform.OS !== "web") return;
  const ctx = getCtx();
  if (!ctx) return;
  buildReverbBuffer(ctx);
  // Pre-generate KS buffers for the common cross-string position notes
  const preload: [number, number][] = [
    [2, 3], [2, 5], [2, 7], [2, 8], [2, 10],  // G string
    [1, 3], [1, 4], [1, 6], [1, 8], [1, 10],  // B string
    [0, 3], [0, 5], [0, 6], [0, 8], [0, 10],  // e string
    [3, 3], [3, 5], [3, 7], [3, 8],            // D string
    [4, 1], [4, 3], [4, 5], [4, 6],            // A string
    [5, 6],                                     // low E string
  ];
  preload.forEach(([si, fret]) => {
    const freq = getFretFrequency(si, fret);
    if (freq > 0) getKSBuffer(ctx, freq, si);
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

function ksToWav(pcm: Float32Array, sampleRate: number): string {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const norm = peak > 0 ? 0.85 / peak : 1;

  const numSamples = pcm.length;
  const fileSize = 44 + numSamples * 2;
  const buf = new ArrayBuffer(fileSize);
  const v = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, fileSize - 8, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); ws(36, "data"); v.setUint32(40, numSamples * 2, true);
  for (let i = 0; i < numSamples; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i] * norm)) * 32767, true);
  }
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const nativeCache = new Map<string, Audio.Sound>();

async function playNativeNote(stringIndex: number, fret: number | "x" | "0"): Promise<void> {
  if (fret === "x") return;
  const freq = getFretFrequency(stringIndex, fret);
  if (freq <= 0) return;
  const cacheKey = `ks_${stringIndex}_${fret}`;
  try {
    await ensureAudioSession();
    let sound = nativeCache.get(cacheKey);
    if (!sound) {
      const pcm = ksGenerate(22050, freq, stringIndex, 2.5);
      const wav = ksToWav(pcm, 22050);
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
  const playable = notes.filter((n) => n.fret !== "x");
  for (let i = 0; i < playable.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 14));
    playNativeNote(playable[i].string, playable[i].fret);
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
  ksWebCache.clear();
  reverbBuffer = null;
  reverbNode   = null;
  reverbGain   = null;
  masterOut    = null;
  webCtx       = null;
}
