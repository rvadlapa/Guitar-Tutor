import { Audio } from "expo-av";
import { Platform } from "react-native";
import { GuitarNote } from "@/context/TabContext";

// ─── Instrument type ──────────────────────────────────────────────────────────

export type InstrumentType = "acoustic" | "electric";

let currentInstrument: InstrumentType = "acoustic";
export function setInstrument(inst: InstrumentType): void { currentInstrument = inst; }
export function getInstrument(): InstrumentType { return currentInstrument; }

// ─── Frequency helpers ────────────────────────────────────────────────────────

const OPEN_STRING_FREQS = [329.63, 246.94, 196.0, 146.83, 110.0, 82.41];

function getFretFrequency(stringIndex: number, fret: number | "x" | "0"): number {
  if (fret === "x") return 0;
  const fretNum = fret === "0" ? 0 : (fret as number);
  return OPEN_STRING_FREQS[stringIndex] * Math.pow(2, fretNum / 12);
}

// ─── ACOUSTIC GUITAR — Karplus-Strong with triangular pluck excitation ────────
//
// A real string is displaced into a triangle shape by the pick/finger, then
// released. This gives the correct 1/n² harmonic rolloff. Pluck position
// (~15% from bridge) creates a comb notch — every ~7th harmonic is suppressed.
// The warmth filter in the feedback loop models the acoustic body absorbing
// high frequencies faster on bass strings than treble.

