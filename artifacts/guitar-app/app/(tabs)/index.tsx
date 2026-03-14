import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GuitarNeck from "@/components/GuitarNeck";
import PlaybackControls from "@/components/PlaybackControls";
import SpeedControl from "@/components/SpeedControl";
import TabProgressBar from "@/components/TabProgressBar";
import UploadModal from "@/components/UploadModal";
import Colors from "@/constants/colors";
import { useTabContext, TabSong, TabChord } from "@/context/TabContext";

// ─── Chord display area ──────────────────────────────────────────────────────
// Isolated into its own memo component so the header and controls don't
// re-render on every chord tick.

type NeckAreaProps = {
  currentChord: TabChord;
  currentSong: TabSong;
  isDark: boolean;
};

const NeckArea = React.memo(function NeckArea({
  currentChord,
  currentSong,
  isDark,
}: NeckAreaProps) {
  const colors = isDark ? Colors.dark : Colors.light;

  const isSargamLabel =
    !!currentChord.label &&
    /^[SsRrGgMmPpDdNn]/.test(currentChord.label);

  const isUpperLabel =
    !!currentChord.label &&
    currentChord.label[0] === currentChord.label[0].toUpperCase();

  return (
    <View style={styles.neckContainer}>
      {/* Note badge — always mounted, fades in when label is present */}
      <View
        style={[
          styles.sargamBadgeRow,
          { opacity: currentChord.label ? 1 : 0, minHeight: 44 },
        ]}
        pointerEvents="none"
      >
        {currentChord.label ? (
          <>
            <View
              style={[
                styles.sargamBadge,
                {
                  backgroundColor: isUpperLabel
                    ? isDark
                      ? "#7A4A10"
                      : "#C17A2A"
                    : isDark
                    ? "#4A2A10"
                    : "#8B4513",
                },
              ]}
            >
              <Text style={styles.sargamBadgeNote}>{currentChord.label}</Text>
            </View>
            {isSargamLabel && (
              <Text
                style={[styles.sargamBadgeHint, { color: colors.textSecondary }]}
              >
                {isUpperLabel ? "Shuddha" : "Komal"}
              </Text>
            )}
          </>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.neckScroll}
      >
        <GuitarNeck chord={currentChord} tuning={currentSong.tuning} />
      </ScrollView>

      {/* Technique badges */}
      {currentChord.notes.some(
        (n) => n.technique && n.technique !== "none"
      ) && (
        <View style={styles.techniqueBadges}>
          {Array.from(
            new Set(
              currentChord.notes
                .filter((n) => n.technique && n.technique !== "none")
                .map((n) => n.technique)
            )
          ).map((tech) => (
            <View
              key={tech}
              style={[
                styles.techBadge,
                { backgroundColor: isDark ? "#2A2218" : "#F0EAE0" },
              ]}
            >
              <Text style={[styles.techBadgeText, { color: colors.tint }]}>
                {tech}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

// ─── String legend ────────────────────────────────────────────────────────────

type StringLegendProps = {
  tuning: string[];
  currentChord: TabChord;
  isDark: boolean;
};

const StringLegend = React.memo(function StringLegend({
  tuning,
  currentChord,
  isDark,
}: StringLegendProps) {
  const colors = isDark ? Colors.dark : Colors.light;
  const stringColors = [
    colors.string1,
    colors.string2,
    colors.string3,
    colors.string4,
    colors.string5,
    colors.string6,
  ];

  return (
    <View style={styles.stringLegend}>
      {tuning.map((note, si) => {
        const chordNote = currentChord.notes.find((n) => n.string === si);
        return (
          <View key={si} style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: stringColors[si] }]}
            />
            <Text
              style={[styles.legendNote, { color: colors.textSecondary }]}
            >
              {note}
            </Text>
            <Text
              style={[
                styles.legendFret,
                { color: colors.text },
              ]}
            >
              {chordNote ? String(chordNote.fret) : "—"}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

// ─── Player screen ────────────────────────────────────────────────────────────

export default function PlayerScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const {
    currentSong,
    currentChordIndex,
    addSong,
    loadSong,
    seekToChord,
  } = useTabContext();
  const [showUpload, setShowUpload] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);

  const allChords = useMemo(
    () => currentSong?.sections.flatMap((s) => s.chords) ?? [],
    [currentSong]
  );

  const currentChord = allChords[currentChordIndex] ?? null;

  const currentSection = useMemo(() => {
    if (!currentSong) return null;
    let count = 0;
    for (const section of currentSong.sections) {
      if (count + section.chords.length > currentChordIndex) return section;
      count += section.chords.length;
    }
    return currentSong.sections[currentSong.sections.length - 1];
  }, [currentSong, currentChordIndex]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Text style={[styles.appName, { color: colors.tint }]}>
            GuitarTab
          </Text>
          {currentSong ? (
            <View>
              <Text
                style={[styles.songTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {currentSong.title}
              </Text>
              {currentSong.artist && (
                <Text
                  style={[styles.artistName, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {currentSong.artist}
                </Text>
              )}
            </View>
          ) : (
            <Text style={[styles.songTitle, { color: colors.textMuted }]}>
              No song loaded
            </Text>
          )}
        </View>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowSpeed((v) => !v);
            }}
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: showSpeed
                  ? colors.tint
                  : isDark
                  ? "#2A2218"
                  : "#F0EAE0",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather
              name="sliders"
              size={18}
              color={showSpeed ? "#fff" : colors.textSecondary}
            />
          </Pressable>

          <Pressable
            onPress={() => setShowUpload(true)}
            style={({ pressed }) => [
              styles.uploadBtn,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.uploadBtnText}>Load Tab</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPad + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {showSpeed && (
          <View style={styles.speedPanel}>
            <SpeedControl />
          </View>
        )}

        {currentSection && (
          <View style={styles.sectionBadge}>
            <Text style={[styles.sectionBadgeText, { color: colors.tint }]}>
              {currentSection.name}
            </Text>
          </View>
        )}

        {currentChord && currentSong ? (
          <NeckArea
            currentChord={currentChord}
            currentSong={currentSong}
            isDark={isDark}
          />
        ) : (
          <View
            style={[
              styles.emptyNeck,
              {
                backgroundColor: isDark ? colors.card : "#FFFFFF",
                borderColor: colors.border,
              },
            ]}
          >
            <Feather name="music" size={40} color={colors.border} />
            <Text
              style={[styles.emptyTitle, { color: colors.textSecondary }]}
            >
              No tab loaded
            </Text>
            <Text
              style={[styles.emptySubtitle, { color: colors.textMuted }]}
            >
              Load a guitar tab to start practicing
            </Text>
            <Pressable
              onPress={() => setShowUpload(true)}
              style={({ pressed }) => [
                styles.emptyBtn,
                {
                  backgroundColor: colors.tint,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={styles.emptyBtnText}>Load Tab</Text>
            </Pressable>
          </View>
        )}

        {currentChord && currentSong && (
          <StringLegend
            tuning={currentSong.tuning ?? ["e", "B", "G", "D", "A", "E"]}
            currentChord={currentChord}
            isDark={isDark}
          />
        )}

        {allChords.length > 0 && (
          <View style={styles.progressSection}>
            <TabProgressBar
              chords={allChords}
              currentIndex={currentChordIndex}
              onSeek={seekToChord}
            />
          </View>
        )}

        <View style={styles.controlsSection}>
          <PlaybackControls totalChords={allChords.length} />
        </View>
      </ScrollView>

      <UploadModal
        visible={showUpload}
        onClose={() => setShowUpload(false)}
        onAdd={(song: TabSong) => {
          addSong(song);
          loadSong(song);
          setShowUpload(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerLeft: { flex: 1, gap: 2 },
  appName: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  songTitle: { fontSize: 20, fontWeight: "700" },
  artistName: { fontSize: 14 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    gap: 6,
  },
  uploadBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  speedPanel: { marginBottom: 4 },
  sectionBadge: { alignSelf: "flex-start" },
  sectionBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  neckContainer: { gap: 10 },
  sargamBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sargamBadge: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 12,
  },
  sargamBadgeNote: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 1,
  },
  sargamBadgeHint: { fontSize: 13, fontStyle: "italic" },
  neckScroll: { paddingHorizontal: 4 },
  techniqueBadges: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  techBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  techBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  emptyNeck: {
    height: 280,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 4,
  },
  emptyBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  stringLegend: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },
  legendItem: { alignItems: "center", gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendNote: { fontSize: 11, fontWeight: "600" },
  legendFret: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  progressSection: { marginTop: 4 },
  controlsSection: { marginTop: 4 },
});
