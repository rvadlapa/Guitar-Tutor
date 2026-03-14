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
  // Convert Hz → nearest MIDI note name (e.g. "E2", "A3", "D#4")
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const clamped = Math.max(28, Math.min(88, midi)); // guitar range E2–E6
  const NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const octave = Math.floor(clamped / 12) - 1;
  const name = NAMES[clamped % 12];
  return `${name}${octave}`;
}

// ─── Web Audio via Tone.js ────────────────────────────────────────────────────
// Real nylon acoustic guitar recordings, auto pitch-shifted to every note.

// Available recorded notes in the soundfont (Tone.js interpolates the rest)
const GUITAR_URLS: Record<string, string> = {
  "A2": "A2.ogg", "A3": "A3.ogg", "A4": "A4.ogg", "A5": "A5.ogg",
  "B2": "B2.ogg", "B3": "B3.ogg", "B4": "B4.ogg",
  "C3": "C3.ogg", "C4": "C4.ogg", "C5": "C5.ogg",
  "D3": "D3.ogg", "D4": "D4.ogg", "D5": "D5.ogg",
  "E2": "E2.ogg", "E3": "E3.ogg", "E4": "E4.ogg",
  "F2": "F2.ogg", "F3": "F3.ogg", "F4": "F4.ogg",
  "G2": "G2.ogg", "G3": "G3.ogg", "G4": "G4.ogg",
};

const SAMPLE_BASE =
  "https://cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@v1.2.0/samples/guitar-acoustic/";

// Tone.js sampler — created once and reused
let sampler: any = null;
let samplerState: "idle" | "loading" | "ready" | "failed" = "idle";
const samplerReadyCallbacks: (() => void)[] = [];

async function initSampler(): Promise<boolean> {
  if (samplerState === "ready") return true;
  if (samplerState === "failed") return false;

  if (samplerState === "loading") {
    return new Promise((resolve) => {
      samplerReadyCallbacks.push(() => resolve(samplerState === "ready"));
    });
  }

  samplerState = "loading";

  try {
    const Tone = await import("tone");
    await Tone.start(); // resume AudioContext (required after user gesture)

    sampler = new Tone.Sampler({
      urls: GUITAR_URLS,
      baseUrl: SAMPLE_BASE,
      release: 1.2,
      onload: () => {
        samplerState = "ready";
        samplerReadyCallbacks.forEach((cb) => cb());
        samplerReadyCallbacks.length = 0;
      },
      onerror: () => {
        samplerState = "failed";
        samplerReadyCallbacks.forEach((cb) => cb());
        samplerReadyCallbacks.length = 0;
      },
    }).toDestination();

    // Wait up to 8 seconds for samples to load
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 8000);
      samplerReadyCallbacks.push(() => {
        clearTimeout(timeout);
        resolve();
      });
    });

    return samplerState === "ready";
  } catch {
    samplerState = "failed";
    return false;
  }
}

export function playWebChord(notes: GuitarNote[]): void {
  const playable = notes.filter((n) => n.fret !== "x");

  initSampler().then((ready) => {
    if (!ready || !sampler) {
      // Sampler failed to load — use fallback synthesis
      playable.forEach((note, i) => {
        const freq = getFretFrequency(note.string, note.fret);
        if (freq > 0) setTimeout(() => playFallbackNote(freq), i * 14);
      });
      return;
    }

    playable.forEach((note, i) => {
      const freq = getFretFrequency(note.string, note.fret);
      if (freq <= 0) return;
      const noteName = freqToNoteName(freq);
      const delay = (i * 0.014); // slight strum feel
      try {
        sampler.triggerAttackRelease(noteName, "2n", `+${delay}`);
      } catch {
        // If sampler fails on a particular note, skip silently
      }
    });
  });
}

/** Pre-warm: start loading samples immediately on app load */
export function preloadWebSamples(): void {
  if (Platform.OS !== "web") return;
  initSampler();
}

// ─── Fallback synthesis (Karplus-Strong) ─────────────────────────────────────
// Only used if the guitar sample CDN is unreachable.

function playFallbackNote(frequency: number): void {
  if (typeof AudioContext === "undefined" && typeof (window as any).webkitAudioContext === "undefined") return;
  const CtxClass = AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = (window as any).__fallbackCtx ||
    ((window as any).__fallbackCtx = new CtxClass());
  if (ctx.state === "suspended") ctx.resume();

  const sampleRate = ctx.sampleRate;
  const duration = 2.0;
  const totalSamples = Math.floor(sampleRate * duration);
  const delayLen = Math.max(2, Math.round(sampleRate / frequency));

  const audioBuf = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = audioBuf.getChannelData(0);
  const dl = new Float32Array(delayLen);
  for (let i = 0; i < delayLen; i++) dl[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < totalSamples; i++) {
    const next = (idx + 1) % delayLen;
    data[i] = dl[idx];
    dl[idx] = 0.4978 * (dl[idx] + dl[next]);
    idx = next;
  }
  const src = ctx.createBufferSource();
  src.buffer = audioBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.55, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
  src.connect(g);
  g.connect(ctx.destination);
  src.start();
  src.stop(ctx.currentTime + 2.0);
}

// ─── Native Audio (iOS / Android) via expo-av ─────────────────────────────────
// Streams guitar samples directly from the CDN — no local file needed.

// Nearest sample note (only the ones we have in the soundfont)
const SAMPLE_MIDI_NOTES = [
  40, 42, 44, 45, 47, 48, 50, 52, 53, 55, 56, 57, 59,
  60, 62, 64, 65, 67, 69, 71, 72, 74, 76,
];

function nearestSampleMidi(targetMidi: number): number {
  return SAMPLE_MIDI_NOTES.reduce((best, m) =>
    Math.abs(m - targetMidi) < Math.abs(best - targetMidi) ? m : best
  );
}

function midiToOggName(midi: number): string {
  const NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const octave = Math.floor(midi / 12) - 1;
  const name = NAMES[midi % 12];
  return `${name}${octave}.ogg`;
}

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

const nativeSoundCache = new Map<number, Audio.Sound>();

async function playNativeNote(stringIndex: number, fret: number | "x" | "0"): Promise<void> {
  if (fret === "x") return;
  const freq = getFretFrequency(stringIndex, fret);
  if (freq <= 0) return;

  const targetMidi = Math.round(69 + 12 * Math.log2(freq / 440));
  const midi = nearestSampleMidi(targetMidi);

  try {
    await ensureAudioSession();
    let sound = nativeSoundCache.get(midi);
    if (!sound) {
      const uri = `${SAMPLE_BASE}${midiToOggName(midi)}`;
      const { sound: s } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false, volume: 0.85 }
      );
      nativeSoundCache.set(midi, s);
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

// ─── Unified API ──────────────────────────────────────────────────────────────

export async function playChord(notes: GuitarNote[]): Promise<void> {
  if (notes.length === 0) return;
  if (Platform.OS === "web") {
    playWebChord(notes);
  } else {
    await playNativeChord(notes);
  }
}

export function disposeAudio(): void {
  nativeSoundCache.forEach((s) => s.unloadAsync().catch(() => {}));
  nativeSoundCache.clear();
  sampler = null;
  samplerState = "idle";
}
