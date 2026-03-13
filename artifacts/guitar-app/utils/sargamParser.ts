import { GuitarNote, TabChord, TabSection, TabSong } from "@/context/TabContext";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// ─── Sargam note types ───────────────────────────────────────────────────────

export type SargamSyllable = "Sa" | "Re" | "Ga" | "Ma" | "Pa" | "Dha" | "Ni";

export type ParsedSargamNote = {
  syllable: SargamSyllable;
  komal: boolean;   // lowercase first letter = komal (flat)
  tivra: boolean;   // only for Ma tivra (augmented 4th)
  octave: number;   // 0 = lower octave, 1 = middle, 2 = upper
  label: string;    // display label e.g. "sa", "Ga", "ni"
};

// Semitone offsets from Sa for each note variant
const SEMITONES: Record<string, number> = {
  Sa: 0,
  "Re-komal": 1,
  Re: 2,
  "Ga-komal": 3,
  Ga: 4,
  Ma: 5,
  "Ma-tivra": 6,
  Pa: 7,
  "Dha-komal": 8,
  Dha: 9,
  "Ni-komal": 10,
  Ni: 11,
};

function semitoneKey(note: ParsedSargamNote): string {
  if (note.tivra) return `${note.syllable}-tivra`;
  if (note.komal) return `${note.syllable}-komal`;
  return note.syllable;
}

// ─── Guitar fretboard mapping ────────────────────────────────────────────────
// Default: Sa = A (string 4, fret 0) — most guitar-friendly root.
// Covers a full octave across strings 4→3→2 with mostly open/low frets.
// Override with a different rootMidi to transpose.

// Standard tuning MIDI base notes per string (index 0=high e, 5=low E):
const STRING_MIDI_OPEN = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2

// Sa = A2 = MIDI 45
const DEFAULT_SA_MIDI = 45; // A2

function sargamNoteToMidi(note: ParsedSargamNote, saMidi: number): number {
  const semiOffset = SEMITONES[semitoneKey(note)] ?? 0;
  const octaveOffset = (note.octave - 1) * 12; // octave 1 = middle
  return saMidi + semiOffset + octaveOffset;
}

function midiToGuitarPosition(midi: number): { string: number; fret: number } | null {
  // Find the best position (prefer lower frets, prefer middle strings)
  let best: { string: number; fret: number; score: number } | null = null;

  for (let si = 0; si < 6; si++) {
    const fret = midi - STRING_MIDI_OPEN[si];
    if (fret >= 0 && fret <= 15) {
      // Score: prefer lower frets and middle strings (3, 4)
      const score = fret * 2 + Math.abs(si - 3.5);
      if (!best || score < best.score) {
        best = { string: si, fret, score };
      }
    }
  }

  return best ? { string: best.string, fret: best.fret } : null;
}

// ─── Tokenizer ───────────────────────────────────────────────────────────────

function tokenizeSargam(text: string): ParsedSargamNote[] {
  const notes: ParsedSargamNote[] = [];
  let i = 0;
  let octave = 1; // default middle octave

  while (i < text.length) {
    const ch = text[i];

    // Octave markers: dots/apostrophes above/below
    if (ch === "'" || ch === "`" || ch === "," || ch === ".") {
      // Skip octave markers for now (could enhance later)
      i++;
      continue;
    }

    // Skip non-note characters
    if (/[\s\-_=|()[\]{};:+]/.test(ch)) {
      i++;
      continue;
    }

    const remaining = text.slice(i);

    // Try to match sargam syllables (longest match first)
    // Dha / dha (3 chars) — must come before Da/da
    if (/^[Dd]ha/.test(remaining)) {
      const komal = remaining[0] === "d";
      notes.push({
        syllable: "Dha",
        komal,
        tivra: false,
        octave,
        label: komal ? "dha" : "Dha",
      });
      i += 3;
      continue;
    }

    // Sa / sa (2 chars)
    if (/^[Ss]a/.test(remaining)) {
      const komal = remaining[0] === "s";
      notes.push({
        syllable: "Sa",
        komal: false, // Sa has no komal
        tivra: false,
        octave: komal ? octave - 1 : octave, // lowercase sa = lower octave
        label: remaining[0] === "s" ? "sa" : "Sa",
      });
      i += 2;
      continue;
    }

    // Re / re / Ri / ri (2 chars)
    if (/^[Rr][eiEI]/.test(remaining)) {
      const komal = remaining[0] === "r";
      notes.push({
        syllable: "Re",
        komal,
        tivra: false,
        octave,
        label: komal ? "re" : "Re",
      });
      i += 2;
      continue;
    }

    // Ga / ga (2 chars)
    if (/^[Gg]a/.test(remaining)) {
      const komal = remaining[0] === "g";
      notes.push({
        syllable: "Ga",
        komal,
        tivra: false,
        octave,
        label: komal ? "ga" : "Ga",
      });
      i += 2;
      continue;
    }

    // Ma / ma (2 chars) — check for 'Ma#' or 'ma#' for tivra
    if (/^[Mm]a/.test(remaining)) {
      const komal = remaining[0] === "m";
      const tivra = remaining[2] === "#";
      notes.push({
        syllable: "Ma",
        komal: false, // Ma komal not standard; lowercase = softer but same pitch
        tivra,
        octave,
        label: komal ? "ma" : "Ma",
      });
      i += tivra ? 3 : 2;
      continue;
    }

    // Pa / pa (2 chars)
    if (/^[Pp]a/.test(remaining)) {
      const komal = remaining[0] === "p";
      notes.push({
        syllable: "Pa",
        komal: false, // Pa has no komal
        tivra: false,
        octave: komal ? octave - 1 : octave,
        label: komal ? "pa" : "Pa",
      });
      i += 2;
      continue;
    }

    // Ni / ni (2 chars)
    if (/^[Nn]i/.test(remaining)) {
      const komal = remaining[0] === "n";
      notes.push({
        syllable: "Ni",
        komal,
        tivra: false,
        octave,
        label: komal ? "ni" : "Ni",
      });
      i += 2;
      continue;
    }

    // Da / da (alternate for Dha)
    if (/^[Dd]a/.test(remaining)) {
      const komal = remaining[0] === "d";
      notes.push({
        syllable: "Dha",
        komal,
        tivra: false,
        octave,
        label: komal ? "dha" : "Dha",
      });
      i += 2;
      continue;
    }

    i++;
  }

  return notes;
}

