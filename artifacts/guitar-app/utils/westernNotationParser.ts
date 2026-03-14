import { GuitarNote, TabChord, TabSection, TabSong } from "@/context/TabContext";
import { midiToGuitarPosition } from "@/utils/sargamParser";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// ─── Chromatic note → semitone (C = 0) ────────────────────────────────────────

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,  "C#": 1, Db: 1,
  D: 2,  "D#": 3, Eb: 3,
  E: 4,
  F: 5,  "F#": 6, Gb: 6,
  G: 7,  "G#": 8, Ab: 8,
  A: 9,  "A#": 10, Bb: 10,
  B: 11,
};

// ─── Semitone offset from Sa → sargam label ───────────────────────────────────
//
// Sa = Bb3 = MIDI 58 (DEFAULT_SA_MIDI matches sargamParser.ts)
// Offset = (midi - SA_MIDI + 120) % 12

const SA_MIDI = 58; // Bb3

const OFFSET_TO_SARGAM: Record<number, string> = {
  0:  "Sa",
  1:  "re",   // komal Re
  2:  "Re",
  3:  "ga",   // komal Ga
  4:  "Ga",
  5:  "Ma",
  6:  "Ma#",  // tivra Ma
  7:  "Pa",
  8:  "dha",  // komal Dha
  9:  "Dha",
  10: "ni",   // komal Ni
  11: "Ni",
};

function midiToSargamLabel(midi: number): string {
  const offset = ((midi - SA_MIDI) % 12 + 12) % 12;
  return OFFSET_TO_SARGAM[offset] ?? "?";
}

// midiToGuitarPosition is imported from sargamParser — uses the same
// G·B·e cross-string 3rd-position table as the sargam notation display.

// ─── Octave-aware MIDI helper ─────────────────────────────────────────────────
//
// Given a note name (e.g. "G#") and the previous MIDI value, find the
// octave that puts the note closest to the previous note. This lets the
// melody travel smoothly without suddenly jumping octaves.

function noteToMidiNearest(noteName: string, anchorMidi: number): number {
  const semitone = NOTE_TO_SEMITONE[noteName];
  if (semitone === undefined) return -1;

  let bestMidi = -1;
  let bestDist = Infinity;
  for (let oct = 2; oct <= 7; oct++) {
    const midi = 12 + oct * 12 + semitone;
    const dist = Math.abs(midi - anchorMidi);
    if (dist < bestDist) { bestDist = dist; bestMidi = midi; }
  }
  return bestMidi;
}

// ─── Token parsing ────────────────────────────────────────────────────────────
//
// Each space-delimited token (e.g. "G#D#", "FG#", "A#") represents one
// beat / chord. Within a token, note names are concatenated without spaces.
// Extract them using the pattern: uppercase A-G followed by optional # or b.
//
// The lookahead (?=[^a-z]|$) prevents matching the 'b' in words like "Ab3rd".

