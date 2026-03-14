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

// ─── Web Audio: Additive synthesis with inharmonic overtones ──────────────────
//
// Real acoustic guitar strings produce inharmonic overtones — higher partials
// are slightly sharper than integer multiples (inharmonicity coefficient B).
// Each partial also decays at a different rate: higher = faster decay.
// This "bright attack → warm sustain" curve is the defining character of
// acoustic guitar sound.

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

// Shared reverb convolver (guitar body resonance)
let reverbBuffer: AudioBuffer | null = null;

function buildReverbBuffer(ctx: AudioContext): AudioBuffer {
  if (reverbBuffer) return reverbBuffer;

  // Synthetic impulse response: exponentially decaying noise simulates a
  // small wooden box (guitar body). Duration ~0.9 s, slightly brighter
  // early reflections that warm up into a diffuse tail.
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.9);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // Early reflections (dense, bright): strong for first 30 ms
      const early = i < sr * 0.03 ? Math.exp(-t * 80) * 1.2 : 0;
      // Diffuse tail (warm): exponential decay over the rest
      const tail = Math.exp(-t * 7.5);
      d[i] = (Math.random() * 2 - 1) * (early + tail * 0.35);
    }
  }
  reverbBuffer = buf;
  return buf;
}

let reverbNode: ConvolverNode | null = null;
let reverbGain: GainNode | null = null;
let masterEq: BiquadFilterNode | null = null;

function getSharedChain(ctx: AudioContext): {
  input: AudioNode;
} {
  if (reverbNode && reverbGain && masterEq) return { input: masterEq };

  // Build once, share across all notes
  reverbNode = ctx.createConvolver();
  reverbNode.buffer = buildReverbBuffer(ctx);
  reverbNode.normalize = true;

  reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.28; // 28% wet

  // Warmth EQ: boost body at 220 Hz, cut harshness above 4 kHz
  masterEq = ctx.createBiquadFilter();
  masterEq.type = "peaking";
  masterEq.frequency.value = 220;
  masterEq.gain.value = 5;
  masterEq.Q.value = 1.2;

  const highCut = ctx.createBiquadFilter();
  highCut.type = "lowpass";
  highCut.frequency.value = 5500;

  masterEq.connect(highCut);
  highCut.connect(ctx.destination);   // dry path
  highCut.connect(reverbGain);        // send to reverb
  reverbGain.connect(reverbNode);
  reverbNode.connect(ctx.destination);

  return { input: masterEq };
}

function playAcousticGuitarNote(ctx: AudioContext, frequency: number, stringIndex: number, delaySeconds: number): void {
  const t0 = ctx.currentTime + delaySeconds;
  const { input } = getSharedChain(ctx);

  // Inharmonicity: real guitar strings B ≈ 0.0001–0.0004
  // Higher strings are more inharmonic than lower ones
  const B = [0.00030, 0.00025, 0.00020, 0.00015, 0.00010, 0.00008][stringIndex] ?? 0.0002;

  // Harmonic series — amplitudes and decay-rate multipliers tuned to match
  // recordings of acoustic guitar. Decay rate grows quadratically with partial
  // number, which matches measured string physics.
  const partials = [
    { n: 1, amp: 1.000, decayRate: 2.2  },
    { n: 2, amp: 0.520, decayRate: 3.8  },
    { n: 3, amp: 0.260, decayRate: 6.2  },
    { n: 4, amp: 0.140, decayRate: 9.5  },
    { n: 5, amp: 0.070, decayRate: 14.0 },
    { n: 6, amp: 0.036, decayRate: 19.5 },
    { n: 7, amp: 0.018, decayRate: 26.0 },
    { n: 8, amp: 0.009, decayRate: 34.0 },
  ];

  // String-length scaling: longer strings ring longer (lower strings)
  const ringScale = 1.0 + (5 - stringIndex) * 0.18; // 0→1.0, 5→1.9

  // Overall amplitude: higher strings are louder (scaled by string index)
  const masterAmp = 0.38 / (1 + partials.length * 0.05);

  const noteGain = ctx.createGain();
  noteGain.gain.value = masterAmp;
  noteGain.connect(input);

  partials.forEach(({ n, amp, decayRate }) => {
    // Inharmonic frequency: f_n = n * f0 * sqrt(1 + B*n^2)
    const freq_n = frequency * n * Math.sqrt(1 + B * n * n);
    if (freq_n > ctx.sampleRate / 2) return; // above Nyquist, skip

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq_n;

    // Tiny random detune per partial — avoids "digital" purity
    osc.detune.value = (Math.random() - 0.5) * 3;

    const envGain = ctx.createGain();
    const totalDecay = decayRate / ringScale;
    const ringTime = Math.max(0.3, 4.5 / totalDecay);

    // Near-instant attack (0.8 ms), then exponential decay
    envGain.gain.setValueAtTime(0.0001, t0);
    envGain.gain.linearRampToValueAtTime(amp, t0 + 0.0008);
    envGain.gain.exponentialRampToValueAtTime(0.0001, t0 + ringTime);

    osc.connect(envGain);
    envGain.connect(noteGain);
    osc.start(t0);
    osc.stop(t0 + ringTime + 0.05);
  });

  // ── Pick attack transient ─────────────────────────────────────────────────
  // Short filtered noise burst replicates the "click" of finger/pick on string
  const noiseLen = Math.floor(ctx.sampleRate * 0.04);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) {
    nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.006));
  }

  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;

  // Band-pass the noise around the 3rd harmonic for a woody "tick"
  const nbp = ctx.createBiquadFilter();
  nbp.type = "bandpass";
  nbp.frequency.value = Math.min(frequency * 2.8, 6000);
  nbp.Q.value = 0.8;

  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.22, t0);
  nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);

  noiseSrc.connect(nbp);
  nbp.connect(nGain);
  nGain.connect(input);
  noiseSrc.start(t0);
}

