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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import NoteHighway, { HIGHWAY_HEIGHT } from "@/components/NoteHighway";
import PlaybackControls from "@/components/PlaybackControls";
import SpeedControl from "@/components/SpeedControl";
import TabProgressBar from "@/components/TabProgressBar";
import UploadModal from "@/components/UploadModal";
import { useTabContext, TabSong, GuitarNote } from "@/context/TabContext";

// ─── Mini current-chord info bar ─────────────────────────────────────────────
const ChordInfoBar = React.memo(function ChordInfoBar({
  label,
  notes,
  index,
  total,
}: {
  label?: string;
  notes: GuitarNote[];
  index: number;
  total: number;
}) {
  const NOTE_COLORS = [
    "#FF5E87","#FF8C36","#EDD030","#45D68A","#4DA6FF","#B06EFF",
  ];
  const STRING_NAMES = ["e", "B", "G", "D", "A", "E"];

  const activeNotes = notes.filter((n) => n.fret !== "x");

  return (
    <View style={infoStyles.row}>
      {/* Label badge (sargam / Western) */}
      {label ? (
        <View style={infoStyles.labelBadge}>
          <Text style={infoStyles.labelText}>{label}</Text>
        </View>
      ) : null}

      {/* Per-string fret pills */}
      <View style={infoStyles.pills}>
        {activeNotes.map((n, i) => (
          <View
            key={i}
            style={[
              infoStyles.pill,
              { backgroundColor: NOTE_COLORS[n.string] + "33",
                borderColor: NOTE_COLORS[n.string] + "88" },
            ]}
          >
            <Text style={[infoStyles.pillString, { color: NOTE_COLORS[n.string] }]}>
              {STRING_NAMES[n.string]}
            </Text>
            <Text style={infoStyles.pillFret}>
              {n.fret === "0" ? "○" : String(n.fret)}
            </Text>
          </View>
        ))}
      </View>

      {/* Position */}
      <Text style={infoStyles.position}>
        {index + 1}/{total}
      </Text>
    </View>
  );
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    minHeight: 36,
  },
  labelBadge: {
    backgroundColor: "rgba(232,135,42,0.2)",
    borderWidth: 1,
    borderColor: "rgba(232,135,42,0.5)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  labelText: {
    color: "#FFB347",
    fontWeight: "700",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  pills: {
    flexDirection: "row",
    gap: 4,
    flex: 1,
    flexWrap: "wrap",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pillString: {
    fontSize: 10,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  pillFret: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  position: {
    fontSize: 12,
    color: "rgba(255,255,255,0.3)",
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyHighway = React.memo(function EmptyHighway({
  onLoad,
}: {
  onLoad: () => void;
}) {
  return (
    <View style={[emptyStyles.container, { height: HIGHWAY_HEIGHT }]}>
      <Feather name="music" size={36} color="rgba(190,150,60,0.4)" />
      <Text style={emptyStyles.title}>No tab loaded</Text>
      <Text style={emptyStyles.subtitle}>
        Load a guitar tab, sargam, or Western notation to start
      </Text>
      <Pressable
        onPress={onLoad}
        style={({ pressed }) => [
          emptyStyles.btn,
          { opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Feather name="plus" size={16} color="#FFF" />
        <Text style={emptyStyles.btnText}>Load Tab</Text>
      </Pressable>
    </View>
  );
});

const emptyStyles = StyleSheet.create({
  container: {
    backgroundColor: "#0C1420",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(190,150,60,0.2)",
  },
  title: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 18,
    fontWeight: "600",
  },
  subtitle: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E8872A",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  btnText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
});

// ─── Player screen ────────────────────────────────────────────────────────────
export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const {
    currentSong,
    currentChordIndex,
    isPlaying,
    bpm,
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

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={styles.container}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: topPad + 10 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.appName}>GuitarTab</Text>
          {currentSong ? (
            <View style={{ gap: 1 }}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {currentSong.title}
              </Text>
              {currentSong.artist ? (
                <Text style={styles.artistName} numberOfLines={1}>
                  {currentSong.artist}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.noSong}>No song loaded</Text>
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
                  ? "#E8872A"
                  : "rgba(255,255,255,0.08)",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather
              name="sliders"
              size={17}
              color={showSpeed ? "#FFF" : "rgba(255,255,255,0.55)"}
            />
          </Pressable>

          <Pressable
            onPress={() => setShowUpload(true)}
            style={({ pressed }) => [
              styles.loadBtn,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="plus" size={15} color="#FFF" />
            <Text style={styles.loadBtnText}>Load Tab</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Main scroll area ─────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPad + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {showSpeed && (
          <View style={styles.speedPanel}>
            <SpeedControl />
          </View>
        )}

        {/* Note highway */}
        {currentSong && allChords.length > 0 ? (
          <NoteHighway
            chords={allChords}
            currentIndex={currentChordIndex}
            isPlaying={isPlaying}
            bpm={bpm}
          />
        ) : (
          <EmptyHighway onLoad={() => setShowUpload(true)} />
        )}

        {/* Current chord info */}
        {currentChord && (
          <ChordInfoBar
            label={currentChord.label}
            notes={currentChord.notes}
            index={currentChordIndex}
            total={allChords.length}
          />
        )}

        {/* Sequence progress bar */}
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
    backgroundColor: "#0A1018",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.07)",
    gap: 10,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  appName: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    color: "#E8872A",
    marginBottom: 2,
  },
  songTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#F0EAE0",
  },
  artistName: {
    fontSize: 13,
    color: "rgba(240,234,224,0.5)",
  },
  noSong: {
    fontSize: 17,
    color: "rgba(255,255,255,0.2)",
    fontWeight: "500",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  loadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E8872A",
    paddingHorizontal: 13,
    height: 36,
    borderRadius: 18,
  },
  loadBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 14,
    gap: 14,
  },
  speedPanel: { marginBottom: 2 },
  progressSection: {},
  controlsSection: {},
});
