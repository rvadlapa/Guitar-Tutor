import { GuitarNote, TabChord, TabSection, TabSong } from "@/context/TabContext";

const DEFAULT_TUNING = ["e", "B", "G", "D", "A", "E"];

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// Map a string label character to our string index (0=high e, 5=low E)
function getStringIndex(label: string): number {
  switch (label) {
    case "e": return 0; // high e
    case "B": return 1;
    case "G": return 2;
    case "D": return 3;
    case "A": return 4;
    case "E": return 5; // low E
    default: return -1;
  }
}

// Detect if a line looks like a guitar tab line (has a string label at start)
function isTabLine(line: string): { isTab: boolean; stringIndex: number; content: string } {
  // Match: optional whitespace, string label, separator (|, :, >, -, =, space), then tab content
  const match = line.match(/^\s*([eEBGDAb])\s*[|:>\-=]?\s*([-\d|xhbpvs/\\~\s]+)$/i);
  if (!match) return { isTab: false, stringIndex: -1, content: "" };

  const labelChar = match[1];
  const content = match[2];

  // Distinguish high e (lowercase) vs low E (uppercase)
  let stringIndex = -1;
  if (labelChar === "e") {
    stringIndex = 0; // high e (lowercase)
  } else if (labelChar === "E") {
    stringIndex = 5; // low E (uppercase)
  } else if (labelChar === "B" || labelChar === "b") {
    stringIndex = 1;
  } else if (labelChar === "G") {
    stringIndex = 2;
  } else if (labelChar === "D") {
    stringIndex = 3;
  } else if (labelChar === "A") {
    stringIndex = 4;
  }

  return { isTab: stringIndex !== -1, stringIndex, content };
}

// Extract technique marker from surrounding context
function detectTechnique(
  s: string
): "bend" | "slide" | "hammer" | "pull" | "vibrato" | "none" {
  if (/b/i.test(s) && !/^[0-9]+$/.test(s)) return "bend";
  if (/[/\\]/.test(s)) return "slide";
  if (/h/.test(s)) return "hammer";
  if (/p/.test(s)) return "pull";
  if (/~/.test(s)) return "vibrato";
  return "none";
}

// ─── Column-based tab parser ──────────────────────────────────────────────────
// Reads a block of 6 tab lines and extracts chords by scanning column by column.
// This correctly handles tab notation where dashes are filler and numbers = frets.

