import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import Colors from "@/constants/colors";
import { TabChord } from "@/context/TabContext";

const STRING_NAMES = ["e", "B", "G", "D", "A", "E"];
const FRET_COUNT = 12;
const FRET_MARKERS = [3, 5, 7, 9, 12];

type Props = {
  chord: TabChord | null;
  tuning?: string[];
  compact?: boolean;
};

export default function GuitarNeck({ chord, tuning, compact = false }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const stringColors = [
    colors.string1,
    colors.string2,
    colors.string3,
    colors.string4,
    colors.string5,
    colors.string6,
  ];

  useEffect(() => {
    if (!chord) return;
    pulseAnim.setValue(0.85);
    Animated.spring(pulseAnim, {
      toValue: 1,
      friction: 6,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [chord]);

  const STRING_HEIGHT = compact ? 28 : 36;
  const FRET_WIDTH = compact ? 38 : 48;
  const DOT_SIZE = compact ? 22 : 28;

  const getNoteForString = (stringIndex: number) =>
    chord?.notes.find((n) => n.string === stringIndex) ?? null;

  const getActiveFrets = (): number[] => {
    if (!chord) return [];
    return chord.notes
      .map((n) => (typeof n.fret === "number" ? n.fret : 0))
      .filter((f) => f > 0);
  };

  const activeFrets = getActiveFrets();
  const minFret = activeFrets.length > 0 ? Math.min(...activeFrets) : 1;
  const startFret = Math.max(1, minFret - 1);
  const visibleFrets = compact ? 5 : 6;
  const displayFrets = Array.from(
    { length: visibleFrets },
    (_, i) => startFret + i
  );

  const totalWidth = FRET_WIDTH * visibleFrets + 50;

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? "#1E1508" : "#F5EBD8",
            borderColor: isDark ? "#4A3520" : "#C8A878",
            width: totalWidth,
          },
        ]}
      >
        {/* Nut */}
        <View
          style={[
            styles.nut,
            {
              backgroundColor: isDark ? "#D4A85A" : "#8B6914",
              height: STRING_HEIGHT * 6 + 20,
            },
          ]}
        />

        {/* Fret numbers */}
        <View style={[styles.fretNumbers, { marginLeft: 50 }]}>
          {displayFrets.map((fret) => (
            <View key={fret} style={{ width: FRET_WIDTH, alignItems: "center" }}>
              <Text
                style={[
                  styles.fretNumber,
                  {
                    color: FRET_MARKERS.includes(fret)
                      ? colors.tint
                      : colors.textMuted,
                    fontWeight: FRET_MARKERS.includes(fret) ? "700" : "400",
                  },
                ]}
              >
                {fret}
              </Text>
            </View>
          ))}
        </View>

        {/* Strings */}
        {STRING_NAMES.map((stringName, si) => {
          const note = getNoteForString(si);
          const stringThickness = si < 3 ? 1.5 + si * 0.3 : 0.5 + (si - 3) * 0.4;

          return (
            <View
              key={si}
              style={[styles.stringRow, { height: STRING_HEIGHT }]}
            >
              {/* String name label */}
              <View style={[styles.stringLabel, { width: 28 }]}>
                <Text
                  style={[
                    styles.stringName,
                    {
                      color:
                        note && note.fret !== "x"
                          ? stringColors[si]
                          : colors.textMuted,
                      fontWeight:
                        note && note.fret !== "x" ? "700" : "400",
                    },
                  ]}
                >
                  {tuning ? tuning[si] : stringName}
                </Text>
              </View>

              {/* Open/mute indicator */}
              <View style={[styles.openIndicator, { width: 22 }]}>
                {note && note.fret === "x" && (
                  <Text
                    style={[styles.muteSymbol, { color: colors.textSecondary }]}
                  >
                    ✕
                  </Text>
                )}
                {note && note.fret === "0" && (
                  <View
                    style={[
                      styles.openCircle,
                      { borderColor: stringColors[si] },
                    ]}
                  />
                )}
              </View>

              {/* Fret cells */}
              {displayFrets.map((fret, fi) => {
                const isActive =
                  note &&
                  typeof note.fret === "number" &&
                  note.fret === fret;

                return (
                  <View
                    key={fret}
                    style={[
                      styles.fretCell,
                      {
                        width: FRET_WIDTH,
                        height: STRING_HEIGHT,
                        borderLeftColor: isDark ? "#4A3520" : "#C8A878",
                      },
                    ]}
                  >
                    {/* String line */}
                    <View
                      style={[
                        styles.stringLine,
                        {
                          height: stringThickness,
                          backgroundColor: note
                            ? stringColors[si]
                            : isDark
                            ? "#8B7355"
                            : "#B8975A",
                          opacity: note?.fret === "x" ? 0.2 : 0.7,
                        },
                      ]}
                    />

                    {/* Active note dot */}
                    {isActive && (
                      <View
                        style={[
                          styles.noteDot,
                          {
                            width: DOT_SIZE,
                            height: DOT_SIZE,
                            borderRadius: DOT_SIZE / 2,
                            backgroundColor: stringColors[si],
                            shadowColor: stringColors[si],
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.fretLabel,
                            {
                              fontSize: compact ? 11 : 13,
                              color: "#fff",
                            },
                          ]}
                        >
                          {note?.fret}
                        </Text>
                      </View>
                    )}

                    {/* Fret dot marker */}
                    {FRET_MARKERS.includes(fret) &&
                      si === 2 &&
                      fret !== 12 && (
                        <View
                          style={[
                            styles.fretDot,
                            {
                              backgroundColor: isDark ? "#6B5335" : "#D4A85A",
                            },
                          ]}
                        />
                      )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    paddingVertical: 10,
    paddingRight: 12,
    flexDirection: "column",
  },
  nut: {
    position: "absolute",
    left: 50,
    top: 32,
    width: 5,
    borderRadius: 2,
  },
  fretNumbers: {
    flexDirection: "row",
    marginBottom: 4,
    paddingLeft: 0,
  },
  stringRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stringLabel: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 6,
  },
  stringName: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  openIndicator: {
    alignItems: "center",
    justifyContent: "center",
  },
  muteSymbol: {
    fontSize: 10,
    fontWeight: "700",
  },
  openCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  fretCell: {
    borderLeftWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  stringLine: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  noteDot: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 6,
  },
  fretLabel: {
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  fretNumber: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  fretDot: {
    position: "absolute",
    bottom: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