export function playWebChord(notes: GuitarNote[]): void {
  const ctx = getCtx();
  if (!ctx) return;
  const playable = notes.filter((n) => n.fret !== "x");
  playable.forEach((note, i) => {
    const freq = getFretFrequency(note.string, note.fret);
    if (freq > 0) playAcousticGuitarNote(ctx, freq, note.string, i * 0.014);
  });
}

export function preloadWebSamples(): void {
  if (Platform.OS !== "web") return;
  const ctx = getCtx();
  if (ctx) buildReverbBuffer(ctx); // pre-build the reverb IR on load
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

function generateAcousticGuitarWav(frequency: number, stringIndex: number): string {
  const sampleRate = 22050;
  const duration = 2.5;
  const numSamples = Math.floor(sampleRate * duration);

  const B = [0.00030, 0.00025, 0.00020, 0.00015, 0.00010, 0.00008][stringIndex] ?? 0.0002;
  const ringScale = 1.0 + (5 - stringIndex) * 0.18;

  const partials = [
    { n: 1, amp: 1.000, decayRate: 2.2  },
    { n: 2, amp: 0.520, decayRate: 3.8  },
    { n: 3, amp: 0.260, decayRate: 6.2  },
    { n: 4, amp: 0.140, decayRate: 9.5  },
    { n: 5, amp: 0.070, decayRate: 14.0 },
    { n: 6, amp: 0.036, decayRate: 19.5 },
  ];

  const samples = new Float32Array(numSamples).fill(0);

  // Add pick noise burst (first 40 ms)
  const noiseLen = Math.floor(sampleRate * 0.04);
  for (let i = 0; i < noiseLen; i++) {
    const env = Math.exp(-i / (sampleRate * 0.006));
    samples[i] += (Math.random() * 2 - 1) * env * 0.18;
  }

  // Add each partial
  partials.forEach(({ n, amp, decayRate }) => {
    const freq_n = frequency * n * Math.sqrt(1 + B * n * n);
    if (freq_n >= sampleRate / 2) return;
    const omega = (2 * Math.PI * freq_n) / sampleRate;
    const totalDecay = decayRate / ringScale;
    const masterAmp = amp * 0.32;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * totalDecay);
      if (env < 0.001) break;
      samples[i] += Math.sin(omega * i) * env * masterAmp;
    }
  });

  // Normalise
  let peak = 0;
  for (let i = 0; i < numSamples; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const norm = peak > 0 ? 0.85 / peak : 1;

  // Pack to 16-bit WAV
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
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i] * norm)) * 32767, true);
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
  const cacheKey = `ag_${stringIndex}_${fret}`;
  try {
    await ensureAudioSession();
    let sound = nativeCache.get(cacheKey);
    if (!sound) {
      const wav = generateAcousticGuitarWav(freq, stringIndex);
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
  reverbBuffer = null;
  reverbNode = null;
  reverbGain = null;
  masterEq = null;
  webCtx = null;
}