// ─── Convert sargam notes → TabChords ────────────────────────────────────────

function sargamNoteToTabChord(
  note: ParsedSargamNote,
  saMidi: number
): TabChord | null {
  const midi = sargamNoteToMidi(note, saMidi);
  const pos = midiToGuitarPosition(midi);
  if (!pos) return null;

  const guitarNote: GuitarNote = {
    string: pos.string,
    fret: pos.fret === 0 ? "0" : pos.fret,
    technique: "none",
  };

  return {
    id: generateId(),
    notes: [guitarNote],
    label: note.label,
  };
}

// ─── Detect sargam format ─────────────────────────────────────────────────────

// Checks whether a single word is made entirely of sargam syllables
function isSargamWord(word: string): boolean {
  let s = word.replace(/[^a-zA-Z#]/g, ""); // strip punctuation
  if (s.length === 0) return false;
  let iters = 30;
  while (s.length > 0 && iters-- > 0) {
    let matched = false;
    const patterns: Array<[RegExp]> = [
      [/^[Dd]ha/],
      [/^[Ss]a/],
      [/^[Rr][eiEI]/],
      [/^[Gg]a/],
      [/^[Mm]a#?/],
      [/^[Pp]a/],
      [/^[Nn]i/],
      [/^[Dd]a/],
    ];
    for (const [p] of patterns) {
      if (p.test(s)) {
        s = s.replace(p, "");
        matched = true;
        break;
      }
    }
    if (!matched) return false; // leftover non-sargam chars
  }
  return s.length === 0;
}

export function isSargamText(text: string): boolean {
  // Must NOT be a guitar tab
  const hasTabLines = /^[eEBGDAb]\s*[|:>]/m.test(text);
  if (hasTabLines) return false;

  // Check for concatenated sargam patterns (2+ syllables stuck together)
  // e.g. "maPa", "SaGaMa", "niPaDha" — hallmark of sargam notation
  const concatenated =
    /((?:Sa|sa|Re|re|Ri|ri|Ga|ga|Ma|ma|Pa|pa|Dha|dha|Da|da|Ni|ni){2,})/g;
  const matches = text.match(concatenated);
  return !!matches && matches.length >= 3;
}

// ─── Extract key/scale from text ─────────────────────────────────────────────

function extractSaMidi(text: string): number {
  // Look for "Scale – XYZ" or "Key: X" patterns
  const scaleMatch = text.match(/[Ss]cale\s*[-–]\s*([A-Gb#]+)/);
  if (scaleMatch) {
    const scalePart = scaleMatch[1];
    // First note of scale could be Sa or the note indicated
    // For now, check if "ma" is indicated as a specific note
    const maPianoMatch = text.match(/([A-G][b#]?)\s*=\s*[Mm]a/);
    if (maPianoMatch) {
      const maNote = maPianoMatch[1];
      const maMidi = noteNameToMidi(maNote);
      // Ma is 5 semitones above Sa (shuddha Ma)
      return maMidi - 5;
    }
  }

  // Check for explicit "Sa = X" patterns
  const saMatch = text.match(/[Ss]a\s*[=:]\s*([A-G][b#]?)/);
  if (saMatch) return noteNameToMidi(saMatch[1]);

  // Check if there's a key signature mentioned (FGA#B... → infer Sa from Ma)
  // Like "FGA#BCD#E – maPaNiSagaGa": F=ma → Sa = F-5semitones = C
  const keyNoteMatch = text.match(/[Kk]eys?\s+used[^–\n]*[-–]\s*([A-G][b#]?)/);
  if (keyNoteMatch) {
    const firstNote = keyNoteMatch[1];
    // In "maPaNiSagaGa" the first is "ma", so first key note = Ma
    const firstNoteMidi = noteNameToMidi(firstNote);
    // Assume first key note is Ma (5 semitones above Sa)
    return firstNoteMidi - 5;
  }

  // Default: Sa = A (guitar-friendly)
  return DEFAULT_SA_MIDI;
}

function noteNameToMidi(name: string): number {
  const notes: Record<string, number> = {
    C: 48, "C#": 49, Db: 49,
    D: 50, "D#": 51, Eb: 51,
    E: 52, F: 53, "F#": 54, Gb: 54,
    G: 55, "G#": 56, Ab: 56,
    A: 57, "A#": 58, Bb: 58,
    B: 59,
  };
  return notes[name] ?? DEFAULT_SA_MIDI;
}

// ─── Parse section blocks ─────────────────────────────────────────────────────

export function parseSargamText(rawText: string, title?: string): TabSong {
  const saMidi = extractSaMidi(rawText);
  const lines = rawText.split("\n");
  const sections: TabSection[] = [];

  let currentSectionName = "Intro";
  let currentNoteLines: string[] = [];

  function flushSection() {
    const combined = currentNoteLines.join(" ");
    const sargamNotes = tokenizeSargam(combined);
    if (sargamNotes.length === 0) return;

    const chords: TabChord[] = [];
    for (const note of sargamNotes) {
      const chord = sargamNoteToTabChord(note, saMidi);
      if (chord) chords.push(chord);
    }

    if (chords.length > 0) {
      sections.push({
        id: generateId(),
        name: currentSectionName,
        chords,
      });
    }
    currentNoteLines = [];
  }

  const sectionPattern =
    /^\s*[\(\[]?(verse|chorus|bridge|intro|outro|variation|refrain|stanza|antara|pallavi|charanam|mukha|anupallavi|sam|tara|mandra)\s*\d*[\)\]]?/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect section headers
    if (sectionPattern.test(trimmed) || /^\s*[\(\[]\s*\w/.test(trimmed)) {
      flushSection();
      currentSectionName = trimmed.replace(/[()[\]]/g, "").trim();
      continue;
    }

    // Skip lyric lines (contains mostly non-sargam words)
    // A sargam line has a high density of sargam syllables
    const sargamDensity = estimateSargamDensity(trimmed);
    if (sargamDensity > 0.3) {
      currentNoteLines.push(trimmed);
    }
    // else: probably lyrics, skip
  }

  flushSection();

  // If no structured sections found, parse the whole text as one section
  if (sections.length === 0) {
    const allNotes = tokenizeSargam(rawText);
    const chords: TabChord[] = [];
    for (const note of allNotes) {
      const chord = sargamNoteToTabChord(note, saMidi);
      if (chord) chords.push(chord);
    }
    if (chords.length > 0) {
      sections.push({ id: generateId(), name: "Main", chords });
    }
  }

  // Try to extract title from text
  const detectedTitle =
    title ||
    rawText.split("\n").find((l) => {
      const t = l.trim();
      return (
        t.length > 3 &&
        t.length < 80 &&
        !isSargamLine(t) &&
        !/author|key|scale|variation|raag/i.test(t)
      );
    })?.trim() ||
    "Sargam";

  return {
    id: generateId(),
    title: detectedTitle,
    tuning: ["e", "B", "G", "D", "A", "E"],
    sections,
    createdAt: Date.now(),
    rawText,
  };
}

function isSargamLine(text: string): boolean {
  return estimateSargamDensity(text) > 0.4;
}

function estimateSargamDensity(text: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 0;
  let sargamCount = 0;
  for (const word of words) {
    if (isSargamWord(word)) {
      sargamCount++;
    }
  }
  return sargamCount / words.length;
}

export function getSargamRootName(saMidi: number): string {
  const names = [
    "C","C#","D","D#","E","F","F#","G","G#","A","A#","B",
  ];
  return names[((saMidi - 48) % 12 + 12) % 12];
}
