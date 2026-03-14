import { GuitarNote, TabChord, TabSection, TabSong } from "@/context/TabContext";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// ─── Note → semitone map ───────────────────────────────────────────────────
const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  "C#": 1, Db: 1,
  D: 2,
  "D#": 3, Eb: 3,
  E: 4,
  F: 5,
  "F#": 6, Gb: 6,
  G: 7,
  "G#": 8, Ab: 8,
  A: 9,
  "A#": 10, Bb: 10,
  B: 11,
};

// Standard tuning open strings (MIDI): e B G D A E (string 0 → 5)
const STRING_OPEN_MIDI = [64, 59, 55, 50, 45, 40];

// ─── Octave-aware MIDI helpers ─────────────────────────────────────────────

/** Return the MIDI number for `noteName` in the octave closest to `anchorMidi`. */
function noteToMidiNearest(noteName: string, anchorMidi: number): number {
  const semitone = NOTE_TO_SEMITONE[noteName];
  if (semitone === undefined) return -1;

  let bestMidi = -1;
  let bestDist = Infinity;
  for (let oct = 2; oct <= 7; oct++) {
    const midi = 12 + oct * 12 + semitone;
    const dist = Math.abs(midi - anchorMidi);
    if (dist < bestDist) {
      bestDist = dist;
      bestMidi = midi;
    }
  }
  return bestMidi;
}

/** Map a MIDI number to the best guitar position (low fret, middle string). */
function midiToGuitarPosition(midi: number): { string: number; fret: number } | null {
  let best: { string: number; fret: number; score: number } | null = null;
  for (let si = 0; si < 6; si++) {
    const fret = midi - STRING_OPEN_MIDI[si];
    if (fret >= 0 && fret <= 15) {
      const score = fret * 1.5 + Math.abs(si - 3);
      if (!best || score < best.score) {
        best = { string: si, fret, score };
      }
    }
  }
  return best ? { string: best.string, fret: best.fret } : null;
}

// ─── Tokenizer ─────────────────────────────────────────────────────────────

/**
 * Extract an ordered list of Western note names from a raw text string.
 * Handles: A# Bb D# space-separated AND concatenated (DCBC, A#A#).
 * Ignores: dashes, ellipsis, numbers, non-ASCII, lyrics text.
 */
