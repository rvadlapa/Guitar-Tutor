import { Audio } from "expo-av";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { GuitarNote } from "@/context/TabContext";

// ─── Frequency helpers ────────────────────────────────────────────────────────

const OPEN_STRING_FREQS = [329.63, 246.94, 196.0, 146.83, 110.0, 82.41];

function getFretFrequency(stringIndex: number, fret: number | "x" | "0"): number {
  if (fret === "x") return 0;
  const fretNum = fret === "0" ? 0 : (fret as number);
  return OPEN_STRING_FREQS[stringIndex] * Math.pow(2, fretNum / 12);
}

function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

// Soundfont note name: MIDI 40 = E2, 41 = F2, …
// Uses flats rather than sharps to match the CDN file naming
function midiToSoundfontName(midi: number): string {
  const NAMES = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
  const semitone = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NAMES[semitone]}${octave}`;
}

// Available MIDI notes in the nylon guitar soundfont (every semitone, E2–B4)
const SAMPLE_MIDI_MIN = 40; // E2
const SAMPLE_MIDI_MAX = 83; // B5

// CDN: gleitz/midi-js-soundfonts — GitHub Pages sets CORS: *
const SAMPLE_BASE =
  "https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_guitar_nylon-mp3";

function sampleUrl(midi: number): string {
  return `${SAMPLE_BASE}/${midiToSoundfontName(midi)}.mp3`;
}

// ─── Web Audio (browser / Expo Web) ──────────────────────────────────────────

let webCtx: AudioContext | null = null;

function getWebCtx(): AudioContext | null {
  if (typeof AudioContext === "undefined" && typeof (window as any).webkitAudioContext === "undefined")
    return null;
  if (!webCtx || webCtx.state === "closed")
    webCtx = new (AudioContext || (window as any).webkitAudioContext)();
  if (webCtx.state === "suspended") webCtx.resume();
  return webCtx;
}

// Cache decoded AudioBuffers so each sample is fetched only once
const webBufCache = new Map<number, AudioBuffer | "loading" | null>();

async function fetchWebSample(ctx: AudioContext, midi: number): Promise<AudioBuffer | null> {
  const cached = webBufCache.get(midi);
  if (cached === "loading") {
    // Wait until it resolves
    return new Promise((resolve) => {
      const poll = setInterval(() => {
        const v = webBufCache.get(midi);
        if (v !== "loading") {
          clearInterval(poll);
          resolve(v instanceof AudioBuffer ? v : null);
        }
      }, 50);
    });
  }
  if (cached !== undefined) return cached instanceof AudioBuffer ? cached : null;

  webBufCache.set(midi, "loading");
  try {
    const res = await fetch(sampleUrl(midi));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    webBufCache.set(midi, buf);
    return buf;
  } catch {
    webBufCache.set(midi, null);
    return null;
  }
}

function playWebBuffer(
  ctx: AudioContext,
  buf: AudioBuffer,
  playbackRate: number,
  delaySeconds: number
): void {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = playbackRate; // pitch-shift to exact frequency

  // Gentle body resonance
  const eq = ctx.createBiquadFilter();
  eq.type = "peaking";
  eq.frequency.value = 280;
  eq.gain.value = 3;
  eq.Q.value = 1.0;

  const gain = ctx.createGain();
  const t0 = ctx.currentTime + delaySeconds;
  gain.gain.setValueAtTime(0.7, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 2.5);

  src.connect(eq);
  eq.connect(gain);
  gain.connect(ctx.destination);

  src.start(t0);
}

async function playWebNote(frequency: number, delaySeconds: number): Promise<void> {
  const ctx = getWebCtx();
  if (!ctx || frequency <= 0) return;

  const targetMidi = freqToMidi(frequency);
  // Round to nearest semitone within guitar sample range
  const sampleMidi = Math.max(SAMPLE_MIDI_MIN, Math.min(SAMPLE_MIDI_MAX, Math.round(targetMidi)));
  // playbackRate shifts the sample to exact pitch
  const ratio = Math.pow(2, (targetMidi - sampleMidi) / 12);

  const buf = await fetchWebSample(ctx, sampleMidi);
  if (!buf) {
    // Fallback: Karplus-Strong if sample unavailable
    playKarplusStrongWeb(ctx, frequency, delaySeconds);
    return;
  }
  playWebBuffer(ctx, buf, ratio, delaySeconds);
}

// Karplus-Strong fallback (only used if sample fetch fails)
function playKarplusStrongWeb(ctx: AudioContext, frequency: number, delaySeconds: number): void {
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
  const t0 = ctx.currentTime + delaySeconds;
  g.gain.setValueAtTime(0.5, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.8);
  src.connect(g);
  g.connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + 2.0);
}

export function playWebChord(notes: GuitarNote[]): void {
  const playable = notes.filter((n) => n.fret !== "x");
  playable.forEach((note, i) => {
    const freq = getFretFrequency(note.string, note.fret);
    if (freq > 0) playWebNote(freq, i * 0.014);
  });
}

// Pre-warm the sample cache for all open-string notes so first play has no gap
export function preloadWebSamples(): void {
  const ctx = getWebCtx();
  if (!ctx) return;
  OPEN_STRING_FREQS.forEach((freq) => {
    const midi = Math.max(SAMPLE_MIDI_MIN, Math.min(SAMPLE_MIDI_MAX, Math.round(freqToMidi(freq))));
    fetchWebSample(ctx, midi);
  });
}

// ─── Native Audio (iOS / Android) via expo-av ─────────────────────────────────

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

// Native cache: keyed by MIDI note number
const nativeSoundCache = new Map<number, Audio.Sound>();

async function playNativeNote(stringIndex: number, fret: number | "x" | "0"): Promise<void> {
  if (fret === "x") return;
  const freq = getFretFrequency(stringIndex, fret);
  if (freq <= 0) return;

  const midi = Math.max(SAMPLE_MIDI_MIN, Math.min(SAMPLE_MIDI_MAX, Math.round(freqToMidi(freq))));

  try {
    await ensureAudioSession();

    let sound = nativeSoundCache.get(midi);
    if (!sound) {
      // Download sample from CDN and cache locally
      const url = sampleUrl(midi);
      const localUri = `${FileSystem.cacheDirectory}guitar_sample_${midi}.mp3`;
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists) {
        await FileSystem.downloadAsync(url, localUri);
      }
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: localUri },
        { shouldPlay: false, volume: 0.85 }
      );
      nativeSoundCache.set(midi, newSound);
      sound = newSound;
    }

    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (err) {
    console.warn("Audio playback error:", err);
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
  webBufCache.clear();
}
