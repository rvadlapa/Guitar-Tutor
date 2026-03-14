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

function freqToNoteName(freq: number): string {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const clamped = Math.max(28, Math.min(96, midi));
  const NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const octave = Math.floor(clamped / 12) - 1;
  return `${NAMES[clamped % 12]}${octave}`;
}

// ─── Web: Tone.js PluckSynth (built-in, no CDN needed) ───────────────────────
// PluckSynth implements Karplus-Strong with Tone.js's own tuning.
// We run 6 independent synths — one per guitar string — so polyphony works
// correctly and lower strings ring longer than higher ones (like a real guitar).

type PluckSynthInstance = any;

interface StringSynth {
  synth: PluckSynthInstance;
  reverb: any;
  eq: any;
}

let stringSynths: StringSynth[] | null = null;
let toneReady = false;
let toneInitialising = false;
const toneCallbacks: (() => void)[] = [];

async function ensureTone(): Promise<boolean> {
  if (toneReady) return true;
  if (toneInitialising) {
    return new Promise((resolve) => {
      toneCallbacks.push(() => resolve(toneReady));
    });
  }
  toneInitialising = true;

  try {
    const Tone = await import("tone");
    await Tone.start();

    // Shared reverb — small room, like an acoustic guitar body
    const reverb = new Tone.Reverb({ decay: 1.4, wet: 0.22 });
    await reverb.ready;
    reverb.toDestination();

    // Master EQ: boost warmth (200 Hz), cut harshness (3–5 kHz)
    const eq = new Tone.EQ3({
      low: 4,
      mid: -2,
      high: -6,
      lowFrequency: 250,
      highFrequency: 3200,
    }).connect(reverb);

    // String-specific parameters (index 0 = high e, 5 = low E)
    // Lower strings: higher resonance (longer ring), lower dampening
    const stringParams = [
      { attackNoise: 2.2, dampening: 4800, resonance: 0.980 }, // e  (high)
      { attackNoise: 2.0, dampening: 4400, resonance: 0.982 }, // B
      { attackNoise: 1.8, dampening: 3900, resonance: 0.984 }, // G
      { attackNoise: 1.6, dampening: 3400, resonance: 0.986 }, // D
      { attackNoise: 1.4, dampening: 2800, resonance: 0.988 }, // A
      { attackNoise: 1.2, dampening: 2200, resonance: 0.990 }, // E  (low)
    ];

    stringSynths = stringParams.map((p) => {
      const synth = new Tone.PluckSynth({
        attackNoise: p.attackNoise,
        dampening: p.dampening,
        resonance: p.resonance,
      }).connect(eq);
      return { synth, reverb, eq };
    });

    toneReady = true;
  } catch (e) {
    console.warn("Tone.js init failed:", e);
    toneReady = false;
  }

  toneInitialising = false;
  toneCallbacks.forEach((cb) => cb());
  toneCallbacks.length = 0;
  return toneReady;
}

export function playWebChord(notes: GuitarNote[]): void {
  const playable = notes.filter((n) => n.fret !== "x");
  if (playable.length === 0) return;

  ensureTone().then((ready) => {
    if (!ready || !stringSynths) {
      // Last-resort fallback
      playable.forEach((note, i) => {
        const freq = getFretFrequency(note.string, note.fret);
        if (freq > 0) setTimeout(() => playFallback(freq), i * 14);
      });
      return;
    }

    playable.forEach((note, i) => {
      const freq = getFretFrequency(note.string, note.fret);
      if (freq <= 0) return;
      const noteName = freqToNoteName(freq);
      const stringIdx = Math.max(0, Math.min(5, note.string));
      const delay = i * 0.015; // strum timing
      try {
        stringSynths![stringIdx].synth.triggerAttack(noteName, `+${delay}`);
      } catch {/* ignore */}
    });
  });
}

export function preloadWebSamples(): void {
  if (Platform.OS !== "web") return;
  ensureTone();
}

// ─── Absolute fallback (no Tone.js) ──────────────────────────────────────────

function playFallback(frequency: number): void {
  try {
    const CtxClass = typeof AudioContext !== "undefined"
      ? AudioContext : (window as any).webkitAudioContext;
    if (!CtxClass) return;
    const ctx: AudioContext = (window as any).__fbCtx || ((window as any).__fbCtx = new CtxClass());
    if (ctx.state === "suspended") ctx.resume();

    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.8);
    const N = Math.max(2, Math.round(sr / frequency));
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const dl = new Float32Array(N);
    for (let i = 0; i < N; i++) dl[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const next = (idx + 1) % N;
      d[i] = dl[idx];
      dl[idx] = 0.498 * (dl[idx] + dl[next]);
      idx = next;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.6);
    src.connect(g); g.connect(ctx.destination);
    src.start(); src.stop(ctx.currentTime + 1.8);
  } catch { /* ignore */ }
}

// ─── Native Audio (iOS / Android) via expo-av ────────────────────────────────
// Uses the same approach: generateWavBase64 with improved KS synthesis.

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

function generateGuitarWav(frequency: number, stringIndex: number): string {
  const sampleRate = 22050;
  const durationMs = 2200;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const N = Math.max(2, Math.round(sampleRate / frequency));

  // String-tuned resonance: lower strings ring longer
  const resonance = 0.980 + stringIndex * 0.002;

  const dl = new Float32Array(N);
  // Band-limited noise initialisation (simulate pick)
  let lpPrev = 0;
  for (let i = 0; i < N; i++) {
    const noise = Math.random() * 2 - 1;
    lpPrev = 0.4 * lpPrev + 0.6 * noise;
    dl[i] = lpPrev;
  }

  const samples = new Float32Array(numSamples);
  let idx = 0;
  for (let i = 0; i < numSamples; i++) {
    const next = (idx + 1) % N;
    samples[i] = dl[idx];
    dl[idx] = resonance * 0.5 * (dl[idx] + dl[next]);
    idx = next;
  }

  // Build WAV
  const blockAlign = 2;
  const fileSize = 44 + numSamples * blockAlign;
  const buf = new ArrayBuffer(fileSize);
  const v = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, fileSize - 8, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true); v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true); ws(36, "data"); v.setUint32(40, numSamples * blockAlign, true);
  for (let i = 0; i < numSamples; i++) {
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
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

  const cacheKey = `${stringIndex}_${fret}`;
  try {
    await ensureAudioSession();
    let sound = nativeCache.get(cacheKey);
    if (!sound) {
      const wav = generateGuitarWav(freq, stringIndex);
      const { FileSystem } = await import("expo-file-system");
      const uri = `${FileSystem.cacheDirectory}gtr_${cacheKey}.wav`;
      await FileSystem.writeAsStringAsync(uri, wav, { encoding: FileSystem.EncodingType.Base64 as any });
      const { sound: s } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false, volume: 0.85 });
      nativeCache.set(cacheKey, s);
      sound = s;
    }
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (err) {
    console.warn("Native audio error:", err);
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
  stringSynths = null;
  toneReady = false;
  toneInitialising = false;
}
