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

// ─── Web Audio API (Browser / Expo Web) ───────────────────────────────────────

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

function playWebNote(frequency: number, delaySeconds: number = 0): void {
  const ctx = getWebAudioContext();
  if (!ctx || frequency <= 0) return;

  const now = ctx.currentTime + delaySeconds;
  const duration = 1.8;

  // Master gain
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.18, now);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  masterGain.connect(ctx.destination);

  // Body resonance with a biquad filter (guitar body EQ)
  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = "peaking";
  bodyFilter.frequency.value = 220;
  bodyFilter.gain.value = 6;
  bodyFilter.Q.value = 1.2;
  bodyFilter.connect(masterGain);

  // High cut - guitar strings don't have harsh highs
  const highCut = ctx.createBiquadFilter();
  highCut.type = "lowpass";
  highCut.frequency.value = 3000;
  highCut.Q.value = 0.5;
  highCut.connect(bodyFilter);

  // Fundamental oscillator (main pitch)
  const osc1 = ctx.createOscillator();
  osc1.type = "sawtooth";
  osc1.frequency.setValueAtTime(frequency, now);
  // Slight pitch envelope (string attack)
  osc1.frequency.setValueAtTime(frequency * 1.002, now);
  osc1.frequency.exponentialRampToValueAtTime(frequency, now + 0.05);

  const osc1Gain = ctx.createGain();
  osc1Gain.gain.setValueAtTime(0.6, now);
  osc1Gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.9);
  osc1.connect(osc1Gain);
  osc1Gain.connect(highCut);

  // Second harmonic (adds warmth)
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.value = frequency * 2;
  const osc2Gain = ctx.createGain();
  osc2Gain.gain.setValueAtTime(0.2, now);
  osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.5);
  osc2.connect(osc2Gain);
  osc2Gain.connect(highCut);

  // Third harmonic (brightness)
  const osc3 = ctx.createOscillator();
  osc3.type = "triangle";
  osc3.frequency.value = frequency * 3;
  const osc3Gain = ctx.createGain();
  osc3Gain.gain.setValueAtTime(0.08, now);
  osc3Gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.3);
  osc3.connect(osc3Gain);
  osc3Gain.connect(highCut);

  // Attack transient (pick noise)
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = frequency * 2;
  noiseFilter.Q.value = 3;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.15, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);

  osc1.start(now);
  osc2.start(now);
  osc3.start(now);
  noiseSource.start(now);

  osc1.stop(now + duration);
  osc2.stop(now + duration);
  osc3.stop(now + duration);
}

export function playWebChord(notes: GuitarNote[]): void {
  const ctx = getWebAudioContext();
  if (!ctx) return;

  const playable = notes.filter((n) => n.fret !== "x");

  playable.forEach((note, i) => {
    const freq = getFretFrequency(note.string, note.fret);
    if (freq > 0) {
      // Slight strum delay between strings (arpeggio effect)
      const delayMs = i * 18;
      playWebNote(freq, delayMs / 1000);
    }
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

// Generate a simple pluck-like WAV tone as base64
function generateWavBase64(frequency: number, durationMs: number = 1200): string {
  const sampleRate = 22050;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const fileSize = 44 + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const omega = (2 * Math.PI * frequency) / sampleRate;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const decay = Math.exp(-t * 4.5);

    // Plucked string waveform: fundamental + harmonics, fast attack decay
    let sample =
      decay *
      (0.5 * Math.sin(omega * i) +
        0.25 * Math.sin(2 * omega * i) +
        0.12 * Math.sin(3 * omega * i) +
        0.06 * Math.sin(4 * omega * i));

    // Add tiny noise burst at start for pick attack
    if (i < sampleRate * 0.015) {
      const pickEnv = Math.exp((-i / sampleRate) * 300);
      sample += pickEnv * (Math.random() * 0.1 - 0.05);
    }

    const pcm = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, pcm * 32767, true);
  }

  // Convert to base64
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const soundCache = new Map<string, Audio.Sound>();

async function playNativeNote(
  stringIndex: number,
  fret: number | "x" | "0"
): Promise<void> {
  if (fret === "x") return;
  const freq = getFretFrequency(stringIndex, fret);
  if (freq <= 0) return;

  const cacheKey = `${stringIndex}_${fret}`;

  try {
    await ensureAudioSession();

    let sound = soundCache.get(cacheKey);

    if (!sound) {
      const wavB64 = generateWavBase64(freq, 1400);
      const uri = `${FileSystem.cacheDirectory}guitar_${cacheKey}.wav`;

      await FileSystem.writeAsStringAsync(uri, wavB64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false, volume: 0.7 }
      );
      soundCache.set(cacheKey, newSound);
      sound = newSound;
    }

    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (err) {
    // Silently fail - audio is optional enhancement
    console.warn("Audio playback error:", err);
  }
}

export async function playNativeChord(notes: GuitarNote[]): Promise<void> {
  const playable = notes.filter((n) => n.fret !== "x");
  for (let i = 0; i < playable.length; i++) {
    const note = playable[i];
    // Small stagger for strum feel
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 16));
    }
    playNativeNote(note.string, note.fret);
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
