import { GuitarNote, TabChord, TabSection, TabSong } from "@/context/TabContext";

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// ─── Sargam note types ────────────────────────────────────────────────────────

export type SargamSyllable = "Sa" | "Re" | "Ga" | "Ma" | "Pa" | "Dha" | "Ni";

export type ParsedSargamNote = {
  syllable: SargamSyllable;
  komal: boolean;
  tivra: boolean;
  octave: number;
  label: string;
};

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

// ─── Guitar fretboard ─────────────────────────────────────────────────────────

const STRING_MIDI_OPEN = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2
const DEFAULT_SA_MIDI = 45; // A2

function sargamNoteToMidi(note: ParsedSargamNote, saMidi: number): number {
  const semiOffset = SEMITONES[semitoneKey(note)] ?? 0;
  const octaveOffset = (note.octave - 1) * 12;
  return saMidi + semiOffset + octaveOffset;
}

function midiToGuitarPosition(midi: number): { string: number; fret: number } | null {
  let best: { string: number; fret: number; score: number } | null = null;
  for (let si = 0; si < 6; si++) {
    const fret = midi - STRING_MIDI_OPEN[si];
    if (fret >= 0 && fret <= 15) {
      const score = fret * 2 + Math.abs(si - 3.5);
      if (!best || score < best.score) best = { string: si, fret, score };
    }
  }
  return best ? { string: best.string, fret: best.fret } : null;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

function tokenizeSargam(text: string): ParsedSargamNote[] {
  const notes: ParsedSargamNote[] = [];
  // Strip ellipsis / dots / repeat markers before parsing
  const cleaned = text.replace(/…+/g, " ").replace(/\.{2,}/g, " ").replace(/\(x\d+\)/gi, " ");
  let i = 0;
  let octave = 1;

  while (i < cleaned.length) {
    const ch = cleaned[i];

    if (ch === "'" || ch === "`" || ch === "," || ch === ".") { i++; continue; }
    if (/[\s\-_=|()[\]{};:+\/\\0-9]/.test(ch)) { i++; continue; }

    const rem = cleaned.slice(i);

    if (/^[Dd]ha/.test(rem)) {
      const komal = rem[0] === "d";
      notes.push({ syllable: "Dha", komal, tivra: false, octave, label: komal ? "dha" : "Dha" });
      i += 3; continue;
    }
    if (/^[Ss]a/.test(rem)) {
      const lower = rem[0] === "s";
      notes.push({ syllable: "Sa", komal: false, tivra: false, octave: lower ? octave - 1 : octave, label: lower ? "sa" : "Sa" });
      i += 2; continue;
    }
    if (/^[Rr][eiEI]/.test(rem)) {
      const komal = rem[0] === "r";
      notes.push({ syllable: "Re", komal, tivra: false, octave, label: komal ? "re" : "Re" });
      i += 2; continue;
    }
    if (/^[Gg]a/.test(rem)) {
      const komal = rem[0] === "g";
      notes.push({ syllable: "Ga", komal, tivra: false, octave, label: komal ? "ga" : "Ga" });
      i += 2; continue;
    }
    if (/^[Mm]a/.test(rem)) {
      const tivra = rem[2] === "#";
      notes.push({ syllable: "Ma", komal: false, tivra, octave, label: rem[0] === "m" ? "ma" : "Ma" });
      i += tivra ? 3 : 2; continue;
    }
    if (/^[Pp]a/.test(rem)) {
      const lower = rem[0] === "p";
      notes.push({ syllable: "Pa", komal: false, tivra: false, octave: lower ? octave - 1 : octave, label: lower ? "pa" : "Pa" });
      i += 2; continue;
    }
    if (/^[Nn]i/.test(rem)) {
      const komal = rem[0] === "n";
      notes.push({ syllable: "Ni", komal, tivra: false, octave, label: komal ? "ni" : "Ni" });
      i += 2; continue;
    }
    if (/^[Dd]a/.test(rem)) {
      const komal = rem[0] === "d";
      notes.push({ syllable: "Dha", komal, tivra: false, octave, label: komal ? "dha" : "Dha" });
      i += 2; continue;
    }
    i++;
  }
  return notes;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sargamNoteToTabChord(note: ParsedSargamNote, saMidi: number): TabChord | null {
  const midi = sargamNoteToMidi(note, saMidi);
  const pos = midiToGuitarPosition(midi);
  if (!pos) return null;
  const guitarNote: GuitarNote = {
    string: pos.string,
    fret: pos.fret === 0 ? "0" : pos.fret,
    technique: "none",
  };
  return { id: generateId(), notes: [guitarNote], label: note.label };
}

function sargamLineToCords(line: string, saMidi: number): TabChord[] {
  const notes = tokenizeSargam(line);
  const chords: TabChord[] = [];
  for (const note of notes) {
    const chord = sargamNoteToTabChord(note, saMidi);
    if (chord) chords.push(chord);
  }
  return chords;
}

// ─── Line classification ──────────────────────────────────────────────────────

function isSargamWord(word: string): boolean {
  let s = word.replace(/[^a-zA-Z#]/g, "");
  if (s.length === 0) return false;
  let iters = 30;
  while (s.length > 0 && iters-- > 0) {
    let matched = false;
    const patterns = [/^[Dd]ha/, /^[Ss]a/, /^[Rr][eiEI]/, /^[Gg]a/, /^[Mm]a#?/, /^[Pp]a/, /^[Nn]i/, /^[Dd]a/];
    for (const p of patterns) {
      if (p.test(s)) { s = s.replace(p, ""); matched = true; break; }
    }
    if (!matched) return false;
  }
  return s.length === 0;
}

function estimateSargamDensity(text: string): number {
  if (!text) return 0;
  // Strip ellipsis and repeat markers before checking
  const cleaned = text.replace(/…+/g, " ").replace(/\.{2,}/g, " ").replace(/\(x\d+\)/gi, " ");
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 0;
  let count = 0;
  for (const w of words) if (isSargamWord(w)) count++;
  return count / words.length;
}

function isSargamLine(text: string): boolean {
  return estimateSargamDensity(text) > 0.4;
}

// Extract (x2) / (X3) repeat count from a lyric line
function extractRepeatCount(line: string): number {
  const m = line.match(/\(x(\d+)\)/i);
  return m ? parseInt(m[1], 10) : 1;
}

// ─── Section header patterns ──────────────────────────────────────────────────

const SECTION_RE =
  /^\s*[\(\[]?(part|verse|chorus|bridge|intro|outro|variation|refrain|stanza|antara|pallavi|charanam|mukha|anupallavi|sam|tara|mandra)\s*\d*[\)\]]?/i;

// Repeat instruction: "Repeat part 2", "Repeat chorus", etc.
const REPEAT_RE = /^repeat\s+(part\s*\d+|\w+)/i;

// ─── Key / Sa extraction ──────────────────────────────────────────────────────

function noteNameToMidi(name: string): number {
  const notes: Record<string, number> = {
    C: 48, "C#": 49, Db: 49, D: 50, "D#": 51, Eb: 51,
    E: 52, F: 53, "F#": 54, Gb: 54, G: 55, "G#": 56,
    Ab: 56, A: 57, "A#": 58, Bb: 58, B: 59,
  };
  return notes[name] ?? DEFAULT_SA_MIDI;
}

function extractSaMidi(text: string): number {
  const saMatch = text.match(/[Ss]a\s*[=:]\s*([A-G][b#]?)/);
  if (saMatch) return noteNameToMidi(saMatch[1]);
  const maPianoMatch = text.match(/([A-G][b#]?)\s*=\s*[Mm]a/);
  if (maPianoMatch) return noteNameToMidi(maPianoMatch[1]) - 5;
  return DEFAULT_SA_MIDI;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseSargamText(rawText: string, title?: string): TabSong {
  const saMidi = extractSaMidi(rawText);
  const lines = rawText.split("\n");

  // Map of lowercase section name → chords (for repeat lookup)
  const sectionMap = new Map<string, TabChord[]>();
  const sections: TabSection[] = [];

  let currentSectionName = "Intro";
  let currentChords: TabChord[] = [];
  let pendingRepeat = 1; // repeat count carried from the previous lyric line

  function flushSection() {
    if (currentChords.length === 0) return;
    sections.push({ id: generateId(), name: currentSectionName, chords: currentChords });
    sectionMap.set(currentSectionName.toLowerCase(), currentChords);
    currentChords = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip bare numbers (e.g. "11", "7")
    if (/^\d+$/.test(trimmed)) continue;

    // ── Section header ──────────────────────────────────────────────────────
    if (SECTION_RE.test(trimmed)) {
      flushSection();
      currentSectionName = trimmed.replace(/[()[\]]/g, "").trim();
      pendingRepeat = 1;
      continue;
    }

    // ── Repeat instruction: "Repeat part 2" ────────────────────────────────
    if (REPEAT_RE.test(trimmed)) {
      const m = trimmed.match(/^repeat\s+(.+)/i);
      if (m) {
        const target = m[1].trim().toLowerCase();
        // Find best matching section
        let found: TabChord[] | undefined;
        for (const [key, chords] of sectionMap) {
          if (key.includes(target) || target.includes(key)) {
            found = chords;
            break;
          }
        }
        if (found) {
          // Clone the chords and append to current section
          const cloned = found.map((c) => ({ ...c, id: generateId() }));
          currentChords.push(...cloned);
        }
      }
      continue;
    }

    // ── Sargam line ─────────────────────────────────────────────────────────
    if (isSargamLine(trimmed)) {
      const lineChords = sargamLineToCords(trimmed, saMidi);
      // Repeat the line's chords pendingRepeat times
      for (let r = 0; r < pendingRepeat; r++) {
        const cloned = lineChords.map((c) => ({ ...c, id: generateId() }));
        currentChords.push(...cloned);
      }
      pendingRepeat = 1; // reset after consuming
      continue;
    }

    // ── Lyric line — extract repeat count for the NEXT sargam line ─────────
    pendingRepeat = extractRepeatCount(trimmed);
  }

  flushSection();

  // Fallback
  if (sections.length === 0) {
    const allNotes = tokenizeSargam(rawText);
    const chords: TabChord[] = [];
    for (const note of allNotes) {
      const chord = sargamNoteToTabChord(note, saMidi);
      if (chord) chords.push(chord);
    }
    if (chords.length > 0) sections.push({ id: generateId(), name: "Main", chords });
  }

  // Title detection
  const detectedTitle =
    title ||
    lines
      .map((l) => l.trim())
      .find((t) => {
        if (!t || t.length < 4 || t.length > 80) return false;
        if (SECTION_RE.test(t) || REPEAT_RE.test(t)) return false;
        if (isSargamLine(t)) return false;
        if (/^\d+$/.test(t)) return false;
        return true;
      })
      ?.replace(/\(x\d+\)/gi, "")
      .trim() || "Sargam";

  return {
    id: generateId(),
    title: detectedTitle,
    tuning: ["e", "B", "G", "D", "A", "E"],
    sections,
    createdAt: Date.now(),
    rawText,
  };
}

// ─── Detection ────────────────────────────────────────────────────────────────

export function isSargamText(text: string): boolean {
  if (/^[eEBGDAb]\s*[|:>]/m.test(text)) return false;
  const concatenated = /((?:Sa|sa|Re|re|Ri|ri|Ga|ga|Ma|ma|Pa|pa|Dha|dha|Da|da|Ni|ni){2,})/g;
  const matches = text.match(concatenated);
  return !!matches && matches.length >= 3;
}

export function getSargamRootName(saMidi: number): string {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  return names[((saMidi - 48) % 12 + 12) % 12];
}
