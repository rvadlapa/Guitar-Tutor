import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { TabChord } from "@/context/TabContext";

// ─── Layout ────────────────────────────────────────────────────────────────────
const NUM_STRINGS   = 6;          // e · B · G · D · A · E (all 6)
const LANE_HEIGHT   = 58;         // px per string lane
const NOTE_SIZE     = 44;         // circle diameter
const CHORD_WIDTH   = 80;         // px per full beat
const LABEL_WIDTH   = 44;         // left label column width
export const HIGHWAY_HEIGHT = LANE_HEIGHT * NUM_STRINGS; // 348

// Window of chords to mount around the playhead
const LOOK_AHEAD  = 28;
const LOOK_BEHIND = 4;

// String indices: 0 = high e (thinnest) → 5 = low E (thickest)
const STRING_NAMES = ["e", "B", "G", "D", "A", "E"];

// String visual properties: colour + line thickness (thicker = lower/wound)
const STRING_META = [
  { color: "#D8D0FF", lineW: 0.8,  label: "e" },  // e  — plain steel (thinnest)
  { color: "#FFD0A0", lineW: 1.2,  label: "B" },  // B  — plain steel (warm)
  { color: "#FFB040", lineW: 1.8,  label: "G" },  // G  — wound bronze
  { color: "#90D870", lineW: 2.4,  label: "D" },  // D  — wound nickel
  { color: "#60B0FF", lineW: 3.0,  label: "A" },  // A  — wound (heavier)
  { color: "#C080FF", lineW: 3.8,  label: "E" },  // E  — wound (thickest)
];

// Note-circle fill colours per string (vivid, readable on dark wood)
const NOTE_COLORS = [
  "#C8A8FF", // e  (0) — soft violet
  "#FF9D3F", // B  (1) — orange
  "#FFD034", // G  (2) — gold
  "#66CC88", // D  (3) — green
  "#5599FF", // A  (4) — blue
  "#AA77FF", // E  (5) — purple
];

// ─── Beat-boundary helper ──────────────────────────────────────────────────────
// Returns the set of pixel-offsets where a NEW beat begins in the chord array.
function computeBeatBoundaries(
  chords: TabChord[],
  offsets: number[]
): Set<number> {
  const boundaries = new Set<number>();
  let cum = 0;
  for (let i = 0; i < chords.length; i++) {
    // A beat boundary is where the cumulative duration is a whole number
    if (i > 0 && Math.abs(cum - Math.round(cum)) < 0.0001) {
      boundaries.add(offsets[i]);
    }
    cum += chords[i].duration ?? 1;
  }
  return boundaries;
}

// ─── Component ─────────────────────────────────────────────────────────────────
type Props = {
  chords: TabChord[];
  currentIndex: number;
  isPlaying: boolean;
  bpm: number;
};

