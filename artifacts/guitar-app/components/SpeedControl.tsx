import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import Colors from "@/constants/colors";
import { useTabContext } from "@/context/TabContext";

const PRESETS = [40, 60, 80, 100, 120, 140, 160];

export default function SpeedControl() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { bpm, setBpm } = useTabContext();

  const handleDecrease = () => {
    Haptics.selectionAsync();
    setBpm(Math.max(20, bpm - 5));
  };

  const handleIncrease = () => {
    Haptics.selectionAsync();
    setBpm(Math.min(240, bpm + 5));
  };

  const handlePreset = (preset: number) => {
    Haptics.selectionAsync();
    setBpm(preset);
  };

  const tempo =
    bpm < 60
      ? "Largo"
      : bpm < 80
      ? "Andante"
      : bpm < 100
      ? "Moderato"
      : bpm < 120
      ? "Allegretto"
      : bpm < 160
      ? "Allegro"
      : "Presto";

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? colors.card : colors.backgroundSecondary,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          TEMPO
        </Text>
        <Text style={[styles.tempoLabel, { color: colors.textMuted }]}>
          {tempo}
        </Text>
      </View>

      <View style={styles.bpmRow}>
        <Pressable
          onPress={handleDecrease}
          style={({ pressed }) => [
            styles.adjustBtn,
            {
              backgroundColor: isDark ? "#2A2218" : "#F0EAE0",
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text
            style={[styles.adjustText, { color: colors.text, fontSize: 22 }]}
          >
            −
          </Text>
        </Pressable>

        <View style={styles.bpmDisplay}>
          <Text style={[styles.bpmValue, { color: colors.tint }]}>{bpm}</Text>
          <Text style={[styles.bpmUnit, { color: colors.textMuted }]}>BPM</Text>
        </View>

        <Pressable
          onPress={handleIncrease}
          style={({ pressed }) => [
            styles.adjustBtn,
            {
              backgroundColor: isDark ? "#2A2218" : "#F0EAE0",
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text
            style={[styles.adjustText, { color: colors.text, fontSize: 22 }]}
          >
            +
          </Text>
        </Pressable>
      </View>

      <View style={styles.presetsRow}>
        {PRESETS.map((preset) => (
          <Pressable
            key={preset}
            onPress={() => handlePreset(preset)}
            style={({ pressed }) => [
              styles.presetChip,
              {
                backgroundColor:
                  bpm === preset
                    ? colors.tint
                    : isDark
                    ? "#2A2218"
                    : "#F0EAE0",
                opacity: pressed ? 0.7 : 1,
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            <Text
              style={[
                styles.presetText,
                {
                  color:
                    bpm === preset ? "#fff" : colors.textSecondary,
                  fontWeight: bpm === preset ? "700" : "400",
                },
              ]}
            >
              {preset}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  tempoLabel: {
    fontSize: 12,
    fontStyle: "italic",
  },
  bpmRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  adjustBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  adjustText: {
    fontWeight: "300",
    lineHeight: 26,
  },
  bpmDisplay: {
    alignItems: "center",
    minWidth: 100,
  },
  bpmValue: {
    fontSize: 48,
    fontWeight: "700",
    lineHeight: 52,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  bpmUnit: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 1,
  },
  presetsRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  presetText: {
    fontSize: 13,
  },
});
