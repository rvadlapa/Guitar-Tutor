import { Platform } from "react-native";

// ─── Voice Engine ─────────────────────────────────────────────────────────────
// Speaks sargam syllable names as notes play.
// Web: uses the built-in Web Speech API (no install needed)
// Native: uses expo-speech

let voiceEnabled = false;

// Lazy-import expo-speech only on native so web bundle stays clean
let Speech: typeof import("expo-speech") | null = null;

async function getSpeech() {
  if (Platform.OS !== "web" && !Speech) {
    Speech = await import("expo-speech");
  }
  return Speech;
}

// Pre-initialise on native
if (Platform.OS !== "web") {
  getSpeech();
}

// Cache the chosen native voice identifier so we don't re-query every note
let nativeVoiceId: string | undefined = undefined;
let nativeVoiceResolved = false;

async function getFemaleNativeVoice(): Promise<string | undefined> {
  if (nativeVoiceResolved) return nativeVoiceId;
  nativeVoiceResolved = true;
  try {
    const s = await getSpeech();
    if (!s) return undefined;
    const voices = await s.getAvailableVoicesAsync();
    // Priority: en-IN female → hi female → en female → any female
    const priorities = [
      (v: { language: string; name: string; identifier: string }) =>
        v.language.startsWith("en-IN") && /female|woman/i.test(v.name),
      (v: { language: string; name: string; identifier: string }) =>
        v.language.startsWith("hi") && /female|woman/i.test(v.name),
      (v: { language: string; name: string; identifier: string }) =>
        v.language.startsWith("en-IN"),
      (v: { language: string; name: string; identifier: string }) =>
        v.language.startsWith("hi"),
      (v: { language: string; name: string; identifier: string }) =>
        /female|woman|samantha|victoria|moira|karen|tessa|veena/i.test(v.name),
    ];
    for (const test of priorities) {
      const match = voices.find(test);
      if (match) {
        nativeVoiceId = match.identifier;
        return nativeVoiceId;
      }
    }
  } catch {}
  return undefined;
}

// Phonetic spellings that TTS engines say as words, not letter-by-letter
const SYLLABLE_PRONUNCIATIONS: Record<string, string> = {
  Sa: "Saah",
  sa: "saah",
  Re: "Reh",
  re: "reh",
  Ri: "Ree",
  ri: "ree",
  Ga: "Gaah",
  ga: "gaah",
  Ma: "Maah",
  ma: "maah",
  Pa: "Paah",
  pa: "paah",
  Dha: "Daah",
  dha: "daah",
  Da: "Daah",
  da: "daah",
  Ni: "Nee",
  ni: "nee",
};

function getPronunciation(label: string): string {
  return SYLLABLE_PRONUNCIATIONS[label] ?? label;
}

// Pick the best female voice from available web voices
function pickWebFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const priorities: ((v: SpeechSynthesisVoice) => boolean)[] = [
    (v) => v.lang.startsWith("en-IN") && /female|woman/i.test(v.name),
    (v) => v.lang.startsWith("hi") && /female|woman/i.test(v.name),
    (v) => v.lang.startsWith("en-IN"),
    (v) => v.lang.startsWith("hi"),
    (v) => /female|woman|samantha|victoria|moira|karen|tessa|veena/i.test(v.name),
    (v) => /google.*english/i.test(v.name),
    (v) => v.lang.startsWith("en"),
  ];
  for (const test of priorities) {
    const match = voices.find(test);
    if (match) return match;
  }
  return voices[0];
}

export function setVoiceEnabled(enabled: boolean): void {
  voiceEnabled = enabled;
  if (!enabled) {
    stopVoice();
  }
}

export function isVoiceEnabled(): boolean {
  return voiceEnabled;
}

export function stopVoice(): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } else if (Speech) {
    Speech.stop();
  }
}

export async function speakLabel(label: string | undefined): Promise<void> {
  if (!voiceEnabled || !label) return;

  const text = getPronunciation(label);

  if (Platform.OS === "web") {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    // Classical Indian female singer feel: high pitch, slow deliberate pace
    utterance.rate = 0.78;
    utterance.pitch = 1.45;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const voice = pickWebFemaleVoice(voices);
      if (voice) utterance.voice = voice;
    } else {
      // Voices not loaded yet — listen once then speak
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        const v2 = window.speechSynthesis.getVoices();
        const chosen = pickWebFemaleVoice(v2);
        if (chosen) utterance.voice = chosen;
        window.speechSynthesis.speak(utterance);
      };
      return;
    }

    window.speechSynthesis.speak(utterance);
  } else {
    const s = await getSpeech();
    if (!s) return;

    try { s.stop(); } catch (_) {}

    const voiceId = await getFemaleNativeVoice();

    s.speak(text, {
      rate: 0.78,
      pitch: 1.45,
      language: "en-IN",
      ...(voiceId ? { voice: voiceId } : {}),
    });
  }
}
