import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Design tokens ─────────────────────────────────────────────────────────

const T = {
  bg:        "#1A1510",
  card:      "#252018",
  cardAlt:   "#2A2218",
  border:    "#3A3025",
  text:      "#F0EAE0",
  textSub:   "#B0A090",
  textMuted: "#706050",
  root:      "#C4761A",   // Sa root fill
  rootText:  "#FFF0DC",
  main:      "#2E2816",   // middle octave fill
  mainBrd:   "#E8872A",   // orange border
  lower:     "#0E2820",   // lower octave fill
  lowerBrd:  "#45D68A",   // teal border
  upper:     "#2E1525",   // upper octave fill
  upperBrd:  "#FF8FAD",   // rose border
  tint:      "#E8872A",
  strLine:   "#4A3A2A",
};

// ─── Note types ─────────────────────────────────────────────────────────────

type NType = "root" | "main" | "lower" | "upper";

interface NotePos { label: string; fret: number; type: NType; }

// ─── Fretboard data ───────────────────────────────────────────────────────────
//
// Positions sourced from CROSS_STRING_POSITIONS in sargamParser.ts (Bb Major,
// standard tuning, cross-string 3rd-position fingering).
//
// MIDI open strings: E2=40  A2=45  D3=50  G3=55  B3=59  E4=64
//
// Lower octave (on E / A / D strings):
//   sa  Bb2=46 → E  fret 6      re  C3=48  → A  fret 3
//   ga  D3=50  → A  fret 5      ma  Eb3=51 → A  fret 6
//   pa  F3=53  → D  fret 3      dha G3=55  → D  fret 5
//   ni  A3=57  → D  fret 7
// Main octave (on G / B / e strings):
//   Sa  Bb3=58 → G  fret 3      Re  C4=60  → G  fret 5
//   Ga  D4=62  → B  fret 3      Ma  Eb4=63 → B  fret 4
//   Pa  F4=65  → B  fret 6      Dha G4=67  → e  fret 3
//   Ni  A4=69  → e  fret 5      Sa' Bb4=70 → e  fret 6

const PRIMARY: { name: string; color: string; notes: NotePos[] }[] = [
  {
    name: "e",
    color: "#FF6B6B",
    notes: [
      { label: "Pa",  fret: 1,  type: "main"  },
      { label: "Dha", fret: 3,  type: "main"  },
      { label: "Ni",  fret: 5,  type: "main"  },
      { label: "Sa'", fret: 6,  type: "root"  },
      { label: "Re'", fret: 8,  type: "upper" },
      { label: "Ga'", fret: 10, type: "upper" },
      { label: "Ma'", fret: 11, type: "upper" },
    ],
  },
  {
    name: "B",
    color: "#FFB347",
    notes: [
      { label: "Re",  fret: 1,  type: "main"  },
      { label: "Ga",  fret: 3,  type: "main"  },
      { label: "Ma",  fret: 4,  type: "main"  },
      { label: "Pa",  fret: 6,  type: "main"  },
      { label: "Dha", fret: 8,  type: "main"  },
      { label: "Ni",  fret: 10, type: "main"  },
      { label: "Sa'", fret: 11, type: "root"  },
    ],
  },
  {
    name: "G",
    color: "#FFE55C",
    notes: [
      { label: "dha", fret: 0,  type: "lower" },
      { label: "ni",  fret: 2,  type: "lower" },
      { label: "Sa",  fret: 3,  type: "root"  },
      { label: "Re",  fret: 5,  type: "main"  },
      { label: "Ga",  fret: 7,  type: "main"  },
      { label: "Ma",  fret: 8,  type: "main"  },
      { label: "Pa",  fret: 10, type: "main"  },
    ],
  },
];