function generateAcoustic(sr: number, freq: number, si: number, dur: number): Float32Array {
  const N        = Math.floor(sr * dur);
  const P        = Math.max(2, Math.round(sr / freq));
  const buf      = new Float32Array(P);
  const pluckPos = 0.14 + si * 0.018; // near bridge; shifts slightly per string

  for (let i = 0; i < P; i++) {
    const phase = i / P;
    // Triangular displacement (60%) + noise pick texture (40%)
    const tri = phase < pluckPos
      ? phase / pluckPos
      : (1.0 - phase) / (1.0 - pluckPos);
    buf[i] = tri * 0.60 + (Math.random() * 2 - 1) * 0.40;
  }

  // Warmth lowpass: bass strings absorb highs faster → warmer tone
  const w = 0.09 + (5 - si) * 0.065;
  for (let i = 1; i < P; i++) buf[i] = buf[i] * (1 - w) + buf[i - 1] * w;

  // Treble strings sustain a little longer than bass
  const decay = 0.9944 + (5 - si) * 0.00055;
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

// ─── ELECTRIC GUITAR — Karplus-Strong tuned for solid-body character ──────────
//
// Key differences from acoustic:
//
//   • Brighter seed — solid body doesn't absorb highs, so treble content
//     survives much longer. Minimal warmth filter in the seed.
//
//   • Longer sustain — electric pickups sense string velocity with almost no
//     energy loss, so the decay is slower (closer to 1.0). This gives the
//     characteristic "singing" sustain.
//
//   • Pick transient — a very short (3 ms) band-limited noise burst at the
//     attack models the pick scraping the string. This is what makes the
//     front of an electric note sound sharp and defined rather than soft.
//
//   • Mid-range presence — a gentle all-pass comb in the initial seed
//     boosts the 800–2000 Hz range that electric pickups emphasise,
//     giving that nasal "quack" of single-coil pickups.

function generateElectric(sr: number, freq: number, si: number, dur: number): Float32Array {
  const N   = Math.floor(sr * dur);
  const P   = Math.max(2, Math.round(sr / freq));
  const buf = new Float32Array(P);

  // Pick transient: 3ms burst of bandpass noise (800–3000 Hz)
  const pickLen = Math.floor(sr * 0.003);
  let lpPick = 0;
  const cpA = 1 - Math.exp(-2 * Math.PI *  800 / sr);
  const cpB = 1 - Math.exp(-2 * Math.PI * 3000 / sr);
  let lpA = 0, lpB = 0;
  for (let i = 0; i < pickLen && i < P; i++) {
    const n = Math.random() * 2 - 1;
    lpA += cpA * (n - lpA);
    lpB += cpB * (n - lpB);
    buf[i] += (lpB - lpA) * Math.exp(-i / (sr * 0.0008)) * 0.55;
    lpPick = lpB;
  }

  // Triangular pluck excitation — same concept as acoustic but mixed differently
  const pluckPos = 0.12; // tighter toward bridge → brighter, more midrange
  for (let i = 0; i < P; i++) {
    const phase = i / P;
    const tri   = phase < pluckPos
      ? phase / pluckPos
      : (1.0 - phase) / (1.0 - pluckPos);
    buf[i] += tri * 0.55 + (Math.random() * 2 - 1) * 0.22;
  }

  // Very slight warmth on bass strings only (high strings stay bright)
  const w = Math.max(0, (5 - si) * 0.012);
  if (w > 0) {
    for (let i = 1; i < P; i++) buf[i] = buf[i] * (1 - w) + buf[i - 1] * w;
  }

  // Longer decay → more sustain; electric strings ring much longer
  const decay = 0.9968 + (5 - si) * 0.00038;
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

// ─── PCM dispatch ─────────────────────────────────────────────────────────────

function generatePCM(
  sr: number, freq: number, si: number, dur: number, inst: InstrumentType,
): Float32Array {
  switch (inst) {
    case "acoustic": return generateAcoustic(sr, freq, si, dur);
    case "electric": return generateElectric(sr, freq, si, dur);
  }
}

// ─── Web Audio context ────────────────────────────────────────────────────────

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

// ─── Master processing chain (no reverb — clean, direct signal) ───────────────
//
// acoustic: warm low-mid boost + gentle high cut → compressor
// electric: presence peak at 1.8 kHz + high cut → compressor
// Both go through a soft compressor to keep levels consistent.

let acousticChain: GainNode | null = null;
let electricChain: GainNode | null = null;

function buildChain(ctx: AudioContext, inst: InstrumentType): GainNode {
  const input = ctx.createGain();
  input.gain.value = 1.0;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value      = 6;
  comp.ratio.value     = 4.0;
  comp.attack.value    = 0.003;
  comp.release.value   = 0.12;

  if (inst === "acoustic") {
    // Warm low-mid body boost
    const body = ctx.createBiquadFilter();
    body.type          = "peaking";
    body.frequency.value = 160;
    body.gain.value    = 3.5;
    body.Q.value       = 0.8;

    // Gentle high cut (acoustic body rolls off above 6 kHz)
    const hicut = ctx.createBiquadFilter();
    hicut.type          = "lowpass";
    hicut.frequency.value = 6200;
    hicut.Q.value       = 0.6;

    input.connect(body);
    body.connect(hicut);
    hicut.connect(comp);
  } else {
    // Presence/attack peak — the signature electric mid-range bite
    const presence = ctx.createBiquadFilter();
    presence.type          = "peaking";
    presence.frequency.value = 1800;
    presence.gain.value    = 4.0;
    presence.Q.value       = 1.2;

    // Tight high cut (single-coil pickups roll off above 5 kHz)
    const hicut = ctx.createBiquadFilter();
    hicut.type          = "lowpass";
    hicut.frequency.value = 5000;
    hicut.Q.value       = 0.65;

    input.connect(presence);
    presence.connect(hicut);
    hicut.connect(comp);
  }

  comp.connect(ctx.destination);
  return input;
}

function getChain(ctx: AudioContext, inst: InstrumentType): GainNode {
  if (inst === "acoustic") {
    if (!acousticChain) acousticChain = buildChain(ctx, "acoustic");
    return acousticChain;
  } else {
    if (!electricChain) electricChain = buildChain(ctx, "electric");
    return electricChain;
  }
}

// ─── Buffer cache keyed by (instrument, stringIndex, frequency) ───────────────

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

// Active web sources from the most recent chord. Stopped before the next
// chord starts so notes don't ring past the current beat.
const activeWebSources = new Set<{ src: AudioBufferSourceNode; gain: GainNode }>();

function silenceActiveWebSources(ctx: AudioContext): void {
  const now = ctx.currentTime;
  activeWebSources.forEach(({ src, gain }) => {
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.02);
      src.stop(now + 0.025);
    } catch {}
  });
  activeWebSources.clear();
}

function playWebNote(
  ctx: AudioContext, freq: number, si: number, delaySeconds: number, inst: InstrumentType,
  durationSeconds: number,
): void {
  const t0    = ctx.currentTime + delaySeconds;
  const chain = getChain(ctx, inst);
  const ab    = getBuffer(ctx, freq, si, inst);
  const src   = ctx.createBufferSource();
  src.buffer  = ab;

  const gain = ctx.createGain();
  // Bass strings slightly louder; electric a touch hotter
  const peak = inst === "electric" ? 0.58 + si * 0.038 : 0.52 + si * 0.040;
  gain.gain.setValueAtTime(peak, t0);
  // Fade out by the end of the beat so the buffer doesn't ring into the next note
  const fadeStart = t0 + Math.max(0.05, durationSeconds * 0.85);
  const fadeEnd   = t0 + durationSeconds;
  gain.gain.setValueAtTime(peak, fadeStart);
  gain.gain.linearRampToValueAtTime(0.0001, fadeEnd);

  src.connect(gain);
  gain.connect(chain);
  src.start(t0);
  src.stop(fadeEnd + 0.02);

  const handle = { src, gain };
  activeWebSources.add(handle);
  src.onended = () => {
    activeWebSources.delete(handle);
  };
}