function parseTabBlock(
  lineMap: Map<number, string>
): TabChord[] {
  const chords: TabChord[] = [];

  // Find the content strings for each of the 6 string indices
  const stringContents: (string | null)[] = new Array(6).fill(null);
  lineMap.forEach((content, stringIndex) => {
    stringContents[stringIndex] = content;
  });

  // Normalize length by padding with dashes
  const maxLen = Math.max(
    ...stringContents.map((s) => (s ? s.length : 0))
  );
  if (maxLen === 0) return [];

  const padded = stringContents.map((s) =>
    s ? s.padEnd(maxLen, "-") : "-".repeat(maxLen)
  );

  let col = 0;
  while (col < maxLen) {
    const notes: GuitarNote[] = [];
    let colAdvance = 1;

    for (let si = 0; si < 6; si++) {
      const ch = padded[si][col];

      if (!ch || ch === "-" || ch === " " || ch === "|" || ch === "=") {
        continue;
      }

      if (ch === "x" || ch === "X") {
        notes.push({ string: si, fret: "x", technique: "none" });
        continue;
      }

      if (/\d/.test(ch)) {
        // Check for 2-digit fret number
        let fretStr = ch;
        const next = padded[si][col + 1];
        if (next && /\d/.test(next)) {
          fretStr += next;
          colAdvance = Math.max(colAdvance, 2);
        }

        // Look ahead/behind for technique markers
        const before = col > 0 ? padded[si][col - 1] : "";
        const after = padded[si][col + fretStr.length] ?? "";
        const technique = detectTechnique(before + after);

        const fretNum = parseInt(fretStr, 10);
        notes.push({
          string: si,
          fret: fretNum === 0 ? "0" : fretNum,
          technique,
        });
      }
    }

    if (notes.length > 0) {
      chords.push({ id: generateId(), notes });
    }

    col += colAdvance;
  }

  return chords;
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseGuitarTab(rawText: string, title?: string): TabSong {
  const lines = rawText.split("\n");
  const sections: TabSection[] = [];

  let i = 0;
  let sectionName = "Main";
  let sectionCount = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd(); // preserve leading spaces for alignment

    // Section header detection
    if (/^\[.+\]$/.test(line.trim())) {
      sectionName = line.trim().slice(1, -1);
      i++;
      continue;
    }

    const sectionKeywords = /^(verse|chorus|bridge|intro|outro|solo|pre-chorus|refrain|riff)/i;
    if (sectionKeywords.test(line.trim())) {
      sectionName = line.trim();
      i++;
      continue;
    }

    // Try to collect a block of tab lines starting at this position
    const tabCheck = isTabLine(line);
    if (!tabCheck.isTab) {
      i++;
      continue;
    }

    // Gather consecutive tab lines into a block
    // A block can contain lines for the same 6 strings; if we see the same
    // string index twice, that's a new block.
    const lineMap = new Map<number, string>();
    let j = i;

    while (j < lines.length) {
      const candidate = lines[j].trimEnd();
      if (!candidate.trim()) break; // blank line ends block

      const check = isTabLine(candidate);
      if (!check.isTab) break;

      // If this string index already added, we've hit a repeat → end block
      if (lineMap.has(check.stringIndex)) break;

      lineMap.set(check.stringIndex, check.content);
      j++;
    }

    // Need at least 3 recognized strings to form a valid block
    if (lineMap.size >= 3) {
      const chords = parseTabBlock(lineMap);

      if (chords.length > 0) {
        sectionCount++;
        const label =
          sectionCount === 1 ? sectionName : `${sectionName} (${sectionCount})`;

        sections.push({
          id: generateId(),
          name: label,
          chords,
        });
        sectionName = "Main"; // reset after using
      }
    }

    i = j > i ? j : i + 1;
  }

  if (sections.length === 0) {
    sections.push({
      id: generateId(),
      name: "Main",
      chords: createDemoChords(),
    });
  }

  return {
    id: generateId(),
    title: title || "Untitled Tab",
    tuning: DEFAULT_TUNING,
    sections,
    createdAt: Date.now(),
    rawText,
  };
}

function createDemoChords(): TabChord[] {
  const patterns: GuitarNote[][] = [
    [
      { string: 0, fret: 0, technique: "none" },
      { string: 1, fret: 1, technique: "none" },
      { string: 2, fret: 0, technique: "none" },
      { string: 3, fret: 2, technique: "none" },
      { string: 4, fret: 3, technique: "none" },
      { string: 5, fret: "x", technique: "none" },
    ],
    [
      { string: 0, fret: 2, technique: "none" },
      { string: 1, fret: 3, technique: "none" },
      { string: 2, fret: 2, technique: "none" },
      { string: 3, fret: 0, technique: "none" },
      { string: 4, fret: "x", technique: "none" },
      { string: 5, fret: "x", technique: "none" },
    ],
    [
      { string: 0, fret: 3, technique: "none" },
      { string: 1, fret: 3, technique: "none" },
      { string: 2, fret: 0, technique: "none" },
      { string: 3, fret: 0, technique: "none" },
      { string: 4, fret: 2, technique: "none" },
      { string: 5, fret: 3, technique: "none" },
    ],
  ];

  const chords: TabChord[] = [];
  for (let i = 0; i < 12; i++) {
    chords.push({
      id: generateId(),
      notes: patterns[i % patterns.length],
    });
  }
  return chords;
}

export function extractSongMeta(
  rawText: string
): { title?: string; artist?: string } {
  const lines = rawText.split("\n").slice(0, 12);
  const titleLine = lines.find((l) => /title[:=]/i.test(l));
  const artistLine = lines.find((l) => /artist[:=]|by[:=]/i.test(l));

  const title = titleLine
    ? titleLine.replace(/title[:=]/i, "").trim()
    : lines.find(
        (l) =>
          l.trim().length > 0 &&
          !isTabLine(l).isTab &&
          !/^[#\-=*]/.test(l.trim())
      )?.trim();

  const artist = artistLine
    ? artistLine.replace(/artist[:=]|by[:=]/i, "").trim()
    : undefined;

  return { title, artist };
}
