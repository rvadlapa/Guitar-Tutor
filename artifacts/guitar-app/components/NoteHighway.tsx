import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { TabChord } from "@/context/TabContext";

// ─── Layout constants ──────────────────────────────────────────────────────
const LANE_HEIGHT = 50;
const NOTE_HEIGHT = 34;
const CHORD_WIDTH = 60;
const LABEL_WIDTH = 54;   // fixed string-label column
const NUM_STRINGS = 6;
export const HIGHWAY_HEIGHT = LANE_HEIGHT * NUM_STRINGS; // 300

// How many chords to keep mounted on each side of current
const LOOK_AHEAD = 24;
const LOOK_BEHIND = 3;

const STRING_NAMES = ["e", "B", "G", "D", "A", "E"];

// Per-string accent colours (vivid, dark-theme friendly)
const NOTE_COLORS = [
  "#FF5E87", // e  — neon pink
  "#FF8C36", // B  — amber
  "#EDD030", // G  — gold
  "#45D68A", // D  — mint
  "#4DA6FF", // A  — sky
  "#B06EFF", // E  — violet
];

type Props = {
  chords: TabChord[];
  currentIndex: number;
  isPlaying: boolean;
  bpm: number;
};

function NoteHighwayInner({ chords, currentIndex, isPlaying, bpm }: Props) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    animRef.current?.stop();
    const beatMs = (60 / Math.max(bpm, 1)) * 1000;
    const anim = Animated.timing(scrollX, {
      toValue: currentIndex * CHORD_WIDTH,
      duration: isPlaying ? beatMs : 220,
      easing: isPlaying ? Easing.linear : Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animRef.current = anim;
    anim.start();
  }, [currentIndex, isPlaying, bpm]);

  // Negate scrollX for translateX (native driver compatible)
  const translateX = scrollX.interpolate({
    inputRange: [0, 999999],
    outputRange: [0, -999999],
  });

  // Windowed rendering — only mount the chords near the viewport
  const winStart = Math.max(0, currentIndex - LOOK_BEHIND);
  const winEnd = Math.min(chords.length - 1, currentIndex + LOOK_AHEAD);

  return (
    <View style={styles.root}>
      {/* ── Lane dividers ──────────────────────────────────────────── */}
      {Array.from({ length: NUM_STRINGS + 1 }).map((_, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.laneLine,
            {
              top: i * LANE_HEIGHT,
              height:
                i === 0 || i === NUM_STRINGS
                  ? 1.5
                  : StyleSheet.hairlineWidth,
              backgroundColor:
                i === 0 || i === NUM_STRINGS
                  ? "rgba(190,150,60,0.7)"
                  : "rgba(190,150,60,0.2)",
            },
          ]}
        />
      ))}

      {/* ── Vertical "fret" lines in the note area ─────────────────── */}
      {Array.from({ length: 20 }).map((_, i) => (
        <View
          key={`fret-${i}`}
          pointerEvents="none"
          style={[
            styles.fretLine,
            {
              left: LABEL_WIDTH + (i + 1) * CHORD_WIDTH * 2 - ((currentIndex * CHORD_WIDTH) % (CHORD_WIDTH * 2)),
            },
          ]}
        />
      ))}

      {/* ── String-name labels (fixed left column) ─────────────────── */}
      <View style={styles.labelCol} pointerEvents="none">
        {STRING_NAMES.map((name, si) => (
          <View key={si} style={[styles.labelCell, { height: LANE_HEIGHT }]}>
            <View
              style={[
                styles.labelDot,
                { backgroundColor: NOTE_COLORS[si] },
              ]}
            />
            <Text
              style={[styles.labelText, { color: NOTE_COLORS[si] }]}
            >
              {name}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Playhead glow + line ────────────────────────────────────── */}
      <View
        pointerEvents="none"
        style={[styles.playheadGlow, { left: LABEL_WIDTH - 12 }]}
      />
      <View
        pointerEvents="none"
        style={[styles.playheadLine, { left: LABEL_WIDTH }]}
      />

      {/* ── Scrolling note track ────────────────────────────────────── */}
      <View style={[styles.noteClip, { left: LABEL_WIDTH }]}>
        <Animated.View
          style={[styles.noteTrack, { transform: [{ translateX }] }]}
        >
          {chords.slice(winStart, winEnd + 1).flatMap((chord, localIdx) => {
            const ci = winStart + localIdx;
            const isActive = ci === currentIndex;
            const isPast = ci < currentIndex;

            return chord.notes
              .filter((n) => n.fret !== "x")
              .map((note, ni) => {
                const si = note.string;
                const fretNum =
                  typeof note.fret === "number"
                    ? note.fret
                    : parseInt(note.fret as string, 10) || 0;

                const color = NOTE_COLORS[si] ?? "#AAA";
                const label = String(fretNum);

                const bgAlpha = isPast ? "28" : isActive ? "FF" : "99";

                return (
                  <View
                    key={`${ci}-${ni}`}
                    style={[
                      styles.note,
                      {
                        left: ci * CHORD_WIDTH + 3,
                        top:
                          si * LANE_HEIGHT +
                          (LANE_HEIGHT - NOTE_HEIGHT) / 2,
                        width: CHORD_WIDTH - 6,
                        height: NOTE_HEIGHT,
                        backgroundColor: color + bgAlpha,
                        borderColor: isActive
                          ? "rgba(255,255,255,0.75)"
                          : isPast
                          ? "transparent"
                          : color + "66",
                        borderWidth: isActive ? 1.5 : isPast ? 0 : 1,
                        shadowColor: isActive ? color : "transparent",
                        shadowOpacity: isActive ? 1 : 0,
                        shadowRadius: isActive ? 10 : 0,
                        elevation: isActive ? 8 : 0,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.noteLabel,
                        {
                          color: isPast
                            ? "rgba(255,255,255,0.2)"
                            : "#FFF",
                          fontSize: 13,
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
    </View>
  );
}

const NoteHighway = React.memo(NoteHighwayInner);
export default NoteHighway;

const styles = StyleSheet.create({
  root: {
    height: HIGHWAY_HEIGHT,
    backgroundColor: "#0C1420",
    borderRadius: 16,
    overflow: "hidden",
  },
  laneLine: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  fretLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  labelCol: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: LABEL_WIDTH,
    backgroundColor: "#090F1A",
    borderRightWidth: 1,
    borderRightColor: "rgba(190,150,60,0.35)",
    zIndex: 4,
  },
  labelCell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  labelDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  labelText: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  playheadGlow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 28,
    backgroundColor: "rgba(255,200,80,0.07)",
    zIndex: 2,
  },
  playheadLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2.5,
    backgroundColor: "rgba(255,210,80,0.92)",
    zIndex: 5,
    ...Platform.select({
      ios: {
        shadowColor: "#FFD700",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 8,
      },
    }),
  },
  noteClip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    overflow: "hidden",
    zIndex: 1,
  },
  noteTrack: {
    position: "absolute",
    top: 0,
    left: 0,
    height: HIGHWAY_HEIGHT,
    width: 999999,
  },
  note: {
    position: "absolute",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowOffset: { width: 0, height: 0 },
  },
  noteLabel: {
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: -0.5,
  },
});
