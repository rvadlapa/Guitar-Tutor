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
import { useTabContext, TabSong } from "@/context/TabContext";

export default function PlayerScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { currentSong, currentChordIndex, addSong, loadSong, seekToChord } = useTabContext();
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
      if (count + section.chords.length > currentChordIndex) {
        return section;
      }
      count += section.chords.length;
    }
    return currentSong.sections[currentSong.sections.length - 1];
  }, [currentSong, currentChordIndex]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
    >
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
              <Text style={[styles.songTitle, { color: colors.text }]} numberOfLines={1}>
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
              {
                backgroundColor: colors.tint,
                opacity: pressed ? 0.85 : 1,
              },
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
        {/* Speed control panel */}
        {showSpeed && (
          <View style={styles.speedPanel}>
            <SpeedControl />
          </View>
        )}

        {/* Section label */}
        {currentSection && (
          <View style={styles.sectionBadge}>
            <Text style={[styles.sectionBadgeText, { color: colors.tint }]}>
              {currentSection.name}
            </Text>
          </View>
        )}

        {/* Guitar Neck */}
        {currentChord ? (
          <View style={styles.neckContainer}>
            {/* Sargam note badge */}
            {currentChord.label && (
              <View style={styles.sargamBadgeRow}>
                <View
                  style={[
                    styles.sargamBadge,
                    {
                      backgroundColor:
                        currentChord.label[0] === currentChord.label[0].toUpperCase()
                          ? isDark ? "#7A4A10" : "#C17A2A"
                          : isDark ? "#4A2A10" : "#8B4513",
                    },
                  ]}
                >
                  <Text style={styles.sargamBadgeNote}>{currentChord.label}</Text>
                </View>
                <Text style={[styles.sargamBadgeHint, { color: colors.textSecondary }]}>
                  {currentChord.label[0] === currentChord.label[0].toUpperCase()
                    ? "Shuddha"
                    : "Komal"}
                </Text>
              </View>
            )}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.neckScroll}
            >
              <GuitarNeck
                chord={currentChord}
                tuning={currentSong?.tuning}
              />
            </ScrollView>

            {/* Technique badge */}
            {currentChord.notes.some((n) => n.technique && n.technique !== "none") && (
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
                    <Text
                      style={[styles.techBadgeText, { color: colors.tint }]}
                    >
                      {tech}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
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
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              No tab loaded
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Load a guitar tab to start practicing
            </Text>
            <Pressable
              onPress={() => setShowUpload(true)}
              style={({ pressed }) => [
                styles.emptyBtn,
                { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.emptyBtnText}>Load Tab</Text>
            </Pressable>
          </View>
        )}

        {/* String legend */}
        {currentChord && (
          <View style={styles.stringLegend}>
            {(currentSong?.tuning ?? ["e", "B", "G", "D", "A", "E"]).map(
              (note, si) => {
                const stringColors = [
                  colors.string1,
                  colors.string2,
                  colors.string3,
                  colors.string4,
                  colors.string5,
                  colors.string6,
                ];
                const chordNote = currentChord.notes.find(
                  (n) => n.string === si
                );
                return (
                  <View key={si} style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: stringColors[si] },
                      ]}
                    />
                    <Text
                      style={[styles.legendNote, { color: colors.textSecondary }]}
                    >
                      {note}
                    </Text>
                    <Text
                      style={[styles.legendFret, { color: colors.text }]}
                    >
                      {chordNote ? String(chordNote.fret) : "—"}
                    </Text>
                  </View>
                );
              }
            )}
          </View>
        )}

        {/* Progress bar */}
        {allChords.length > 0 && (
          <View style={styles.progressSection}>
            <TabProgressBar
              chords={allChords}
              currentIndex={currentChordIndex}
              onSeek={seekToChord}
            />
          </View>
        )}

        {/* Playback controls */}
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  appName: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  songTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  artistName: {
    fontSize: 14,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
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
  uploadBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  speedPanel: {
    marginBottom: 4,
  },
  sectionBadge: {
    alignSelf: "flex-start",
  },
  sectionBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  neckContainer: {
    gap: 10,
  },
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
  sargamBadgeHint: {
    fontSize: 13,
    fontStyle: "italic",
  },
  neckScroll: {
    paddingHorizontal: 4,
  },
  techniqueBadges: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  techBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
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
  emptyBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  stringLegend: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },
  legendItem: {
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendNote: {
    fontSize: 11,
    fontWeight: "600",
  },
  legendFret: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  progressSection: {
    marginTop: 4,
  },
  controlsSection: {
    marginTop: 4,
  },
});