// Lower strings — cross-string positions only (from CROSS_STRING_POSITIONS):
//   D string role: pa(3=F3)  dha(5=G3)  ni(7=A3)  [+ Sa(8=Bb3) root reference]
//   A string role: re(3=C3)  ga(5=D3)   ma(6=Eb3) [+ sa(1=Bb2) root reference]
//   E string role: sa(6=Bb2) [+ ni(5=A2) below as approach note]

const LOWER: { name: string; color: string; notes: NotePos[] }[] = [
  {
    name: "D",
    color: "#5BC4FF",
    notes: [
      { label: "pa", fret: 3,  type: "lower" }, // F3  — cross-string position
      { label: "dha",fret: 5,  type: "lower" }, // G3  — cross-string position
      { label: "ni", fret: 7,  type: "lower" }, // A3  — cross-string position
      { label: "Sa", fret: 8,  type: "root"  }, // Bb3 — root reference (same as G-3)
    ],
  },
  {
    name: "A",
    color: "#B47BFF",
    notes: [
      { label: "sa", fret: 1,  type: "root"  }, // Bb2 — root reference (same as E-6)
      { label: "re", fret: 3,  type: "lower" }, // C3  — cross-string position
      { label: "ga", fret: 5,  type: "lower" }, // D3  — cross-string position
      { label: "ma", fret: 6,  type: "lower" }, // Eb3 — cross-string position
    ],
  },
  {
    name: "E",
    color: "#57FF9E",
    notes: [
      { label: "ni", fret: 5,  type: "lower" }, // A2  — approach note
      { label: "sa", fret: 6,  type: "root"  }, // Bb2 — cross-string position
    ],
  },
];

// Full ascending scale run — positions from CROSS_STRING_POSITIONS in sargamParser.ts
// Lower octave: sa(E-6) re(A-3) ga(A-5) ma(A-6) pa(D-3) dha(D-5) ni(D-7)
// Main octave:  Sa(G-3) Re(G-5) Ga(B-3) Ma(B-4) Pa(B-6) Dha(e-3) Ni(e-5) Sa'(e-6)
// Upper:        Re'(e-8) Ga'(e-10) Ma'(e-11)
const SCALE_RUN: { label: string; string: string; fret: number; type: NType }[] = [
  { label: "sa",  string: "E", fret: 6,  type: "root"  }, // Bb2 — E fret 6
  { label: "re",  string: "A", fret: 3,  type: "lower" }, // C3  — A fret 3  ← was E-8
  { label: "ga",  string: "A", fret: 5,  type: "lower" }, // D3  — A fret 5
  { label: "ma",  string: "A", fret: 6,  type: "lower" }, // Eb3 — A fret 6
  { label: "pa",  string: "D", fret: 3,  type: "lower" }, // F3  — D fret 3  ← was A-8
  { label: "dha", string: "D", fret: 5,  type: "lower" }, // G3  — D fret 5
  { label: "ni",  string: "D", fret: 7,  type: "lower" }, // A3  — D fret 7
  { label: "Sa",  string: "G", fret: 3,  type: "root"  }, // Bb3 — G fret 3
  { label: "Re",  string: "G", fret: 5,  type: "main"  }, // C4  — G fret 5
  { label: "Ga",  string: "B", fret: 3,  type: "main"  }, // D4  — B fret 3
  { label: "Ma",  string: "B", fret: 4,  type: "main"  }, // Eb4 — B fret 4
  { label: "Pa",  string: "B", fret: 6,  type: "main"  }, // F4  — B fret 6
  { label: "Dha", string: "e", fret: 3,  type: "main"  }, // G4  — e fret 3
  { label: "Ni",  string: "e", fret: 5,  type: "main"  }, // A4  — e fret 5
  { label: "Sa'", string: "e", fret: 6,  type: "root"  }, // Bb4 — e fret 6
  { label: "Re'", string: "e", fret: 8,  type: "upper" }, // C5  — e fret 8
  { label: "Ga'", string: "e", fret: 10, type: "upper" }, // D5  — e fret 10
  { label: "Ma'", string: "e", fret: 11, type: "upper" }, // Eb5 — e fret 11
];