function NoteHighwayInner({ chords, currentIndex, isPlaying, bpm }: Props) {
  const scrollX   = useRef(new Animated.Value(0)).current;
  const animRef   = useRef<Animated.CompositeAnimation | null>(null);

  // Cumulative pixel offsets per chord
  const offsets = useMemo(() => {
    const arr: number[] = [];
    let cum = 0;
    for (const c of chords) {
      arr.push(cum);
      cum += (c.duration ?? 1) * CHORD_WIDTH;
    }
    return arr;
  }, [chords]);

  // Beat boundaries (pixel positions of new beats)
  const beatBoundaries = useMemo(
    () => computeBeatBoundaries(chords, offsets),
    [chords, offsets]
  );

  // Animate scroll to current chord
  useEffect(() => {
    animRef.current?.stop();
    const beatMs = (60 / Math.max(bpm, 1)) * 1000;
    const dur    = chords[currentIndex]?.duration ?? 1;
    const anim   = Animated.timing(scrollX, {
      toValue:  offsets[currentIndex] ?? currentIndex * CHORD_WIDTH,
      duration: isPlaying ? beatMs * dur : 220,
      easing:   isPlaying ? Easing.linear : Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animRef.current = anim;
    anim.start();
  }, [currentIndex, isPlaying, bpm, offsets]);

  const translateX = scrollX.interpolate({
    inputRange:  [0, 999999],
    outputRange: [0, -999999],
  });

  const winStart = Math.max(0, currentIndex - LOOK_BEHIND);
  const winEnd   = Math.min(chords.length - 1, currentIndex + LOOK_AHEAD);

  // Pixel range of scrolling content that is visible in the window
  const winOffsetStart = offsets[winStart] ?? 0;
  const winOffsetEnd   = (offsets[winEnd] ?? 0) + CHORD_WIDTH * 2;

  return (
    <View style={styles.root}>

      {/* ── Left label column (string names) ──────────────────────────── */}
      <View style={styles.labelCol} pointerEvents="none">
        {STRING_NAMES.map((name, si) => (
          <View key={si} style={[styles.labelCell, { height: LANE_HEIGHT }]}>
            <Text style={[styles.labelText, { color: STRING_META[si].color }]}>
              {name}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Fretboard surface ─────────────────────────────────────────── */}
      <View style={[styles.fretboard, { left: LABEL_WIDTH }]}>

        {/* Lane divider hairlines (horizontal) */}
        {Array.from({ length: NUM_STRINGS - 1 }).map((_, i) => (
          <View
            key={`lane-${i}`}
            pointerEvents="none"
            style={[
              styles.laneDivider,
              { top: (i + 1) * LANE_HEIGHT - StyleSheet.hairlineWidth / 2 },
            ]}
          />
        ))}

        {/* String lines (horizontal, centered in each lane) */}
        {STRING_META.map((s, si) => (
          <View
            key={`str-${si}`}
            pointerEvents="none"
            style={[
              styles.stringLine,
              {
                top:              si * LANE_HEIGHT + LANE_HEIGHT / 2 - s.lineW / 2,
                height:           s.lineW,
                backgroundColor:  s.color,
              },
            ]}
          />
        ))}

        {/* ── Scrolling note track ─────────────────────────────────────── */}
        <View style={styles.noteClip}>
          <Animated.View
            style={[styles.noteTrack, { transform: [{ translateX }] }]}
          >
            {/* Beat-boundary fret wires & subdivision lines */}
            {chords.slice(winStart, winEnd + 1).map((chord, localIdx) => {
              const ci      = winStart + localIdx;
              const xOffset = offsets[ci] ?? ci * CHORD_WIDTH;
              if (xOffset < winOffsetStart || xOffset > winOffsetEnd) return null;

              const isBeat = beatBoundaries.has(xOffset);
              return (
                <View
                  key={`grid-${ci}`}
                  pointerEvents="none"
                  style={[
                    styles.gridLine,
                    {
                      left:            xOffset,
                      width:           isBeat ? 2 : StyleSheet.hairlineWidth,
                      backgroundColor: isBeat
                        ? "rgba(210,200,175,0.55)"
                        : "rgba(210,200,175,0.18)",
                    },
                  ]}
                />
              );
            })}

            {/* Note circles */}
            {chords.slice(winStart, winEnd + 1).flatMap((chord, localIdx) => {
              const ci       = winStart + localIdx;
              const isActive = ci === currentIndex;
              const isPast   = ci < currentIndex;
              const noteW    = (chord.duration ?? 1) * CHORD_WIDTH;
              const xOffset  = offsets[ci] ?? ci * CHORD_WIDTH;

              return chord.notes
                .filter((n) => n.fret !== "x")
                .map((note, ni) => {
                  const si    = note.string;
                  if (si >= NUM_STRINGS) return null; // safety guard
                  const color = NOTE_COLORS[si] ?? "#AAA";
                  const cx    = xOffset + noteW / 2;  // center of this chord's slot
                  const cy    = si * LANE_HEIGHT + LANE_HEIGHT / 2;

                  // Fret number displayed small beneath the sargam label
                  const fretNum = typeof note.fret === "number"
                    ? note.fret
                    : parseInt(note.fret as string, 10) || 0;

                  const label  = chord.label ?? String(fretNum);
                  const alpha  = isPast ? 0.18 : isActive ? 1 : 0.72;
                  const bgRgba = hexToRgba(color, isPast ? 0.22 : isActive ? 0.95 : 0.65);

                  return (
                    <View
                      key={`${ci}-${ni}`}
                      style={[
                        styles.noteCircle,
                        {
                          left:            cx - NOTE_SIZE / 2,
                          top:             cy - NOTE_SIZE / 2,
                          width:           NOTE_SIZE,
                          height:          NOTE_SIZE,
                          borderRadius:    NOTE_SIZE / 2,
                          backgroundColor: bgRgba,
                          borderColor:     isActive
                            ? color
                            : isPast
                            ? "transparent"
                            : hexToRgba(color, 0.45),
                          borderWidth:     isActive ? 2.5 : isPast ? 0 : 1.5,
                          shadowColor:     isActive ? color : "transparent",
                          shadowOpacity:   isActive ? 0.95 : 0,
                          shadowRadius:    isActive ? 14 : 0,
                          elevation:       isActive ? 12 : 0,
                          opacity:         alpha,
                        },
                      ]}
                    >
                      {/* Fret number — top */}
                      {!isPast && (
                        <Text
                          style={[
                            styles.fretNum,
                            {
                              color:      isActive ? "#FFF" : hexToRgba(color, 0.85),
                              fontSize:   isActive ? 14 : 12,
                              fontWeight: isActive ? "900" : "700",
                            },
                          ]}
                        >
                          {fretNum}
                        </Text>
                      )}
                      {/* Sargam syllable — bottom */}
                      <Text
                        style={[
                          styles.noteLabel,
                          {
                            color:    isPast ? "rgba(255,255,255,0.3)" : hexToRgba(color, isActive ? 1 : 0.8),
                            fontSize: label.length > 3 ? 9 : 10,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </View>
                  );
                });
            })}
          </Animated.View>
        </View>

        {/* Playhead: golden "nut" line + glow */}
        <View pointerEvents="none" style={styles.playheadGlow} />
        <View pointerEvents="none" style={styles.playheadLine} />
      </View>
    </View>
  );
}

// ─── Utility ───────────────────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

const NoteHighway = React.memo(NoteHighwayInner);
export default NoteHighway;

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    height:          HIGHWAY_HEIGHT,
    flexDirection:   "row",
    backgroundColor: "#180D05",   // dark rosewood/mahogany
    borderRadius:    14,
    overflow:        "hidden",
    borderWidth:     1,
    borderColor:     "rgba(180,140,60,0.3)",
  },

  // ── Left label column ────────────────────────────────────────────────────────
  labelCol: {
    width:              LABEL_WIDTH,
    backgroundColor:    "#120A03",
    borderRightWidth:   2,
    borderRightColor:   "rgba(200,170,80,0.5)",  // gold nut line
    zIndex:             10,
  },
  labelCell: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            6,
  },
  labelText: {
    fontSize:    11,
    fontWeight:  "700",
    fontFamily:  Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 0.3,
  },

  // ── Fretboard surface (right of label col) ───────────────────────────────────
  fretboard: {
    position: "absolute",
    top:      0,
    bottom:   0,
    right:    0,
    // Subtle wood-grain overlay via repeated opaque border
    backgroundColor: "#1E1008",
  },

  // ── Horizontal elements ──────────────────────────────────────────────────────
  laneDivider: {
    position:        "absolute",
    left:            0,
    right:           0,
    height:          StyleSheet.hairlineWidth,
    backgroundColor: "rgba(180,140,60,0.12)",
  },
  stringLine: {
    position: "absolute",
    left:     0,
    right:    0,
    opacity:  0.8,
  },

  // ── Scrolling note clip & track ──────────────────────────────────────────────
  noteClip: {
    position: "absolute",
    top:      0,
    bottom:   0,
    left:     0,
    right:    0,
    overflow: "hidden",
  },
  noteTrack: {
    position: "absolute",
    top:      0,
    left:     0,
    height:   HIGHWAY_HEIGHT,
    width:    999999,
  },

  // ── Grid lines (fret wires & subdivision markers) ───────────────────────────
  gridLine: {
    position: "absolute",
    top:      0,
    bottom:   0,
  },

  // ── Note circles ─────────────────────────────────────────────────────────────
  noteCircle: {
    position:       "absolute",
    alignItems:     "center",
    justifyContent: "center",
    shadowOffset:   { width: 0, height: 0 },
  },
  noteLabel: {
    fontWeight:   "700",
    fontFamily:   Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: -0.3,
    lineHeight:   12,
  },
  fretNum: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 15,
  },

  // ── Playhead ──────────────────────────────────────────────────────────────────
  playheadGlow: {
    position:        "absolute",
    top:             0,
    bottom:          0,
    left:            -16,
    width:           36,
    backgroundColor: "rgba(255,200,60,0.06)",
    zIndex:          6,
  },
  playheadLine: {
    position:        "absolute",
    top:             0,
    bottom:          0,
    left:            0,
    width:           2.5,
    backgroundColor: "rgba(255,210,70,0.9)",
    zIndex:          7,
    ...Platform.select({
      ios: {
        shadowColor:   "#FFD700",
        shadowOffset:  { width: 0, height: 0 },
        shadowOpacity: 0.85,
        shadowRadius:  10,
      },
    }),
  },
});
