import { GuitarNote, TabChord, TabSection, TabSong } from "@/context/TabContext";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// ─── Western Note System ──────────────────────────────────────────────────────
// Standard tuning open strings (MIDI numbers):
// E (low) = 40, A = 45, D = 50, G = 55, B = 59, e (high) = 64

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

const STRING_OPEN_MIDI = [64, 59, 55, 50, 45, 40]; // e, B, G, D, A, E (indices 0-5)
const DEFAULT_OCTAVE = 4; // notes like "C" are assumed to be in octave 4

function noteNameToMidi(noteName: string, octave: number = DEFAULT_OCTAVE): number {
  const semitone = NOTE_TO_SEMITONE[noteName];
  if (semitone === undefined) return -1;
  // C0 = MIDI 12, so note at octave O = 12 + O * 12 + semitone
  return 12 + octave * 12 + semitone;
}

function midiToGuitarPosition(midi: number): { string: number; fret: number } | null {
  // Find the best position (prefer lower frets, prefer middle strings)
  let best: { string: number; fret: number; score: number } | null = null;

  for (let si = 0; si < 6; si++) {
    const fret = midi - STRING_OPEN_MIDI[si];
    if (fret >= 0 && fret <= 15) {
      // Score: prefer lower frets and middle strings (2, 3, 4)
      const score = fret * 1.5 + Math.abs(si - 3);
      if (!best || score < best.score) {
        best = { string: si, fret, score };
      }
    }
  }

  return best ? { string: best.string, fret: best.fret } : null;
}

// ─── Tokenize Western note sequence ───────────────────────────────────────────

function tokenizeWesternNotes(text: string): string[] {
  // Match patterns like: A, A#, Ab, C, D#, etc.
  const pattern = /[A-G](?:[#b])?/g;
  const matches = text.match(pattern);
  return matches ?? [];
}

function isWesternNoteName(text: string): boolean {
  return /^[A-G](?:[#b])?$/i.test(text);
}

// ─── Detect Western notation format ───────────────────────────────────────────

export function isWesternNotationText(text: string): boolean {
  // Must NOT be a guitar tab or sargam
  const hasTabLines = /^[eEBGDAb]\s*[|:>]/m.test(text);
  const hasSargam = /((?:Sa|sa|Re|re|Ri|ri|Ga|ga|Ma|ma|Pa|pa|Dha|dha|Da|da|Ni|ni){2,})/g.test(text);
  if (hasTabLines || hasSargam) return false;

  // Look for sequences of Western note names (at least 4 in the text)
  const notes = tokenizeWesternNotes(text);
  return notes.length >= 4;
}

// ─── Parse Western notation ───────────────────────────────────────────────────

export function parseWesternNotation(rawText: string, title?: string): TabSong {
  const lines = rawText.split("\n");
  const sections: TabSection[] = [];

  let currentSectionName = "Main";
  let sectionCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Section headers: capitalized lines that don't look like note sequences
    if (/^(part|verse|chorus|intro|bridge|section|now|repeat)\s*/i.test(trimmed)) {
      currentSectionName = trimmed;
      continue;
    }

    // Try to extract note sequences from the line
    const notes = tokenizeWesternNotes(trimmed);
    if (notes.length < 2) continue;

    // Convert notes to guitar chords
    const chords: TabChord[] = [];
    for (const noteName of notes) {
      const midi = noteNameToMidi(noteName, DEFAULT_OCTAVE);
      if (midi < 0) continue;

      const pos = midiToGuitarPosition(midi);
      if (!pos) continue;

      const guitarNote: GuitarNote = {
        string: pos.string,
        fret: pos.fret === 0 ? "0" : pos.fret,
        technique: "none",
      };

      chords.push({
        id: generateId(),
        notes: [guitarNote],
        label: noteName, // Store the note name as label for display
      });
    }

    if (chords.length > 0) {
      sectionCount++;
      const label = sectionCount === 1 ? currentSectionName : `${currentSectionName} (${sectionCount})`;
      sections.push({
        id: generateId(),
        name: label,
        chords,
      });
    }
  }

  // Fallback: parse all notes at once if no sections found
  if (sections.length === 0) {
    const allNotes = tokenizeWesternNotes(rawText);
    if (allNotes.length > 0) {
      const chords: TabChord[] = [];
      for (const noteName of allNotes) {
        const midi = noteNameToMidi(noteName, DEFAULT_OCTAVE);
        if (midi < 0) continue;

        const pos = midiToGuitarPosition(midi);
        if (!pos) continue;

        const guitarNote: GuitarNote = {
          string: pos.string,
          fret: pos.fret === 0 ? "0" : pos.fret,
          technique: "none",
        };

        chords.push({
          id: generateId(),
          notes: [guitarNote],
          label: noteName,
        });
      }

      if (chords.length > 0) {
        sections.push({ id: generateId(), name: "Main", chords });
      }
    }
  }

  // Extract title
  const detectedTitle =
    title ||
    rawText
      .split("\n")
      .find((l) => {
        const t = l.trim();
        return (
          t.length > 2 &&
          t.length < 80 &&
          !/keys?|scale|part|verse|chorus|note/i.test(t) &&
          !/[A-G]/.test(t) // avoid lines with lots of note names
        );
      })
      ?.trim() || "Western Notation";

  return {
    id: generateId(),
    title: detectedTitle,
    tuning: ["e", "B", "G", "D", "A", "E"],
    sections,
    createdAt: Date.now(),
    rawText,
  };
}