const NOTE_KEY = [
  { s: "Sa", w: "B♭" },
  { s: "Re", w: "C"  },
  { s: "Ga", w: "D"  },
  { s: "Ma", w: "E♭" },
  { s: "Pa", w: "F"  },
  { s: "Dha",w: "G"  },
  { s: "Ni", w: "A"  },
];

// ─── Layout constants ─────────────────────────────────────────────────────────

const FRET_W   = 46;
const NOTE_D   = 34;  // diameter of note circle
const STRING_H = 52;
const LABEL_W  = 40;
const FRET_DOT_FRETS = [3, 5, 7, 9, 12];
const MAX_FRET = 12;

// ─── Sub-components ──────────────────────────────────────────────────────────

function noteStyle(type: NType) {
  switch (type) {
    case "root":  return { bg: T.root,  border: T.root,  txt: T.rootText };
    case "main":  return { bg: T.main,  border: T.mainBrd,  txt: "#E8872A" };
    case "lower": return { bg: T.lower, border: T.lowerBrd, txt: "#45D68A" };
    case "upper": return { bg: T.upper, border: T.upperBrd, txt: "#FF8FAD" };
  }
}

function NoteCircle({ label, type, size = NOTE_D }: { label: string; type: NType; size?: number }) {
  const s = noteStyle(type);
  const fontSize = label.length > 3 ? 9 : label.length === 3 ? 10 : 12;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: s.bg, borderWidth: 1.5, borderColor: s.border,
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{
        color: s.txt, fontSize, fontWeight: type === "root" ? "700" : "600",
        fontStyle: type === "lower" ? "italic" : "normal",
        letterSpacing: -0.3,
      }}>{label}</Text>
    </View>
  );
}