function tokenizeChordToken(token: string): string[] {
  const matches = token.match(/[A-G](?:[#b](?=[A-Z#b]|$))?/g) ?? [];
  return matches.filter((m) => NOTE_TO_SEMITONE[m] !== undefined);
}

// ─── Line classification ──────────────────────────────────────────────────────

const SECTION_HEADER_RE =
  /^(part|verse|chorus|intro|bridge|outro|section|repeat|interlude)\b/i;

function isNoteOnlyLine(trimmed: string): boolean {
  if (/[^\x00-\x7F]/.test(trimmed)) return false; // non-ASCII → lyrics
  if (/^\d+$/.test(trimmed)) return false;         // bare number → skip
  if (SECTION_HEADER_RE.test(trimmed)) return false;

  // Each space-separated token should mostly be note names
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  let noteTokens = 0;
  for (const tok of tokens) {
    if (tokenizeChordToken(tok).length > 0) noteTokens++;
  }
  return noteTokens / tokens.length >= 0.6;
}

// ─── Main parser ──────────────────────────────────────────────────────────────
//
// Each space-delimited token → one TabChord (all its notes sound together).
// Label = sargam name of the first/root note of the chord.

export function parseWesternNotation(rawText: string, title?: string): TabSong {
  const lines = rawText.split("\n");

  const sections: TabSection[] = [];
  let currentSectionName = "Main";
  let currentChords: TabChord[] = [];

  // Anchor at Pa (F4 = MIDI 65) — the center of the G·B·e cross-string range.
  // This ensures the first note snaps to the main octave (G·B·e strings)
  // rather than the lower octave (D·A·E strings).
  let prevMidi = 65;

  const flushSection = () => {
    if (currentChords.length > 0) {
      sections.push({ id: generateId(), name: currentSectionName, chords: currentChords });
      currentChords = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (SECTION_HEADER_RE.test(trimmed)) {
      flushSection();
      currentSectionName = trimmed;
      prevMidi = SA_MIDI; // reset octave anchor per section
      continue;
    }

    if (!isNoteOnlyLine(trimmed)) continue;

    // Each whitespace-delimited token = one chord beat
    const tokens = trimmed.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const noteNames = tokenizeChordToken(token);
      if (noteNames.length === 0) continue;

      // Each note in a token is a subdivision of one beat (like sargam parser).
      // duration = 1/N so N notes together fill exactly one beat.
      const duration = 1 / noteNames.length;

      for (const noteName of noteNames) {
        const midi = noteToMidiNearest(noteName, prevMidi);
        if (midi < 0) continue;

        const pos = midiToGuitarPosition(midi);
        if (!pos) continue;

        currentChords.push({
          id: generateId(),
          notes: [{
            string: pos.string,
            fret: pos.fret === 0 ? "0" : pos.fret,
            technique: "none",
          }],
          label: midiToSargamLabel(midi),
          duration,
        });

        prevMidi = midi;
      }
    }
  }

  flushSection();

  // Fallback: try to parse the whole blob if no structured sections found
  if (sections.length === 0) {
    let anchor = 65; // F4/Pa — center of G·B·e range
    const chords: TabChord[] = [];
    const tokens = rawText.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
      const noteNames = tokenizeChordToken(token);
      if (noteNames.length === 0) continue;

      const duration = 1 / noteNames.length;

      for (const name of noteNames) {
        const midi = noteToMidiNearest(name, anchor);
        if (midi < 0) continue;
        const pos = midiToGuitarPosition(midi);
        if (!pos) continue;
        chords.push({
          id: generateId(),
          notes: [{
            string: pos.string,
            fret: pos.fret === 0 ? "0" : pos.fret,
            technique: "none",
          }],
          label: midiToSargamLabel(midi),
          duration,
        });
        anchor = midi;
      }
    }

    if (chords.length > 0) sections.push({ id: generateId(), name: "Main", chords });
  }

  // Title detection
  const detectedTitle =
    title ||
    lines
      .map((l) => l.trim())
      .find((t) => {
        if (!t || t.length < 3 || t.length > 80) return false;
        if (SECTION_HEADER_RE.test(t)) return false;
        if (isNoteOnlyLine(t)) return false;
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

// ─── Auto-detection ────────────────────────────────────────────────────────────
//
// Returns true if the text looks like Western note notation (A-G with #/b),
// not guitar tab ASCII art, and not sargam syllables.

export function isWesternNotationText(text: string): boolean {
  // Reject guitar tab ASCII art
  if (/^[eEBGDAb]\s*[|:>]/m.test(text)) return false;
  // Reject sargam (consecutive syllables like SaRe or space-separated Sa Re)
  if (/((?:Sa|sa|Re|re|Ri|ri|Ga|ga|Ma|ma|Pa|pa|Dha|dha|Ni|ni){2,})/g.test(text)) return false;

  // Count space-delimited tokens that look like note chord-groups
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return false;

  let noteTokens = 0;
  for (const tok of tokens) {
    if (tokenizeChordToken(tok).length > 0) noteTokens++;
  }

  // At least 60% of tokens must be parseable as note names
  return noteTokens / tokens.length >= 0.6 && noteTokens >= 3;
}
