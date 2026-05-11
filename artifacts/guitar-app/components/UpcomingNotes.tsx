import React from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import Colors from "@/constants/colors";
import { TabChord } from "@/context/TabContext";

type Props = {
  chords: TabChord[];
  currentIndex: number;
  count?: number;
};

function chordLabel(chord: TabChord): string {
  if (chord.label) return chord.label;
  const numericFrets = chord.notes
    .map((n) => (typeof n.fret === "number" ? n.fret : null))
    .filter((f): f is number => f !== null);
  if (numericFrets.length === 0) return "○";
  return numericFrets.join("·");
}

export default function UpcomingNotes({
  chords,
  currentIndex,
  count = 5,
}: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;

  const upcoming = chords.slice(currentIndex + 1, currentIndex + 1 + count);
  if (upcoming.length === 0) return null;

  return (
    <View>
      <Text style={[styles.label, { color: colors.textSecondary }]}>UP NEXT</Text>
      <View style={styles.row}>
        {upcoming.map((chord, i) => {
          const isImmediate = i === 0;
          const isSargam = !!chord.label;
          const isKomal = isSargam && chord.komal === true;
          const accent = isSargam ? (isKomal ? "#8B4513" : "#C17A2A") : colors.tint;
          return (
            <View
              key={chord.id}
              style={[
                styles.pill,
                {
                  backgroundColor: isDark ? "#1E1810" : "#F5F0E8",
                  borderColor: isImmediate ? accent : colors.border,
                  borderWidth: isImmediate ? 1.5 : 1,
                  opacity: 1 - i * 0.12,
                },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  {
                    color: isImmediate ? accent : colors.textSecondary,
                    fontWeight: isImmediate ? "700" : "500",
                    fontStyle: isKomal ? "italic" : "normal",
                  },
                ]}
                numberOfLines={1}
              >
                {chordLabel(chord)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  pill: {
    minWidth: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    fontSize: 13,
  },
});