function tokenizeNotes(text: string): string[] {
  // Strip separators so they don't confuse the pattern
  const cleaned = text
    .replace(/[–—\-]/g, " ")       // dashes → space
    .replace(/[…\.]{2,}/g, " ")    // ellipsis/dots → space
    .replace(/[^\x00-\x7F]+/g, " ") // non-ASCII (Telugu etc.) → space
    .replace(/\d+/g, " ");          // plain numbers → space

  // Match note names: must be uppercase A-G, optionally followed by # or b
  // The regex engine is greedy-left so A#A# → ["A#", "A#"] correctly
  const matches = cleaned.match(/[A-G](?:[#b](?=[^a-z]|$))?/g);
  if (!matches) return [];

  // Validate each token is a real note name
  return matches.filter((m) => NOTE_TO_SEMITONE[m] !== undefined);
}

// ─── Line classification ───────────────────────────────────────────────────

const SECTION_HEADER_RE =
  /^(part|verse|chorus|intro|bridge|outro|section|now|repeat|interlude)\b/i;

function isNoteOnlyLine(trimmed: string): boolean {
  // Has non-ASCII → definitely lyrics
  if (/[^\x00-\x7F]/.test(trimmed)) return false;
  // Pure number → fret marker, skip
  if (/^\d+$/.test(trimmed)) return false;
  // Section headers handled separately
  if (SECTION_HEADER_RE.test(trimmed)) return false;

  // Count how many uppercase A-G clusters appear vs total uppercase letters
  const noteTokens = tokenizeNotes(trimmed);
  if (noteTokens.length < 2) return false;

  // Make sure the line isn't mostly prose with incidental A-G letters
  // (e.g. "andaale daasohamanaga" has no uppercase → already filtered out)
  const uppercaseCount = (trimmed.match(/[A-Z]/g) ?? []).length;
  const noteLetterCount = noteTokens.join("").replace(/[#b]/g, "").length;
  // If most uppercase letters are note names, treat as note line
  return uppercaseCount === 0 || noteLetterCount / uppercaseCount >= 0.6;
}

// ─── Main parser ───────────────────────────────────────────────────────────

export function parseWesternNotation(rawText: string, title?: string): TabSong {
  const lines = rawText.split("\n");

  const sections: TabSection[] = [];
  let currentSectionName = "Intro";
  let currentChords: TabChord[] = [];

  // Start anchor at D4 = MIDI 62 — a comfortable middle register
  let prevMidi = 62;

  const flushSection = () => {
    if (currentChords.length > 0) {
      sections.push({
        id: generateId(),
        name: currentSectionName,
        chords: currentChords,
      });
      currentChords = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // ── Section header ──────────────────────────────────────────────────
    if (SECTION_HEADER_RE.test(trimmed)) {
      flushSection();
      currentSectionName = trimmed;
      // Reset octave anchor between sections so each starts fresh
      prevMidi = 62;
      continue;
    }

    // ── Instruction / lyric lines → skip ───────────────────────────────
    if (!isNoteOnlyLine(trimmed)) continue;

    // ── Note line → parse into chords ──────────────────────────────────
    const noteTokens = tokenizeNotes(trimmed);
    for (const noteName of noteTokens) {
      const midi = noteToMidiNearest(noteName, prevMidi);
      if (midi < 0) continue;

      const pos = midiToGuitarPosition(midi);
      if (!pos) continue;

      const guitarNote: GuitarNote = {
        string: pos.string,
        fret: pos.fret === 0 ? "0" : pos.fret,
        technique: "none",
      };

      currentChords.push({
        id: generateId(),
        notes: [guitarNote],
        label: noteName,
      });

      prevMidi = midi; // carry octave context to next note
    }
  }

  flushSection();

  // ── Fallback: dump everything if nothing structured was found ──────────
  if (sections.length === 0) {
    const noteTokens = tokenizeNotes(rawText);
    let anchor = 62;
    const chords: TabChord[] = [];
    for (const noteName of noteTokens) {
      const midi = noteToMidiNearest(noteName, anchor);
      if (midi < 0) continue;
      const pos = midiToGuitarPosition(midi);
      if (!pos) continue;
      chords.push({
        id: generateId(),
        notes: [{ string: pos.string, fret: pos.fret === 0 ? "0" : pos.fret, technique: "none" }],
        label: noteName,
      });
      anchor = midi;
    }
    if (chords.length > 0) {
      sections.push({ id: generateId(), name: "Main", chords });
    }
  }

  // ── Title detection ───────────────────────────────────────────────────
  const detectedTitle =
    title ||
    lines
      .map((l) => l.trim())
      .find((t) => {
        if (!t || t.length < 3 || t.length > 80) return false;
        if (SECTION_HEADER_RE.test(t)) return false;
        if (/[A-G]/.test(t) && tokenizeNotes(t).length >= 2) return false;
        if (/^\d+$/.test(t)) return false;
        return true;
      }) || "Song";

  return {
    id: generateId(),
    title: detectedTitle,
    tuning: ["e", "B", "G", "D", "A", "E"],
    sections,
    createdAt: Date.now(),
    rawText,
  };
}

// ─── Auto-detection ────────────────────────────────────────────────────────

export function isWesternNotationText(text: string): boolean {
  // Must NOT already be a guitar tab
  if (/^[eEBGDAb]\s*[|:>]/m.test(text)) return false;
  // Must NOT be sargam
  if (/((?:Sa|sa|Re|re|Ri|ri|Ga|ga|Ma|ma|Pa|pa|Dha|dha|Ni|ni){2,})/g.test(text)) return false;
  // Need at least 4 distinct note tokens
  return tokenizeNotes(text).length >= 4;
}
