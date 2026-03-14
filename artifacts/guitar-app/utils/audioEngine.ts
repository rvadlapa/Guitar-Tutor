import { Audio } from "expo-av";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { GuitarNote } from "@/context/TabContext";

// Standard tuning open string frequencies (Hz)
// Strings ordered: e(high), B, G, D, A, E(low) -> indices 0-5
const OPEN_STRING_FREQS = [329.63, 246.94, 196.0, 146.83, 110.0, 82.41];

function getFretFrequency(stringIndex: number, fret: number | "x" | "0"): number {
  if (fret === "x") return 0;
  const fretNum = fret === "0" ? 0 : (fret as number);
  return OPEN_STRING_FREQS[stringIndex] * Math.pow(2, fretNum / 12);
}

// ─── Karplus-Strong Plucked String (Web Audio API) ────────────────────────────
// Simulates a guitar string by exciting a delay-line with filtered noise.

let webAudioCtx: AudioContext | null = null;

function getWebAudioContext(): AudioContext | null {
  if (typeof AudioContext === "undefined" && typeof (window as any).webkitAudioContext === "undefined") {
    return null;
  }
  if (!webAudioCtx || webAudioCtx.state === "closed") {
    webAudioCtx = new (AudioContext || (window as any).webkitAudioContext)();
  }
  if (webAudioCtx.state === "suspended") {
    webAudioCtx.resume();
  }
  return webAudioCtx;
}

function buildKarplusStrongBuffer(ctx: AudioContext, frequency: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 2.2; // seconds of string ring
  const totalSamples = Math.floor(sampleRate * duration);

  // Delay line length determines pitch
  const delayLength = Math.max(2, Math.round(sampleRate / frequency));

  const audioBuffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = audioBuffer.getChannelData(0);

  // Seed the delay line with band-limited noise (pick attack)
  const delayLine = new Float32Array(delayLength);
  for (let i = 0; i < delayLength; i++) {
    delayLine[i] = Math.random() * 2 - 1;
  }

  // Run Karplus-Strong: each sample = average of two adjacent delay-line values
  // The averaging is a one-pole low-pass filter → simulates string damping
  // Stretch factor (0.4995 < 0.5) controls decay speed
  const stretch = 0.4978;
  let idx = 0;
  for (let i = 0; i < totalSamples; i++) {
    const next = (idx + 1) % delayLength;
    data[i] = delayLine[idx];
    delayLine[idx] = stretch * (delayLine[idx] + delayLine[next]);
    idx = next;
  }

  return audioBuffer;
}

function playWebNote(ctx: AudioContext, frequency: number, delaySeconds: number): void {
  if (frequency <= 0) return;

  const buffer = buildKarplusStrongBuffer(ctx, frequency);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Mild body EQ — guitars have a resonance around 200-400 Hz
  const bodyEq = ctx.createBiquadFilter();
  bodyEq.type = "peaking";
  bodyEq.frequency.value = 300;
  bodyEq.gain.value = 4;
  bodyEq.Q.value = 0.9;

  // High-cut to remove unrealistic upper harmonics
  const highCut = ctx.createBiquadFilter();
  highCut.type = "lowpass";
  highCut.frequency.value = 4500;

  // Master volume with slight fade-out at tail
  const gain = ctx.createGain();
  const startTime = ctx.currentTime + delaySeconds;
  gain.gain.setValueAtTime(0.55, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 2.0);

  source.connect(bodyEq);
  bodyEq.connect(highCut);
  highCut.connect(gain);
  gain.connect(ctx.destination);

  source.start(startTime);
  source.stop(startTime + 2.2);
}

export function playWebChord(notes: GuitarNote[]): void {
  const ctx = getWebAudioContext();
  if (!ctx) return;

  const playable = notes.filter((n) => n.fret !== "x");
  playable.forEach((note, i) => {
    const freq = getFretFrequency(note.string, note.fret);
    if (freq > 0) {
      playWebNote(ctx, freq, i * 0.014); // slight strum delay
    }
  });
}

// ─── Karplus-Strong WAV Generator (Native / expo-av) ─────────────────────────

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

function generateKarplusStrongWav(frequency: number): string {
  const sampleRate = 22050;
  const durationMs = 2000;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);

  // Karplus-Strong delay line
  const delayLength = Math.max(2, Math.round(sampleRate / frequency));
  const delayLine = new Float32Array(delayLength);
  for (let i = 0; i < delayLength; i++) {
    delayLine[i] = Math.random() * 2 - 1;
  }

  const samples = new Float32Array(numSamples);
  const stretch = 0.4978;
  let idx = 0;
  for (let i = 0; i < numSamples; i++) {
    const next = (idx + 1) % delayLength;
    samples[i] = delayLine[idx];
    delayLine[idx] = stretch * (delayLine[idx] + delayLine[next]);
    idx = next;
  }

  // Pack into 16-bit PCM WAV
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const fileSize = 44 + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const ws = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  ws(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ws(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const pcm = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, pcm * 32767, true);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const soundCache = new Map<string, Audio.Sound>();

async function playNativeNote(stringIndex: number, fret: number | "x" | "0"): Promise<void> {
  if (fret === "x") return;
  const freq = getFretFrequency(stringIndex, fret);
  if (freq <= 0) return;

  const cacheKey = `ks_${stringIndex}_${fret}`;
  try {
    await ensureAudioSession();

    let sound = soundCache.get(cacheKey);
    if (!sound) {
      const wavB64 = generateKarplusStrongWav(freq);
      const uri = `${FileSystem.cacheDirectory}guitar_ks_${cacheKey}.wav`;
      await FileSystem.writeAsStringAsync(uri, wavB64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false, volume: 0.8 }
      );
      soundCache.set(cacheKey, newSound);
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
  soundCache.forEach((sound) => {
    sound.unloadAsync().catch(() => {});
  });
  soundCache.clear();
}