function FretNumbers({ maxFret }: { maxFret: number }) {
  return (
    <View style={{ flexDirection: "row", paddingLeft: LABEL_W }}>
      {Array.from({ length: maxFret + 1 }, (_, i) => (
        <View key={i} style={{ width: FRET_W, alignItems: "center" }}>
          <Text style={{ color: T.textMuted, fontSize: 10 }}>
            {i === 0 ? "Open" : i}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FretDots({ maxFret }: { maxFret: number }) {
  return (
    <View style={{ flexDirection: "row", paddingLeft: LABEL_W, height: 14, alignItems: "center" }}>
      {Array.from({ length: maxFret + 1 }, (_, i) => (
        <View key={i} style={{ width: FRET_W, alignItems: "center" }}>
          {FRET_DOT_FRETS.includes(i) && (
            <View style={{
              width: i === 12 ? 6 : 5, height: i === 12 ? 6 : 5,
              borderRadius: 4, backgroundColor: T.textMuted,
            }} />
          )}
        </View>
      ))}
    </View>
  );
}

function StringRow({ name, color, notes, maxFret }: {
  name: string; color: string; notes: NotePos[]; maxFret: number;
}) {
  const noteMap = new Map(notes.map((n) => [n.fret, n]));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: STRING_H }}>
      {/* String label */}
      <View style={{ width: LABEL_W, alignItems: "flex-end", paddingRight: 8 }}>
        <Text style={{ color, fontSize: 13, fontWeight: "700" }}>{name}</Text>
      </View>

      {/* Fret cells */}
      {Array.from({ length: maxFret + 1 }, (_, fret) => {
        const n = noteMap.get(fret);
        const isFirst = fret === 0;
        return (
          <View key={fret} style={{
            width: FRET_W, height: STRING_H,
            alignItems: "center", justifyContent: "center",
            borderLeftWidth: isFirst ? 3 : 1,
            borderLeftColor: isFirst ? T.text : T.border,
          }}>
            {/* String line */}
            <View style={{
              position: "absolute",
              left: 0, right: 0,
              height: 1.5,
              backgroundColor: T.strLine,
              top: STRING_H / 2 - 0.75,
            }} />
            {n ? <NoteCircle label={n.label} type={n.type} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function FretboardSection({ title, subtitle, rows, maxFret }: {
  title: string; subtitle?: string;
  rows: { name: string; color: string; notes: NotePos[] }[];
  maxFret: number;
}) {
  return (
    <View style={[styles.section]}>
      <View style={{ marginBottom: 10 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <FretNumbers maxFret={maxFret} />
          {rows.map((r) => (
            <StringRow key={r.name} name={r.name} color={r.color} notes={r.notes} maxFret={maxFret} />
          ))}
          <FretDots maxFret={maxFret} />
        </View>
      </ScrollView>
    </View>
  );
}

function ScaleRun() {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Full Scale Run — Ascending</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {SCALE_RUN.map((n, i) => (
            <React.Fragment key={i}>
              <View style={{ alignItems: "center", gap: 4 }}>
                <NoteCircle label={n.label} type={n.type} size={36} />
                <Text style={{ color: T.textMuted, fontSize: 9, letterSpacing: 0 }}>
                  {n.string}-{n.fret}
                </Text>
              </View>
              {i < SCALE_RUN.length - 1 && (
                <Text style={{ color: T.textMuted, fontSize: 12, marginBottom: 14 }}>→</Text>
              )}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Legend() {
  const items: { label: string; type: NType; desc: string }[] = [
    { label: "sa", type: "lower", desc: "Lower octave (italic)" },
    { label: "Sa", type: "main",  desc: "Middle octave" },
    { label: "Sa'",type: "upper", desc: "Upper octave ( ′ )" },
    { label: "Sa", type: "root",  desc: "Sa root notes" },
  ];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
      {items.map((it) => (
        <View key={it.desc} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <NoteCircle label={it.label} type={it.type} size={28} />
          <Text style={{ color: T.textSub, fontSize: 11 }}>{it.desc}</Text>
        </View>
      ))}
    </View>
  );
}

function NoteKeyGrid() {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Sargam → Western Note Key (B♭ Major)</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {NOTE_KEY.map((k) => (
          <View key={k.s} style={[styles.keyCell]}>
            <Text style={{ color: T.text, fontSize: 16, fontWeight: "700" }}>{k.s}</Text>
            <Text style={{ color: T.textSub, fontSize: 13, marginTop: 2 }}>{k.w}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ReferenceScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sargam Fretboard Reference</Text>
          <Text style={styles.subtitle}>B♭ Major · Sa anchored at G string, fret 3 · Full Sargam notation</Text>
          <View style={[styles.divider, { marginTop: 14 }]} />
        </View>

        {/* Legend */}
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Legend />
        </View>

        {/* Primary strings */}
        <FretboardSection
          title="Primary Strings — G, B, e"
          subtitle="★  Learn these first — full scale in one position"
          rows={PRIMARY}
          maxFret={MAX_FRET}
        />

        {/* Lower strings */}
        <FretboardSection
          title="Lower Strings — D, A, E"
          subtitle="Lower octave reference"
          rows={LOWER}
          maxFret={MAX_FRET}
        />

        {/* Scale run */}
        <ScaleRun />

        {/* Note key */}
        <NoteKeyGrid />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.bg,
  },
  scroll: {
    paddingHorizontal: 0,
    gap: 12,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  title: {
    color: T.text,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: T.textSub,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    backgroundColor: T.border,
  },
  section: {
    marginHorizontal: 12,
    backgroundColor: T.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    padding: 14,
    paddingBottom: 10,
    ...Platform.select({
      ios:     { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  sectionTitle: {
    color: T.text,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  sectionSub: {
    color: T.tint,
    fontSize: 11,
    marginTop: 2,
  },
  keyCell: {
    flex: 1,
    minWidth: 72,
    backgroundColor: T.cardAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
    paddingVertical: 10,
    alignItems: "center",
  },
});