export function playWebChord(notes: GuitarNote[], durationSeconds: number = 1.6): void {
  const ctx = getCtx();
  if (!ctx) return;
  silenceActiveWebSources(ctx);
  const inst     = currentInstrument;
  const playable = notes.filter((n) => n.fret !== "x");
  // Strum: 13ms between strings (low to high)
  playable.forEach((note, i) => {
    const freq = getFretFrequency(note.string, note.fret);
    if (freq > 0) playWebNote(ctx, freq, note.string, i * 0.013, inst, durationSeconds);
  });
}

export function preloadWebSamples(): void {
  if (Platform.OS !== "web") return;
  const ctx = getCtx();
  if (!ctx) return;
  // C major cross-string positions across all 6 strings
  // Lower octave (A/D/G): sa re ga ma pa dha ni
  // Middle octave (G/B/e): Sa Re Ga Ma Pa Dha Ni Sa'
  const positions: [number, number][] = [
    [4, 3],              // A  fret 3  = sa (C3)
    [3, 0], [3, 2], [3, 3], [3, 5], // D open/2/3/5 = re ga ma pa
    [2, 2], [2, 4],      // G  fret 2/4 = dha ni
    [2, 5], [2, 7],      // G  fret 5/7 = Sa Re
    [1, 5], [1, 6],      // B  fret 5/6 = Ga Ma
    [0, 3], [0, 5], [0, 7], [0, 8], // e fret 3/5/7/8 = Pa Dha Ni Sa'
  ];
  positions.forEach(([si, fret]) => {
    const freq = getFretFrequency(si, fret);
    if (freq > 0) getBuffer(ctx, freq, si, "acoustic");
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
const activeNativeSounds = new Set<Audio.Sound>();
const pendingNativeStops = new Set<ReturnType<typeof setTimeout>>();

function clearPendingNativeStops(): void {
  pendingNativeStops.forEach((t) => clearTimeout(t));
  pendingNativeStops.clear();
}

async function silenceActiveNativeSounds(): Promise<void> {
  clearPendingNativeStops();
  const sounds = Array.from(activeNativeSounds);
  activeNativeSounds.clear();
  await Promise.all(sounds.map((s) => s.pauseAsync().catch(() => {})));
}

async function playNativeNote(
  si: number,
  fret: number | "x" | "0",
  durationSeconds: number,
): Promise<void> {
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
      const FileSystem = await import("expo-file-system/legacy");
      const cacheDir = FileSystem.cacheDirectory ?? "";
      const uri = `${cacheDir}${cacheKey}.wav`;
      await FileSystem.writeAsStringAsync(uri, wav, { encoding: "base64" as any });
      const { sound: s } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false, volume: 0.9 });
      nativeCache.set(cacheKey, s);
      sound = s;
    }
    await sound.setPositionAsync(0);
    await sound.playAsync();
    activeNativeSounds.add(sound);
    const stopTimer = setTimeout(() => {
      pendingNativeStops.delete(stopTimer);
      activeNativeSounds.delete(sound!);
      sound!.pauseAsync().catch(() => {});
    }, Math.max(80, durationSeconds * 1000));
    pendingNativeStops.add(stopTimer);
  } catch (err) {
    console.warn("Audio error:", err);
  }
}

export async function playNativeChord(
  notes: GuitarNote[],
  durationSeconds: number = 1.4,
): Promise<void> {
  await silenceActiveNativeSounds();
  const playable = notes.filter((n) => n.fret !== "x");
  for (let i = 0; i < playable.length; i++) {
    if (i > 0) await new Promise<void>((r) => setTimeout(r, 13));
    playNativeNote(playable[i].string, playable[i].fret, durationSeconds);
  }
}

// ─── Unified public API ───────────────────────────────────────────────────────

export async function playChord(
  notes: GuitarNote[],
  durationSeconds?: number,
): Promise<void> {
  if (notes.length === 0) return;
  if (Platform.OS === "web") {
    playWebChord(notes, durationSeconds);
  } else {
    await playNativeChord(notes, durationSeconds);
  }
}

export function disposeAudio(): void {
  clearPendingNativeStops();
  activeNativeSounds.clear();
  activeWebSources.clear();
  nativeCache.forEach((s) => s.unloadAsync().catch(() => {}));
  nativeCache.clear();
  webCache.clear();
  acousticChain = null;
  electricChain = null;
  webCtx        = null;
}
