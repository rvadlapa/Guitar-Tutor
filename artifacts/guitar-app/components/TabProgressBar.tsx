import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import Colors from "@/constants/colors";
import { TabChord } from "@/context/TabContext";

type Props = {
  chords: TabChord[];
  currentIndex: number;
  onSeek: (index: number) => void;
};

const CELL_W = 32;
const CELL_GAP = 6;

function TabProgressBarInner({ chords, currentIndex, onSeek }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const isSargam = chords[currentIndex]?.label;
    const cellWidth = isSargam ? 38 : CELL_W;
    const x = Math.max(0, currentIndex * (cellWidth + CELL_GAP) - 100);
    scrollRef.current.scrollTo({ x, animated: true });
  }, [currentIndex]);

  const handlePress = (index: number) => {
    Haptics.selectionAsync();
    onSeek(index);
  };

  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        SEQUENCE
      </Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {chords.map((chord, index) => {
          const isActive = index === currentIndex;
          const isPast = index < currentIndex;
          const isSargam = !!chord.label;
          const maxFret = Math.max(
            ...chord.notes.map((n) =>
              typeof n.fret === "number" ? n.fret : 0
            )
          );
          const cellLabel = isSargam
            ? chord.label!
            : maxFret > 0
            ? String(maxFret)
            : "○";
          const isSargamUpper =
            isSargam && chord.label![0] === chord.label![0].toUpperCase();

          return (
            <Pressable
              key={chord.id}
              onPress={() => handlePress(index)}
              style={({ pressed }) => [
                styles.chordCell,
                {
                  width: isSargam ? 38 : CELL_W,
                  backgroundColor: isActive
                    ? isSargam
                      ? isSargamUpper
                        ? "#C17A2A"
                        : "#8B4513"
                      : colors.tint
                    : isPast
                    ? isDark
                      ? "#2A2218"
                      : "#EDE5DA"
                    : isDark
                    ? "#1E1810"
                    : "#F5F0E8",
                  borderColor: isActive
                    ? isSargam
                      ? isSargamUpper
                        ? "#C17A2A"
                        : "#8B4513"
                      : colors.tint
                    : colors.border,
                  transform: [{ scale: pressed ? 0.9 : isActive ? 1.08 : 1 }],
                  opacity: isPast ? 0.5 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.chordIndex,
                  {
                    color: isActive
                      ? "#fff"
                      : isPast
                      ? colors.textMuted
                      : colors.textSecondary,
                    fontWeight: isActive ? "700" : "400",
                    fontSize: isSargam ? 10 : maxFret > 9 ? 9 : 11,
                    fontStyle:
                      isSargam && !isSargamUpper ? "italic" : "normal",
                  },
                ]}
              >
                {cellLabel}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const TabProgressBar = React.memo(TabProgressBarInner);
export default TabProgressBar;

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 4,
    gap: CELL_GAP,
    flexDirection: "row",
    alignItems: "center",
  },
  chordCell: {
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chordIndex: {
    fontSize: 11,
    fontWeight: "600",
  },
});
