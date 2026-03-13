import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
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
import SongCard from "@/components/SongCard";
import UploadModal from "@/components/UploadModal";
import Colors from "@/constants/colors";
import { useTabContext } from "@/context/TabContext";

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { songs, currentSong, loadSong, deleteSong, addSong } = useTabContext();
  const [showUpload, setShowUpload] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSelect = (song: any) => {
    loadSong(song);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/");
  };

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Library
        </Text>
        <Pressable
          onPress={() => setShowUpload(true)}
          style={({ pressed }) => [
            styles.addBtn,
            {
              backgroundColor: colors.tint,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Feather name="plus" size={18} color="#fff" />
        </Pressable>
      </View>

      {songs.length === 0 ? (
        <View style={styles.emptyState}>
          <View
            style={[
              styles.emptyIcon,
              { backgroundColor: isDark ? "#2A2218" : "#F0EAE0" },
            ]}
          >
            <Feather name="book-open" size={32} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No tabs yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            Add your first guitar tab to get started
          </Text>
          <Pressable
            onPress={() => setShowUpload(true)}
            style={({ pressed }) => [
              styles.emptyBtn,
              { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.emptyBtnText}>Add First Tab</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: bottomPad + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.countText, { color: colors.textMuted }]}>
            {songs.length} {songs.length === 1 ? "tab" : "tabs"}
          </Text>
          {songs.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              isActive={currentSong?.id === song.id}
              onPress={() => handleSelect(song)}
              onDelete={() => deleteSong(song.id)}
            />
          ))}
        </ScrollView>
      )}

      <UploadModal
        visible={showUpload}
        onClose={() => setShowUpload(false)}
        onAdd={(song) => {
          addSong(song);
          loadSong(song);
          setShowUpload(false);
          router.push("/");
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
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 10,
  },
  countText: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
