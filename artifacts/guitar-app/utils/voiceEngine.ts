import { Platform } from "react-native";

// ─── Voice Engine ─────────────────────────────────────────────────────────────
// Speaks sargam syllable names as notes play.
// Web: uses the built-in Web Speech API (no install needed)
// Native: uses expo-speech

let voiceEnabled = true;

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

    // Cancel any in-progress utterance first (fast tempo)
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.4;   // slightly faster for musical pacing
    utterance.pitch = 1.1;
    utterance.volume = 1.0;

    // Prefer an Indian English or English voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.lang.startsWith("en-IN") ||
        v.lang.startsWith("hi") ||
        v.lang.startsWith("en")
    );
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
  } else {
    const s = await getSpeech();
    if (!s) return;

    // Stop previous utterance before starting next
    try {
      s.stop();
    } catch (_) {}

    s.speak(text, {
      rate: 0.9,
      pitch: 1.1,
      language: "en-IN",
    });
  }
}
