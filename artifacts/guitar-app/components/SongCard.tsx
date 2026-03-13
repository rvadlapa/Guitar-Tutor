import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import Colors from "@/constants/colors";
import { TabSong } from "@/context/TabContext";

type Props = {
  song: TabSong;
  isActive: boolean;
  onPress: () => void;
  onDelete: () => void;
};

export default function SongCard({ song, isActive, onPress, onDelete }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const totalChords = song.sections.reduce(
    (sum, s) => sum + s.chords.length,
    0
  );

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.97,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete();
  };

  const date = new Date(song.createdAt);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.card,
          {
            backgroundColor: isActive
              ? isDark
                ? "#2E2010"
                : "#FFF7ED"
              : isDark
              ? colors.card
              : colors.backgroundSecondary,
            borderColor: isActive ? colors.tint : colors.border,
            borderWidth: isActive ? 1.5 : 1,
          },
        ]}
      >
        {/* Guitar icon */}
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: isActive
                ? colors.tint
                : isDark
                ? "#2A2218"
                : "#F0EAE0",
            },
          ]}
        >
          <Feather
            name="music"
            size={20}
            color={isActive ? "#fff" : colors.textSecondary}
          />
        </View>

        <View style={styles.info}>
          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                fontWeight: isActive ? "700" : "600",
              },
            ]}
            numberOfLines={1}
          >
            {song.title}
          </Text>
          {song.artist && (
            <Text
              style={[styles.artist, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {song.artist}
            </Text>
          )}
          <View style={styles.meta}>
            <Text style={[styles.metaText, { color: colors.textMuted }]}>
              {totalChords} chords
            </Text>
            <Text style={[styles.dot, { color: colors.border }]}>•</Text>
            <Text style={[styles.metaText, { color: colors.textMuted }]}>
              {song.sections.length}{" "}
              {song.sections.length === 1 ? "section" : "sections"}
            </Text>
            <Text style={[styles.dot, { color: colors.border }]}>•</Text>
            <Text style={[styles.metaText, { color: colors.textMuted }]}>
              {dateStr}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {isActive && (
            <View
              style={[styles.activeBadge, { backgroundColor: colors.tint }]}
            >
              <Feather name="play" size={10} color="#fff" />
            </View>
          )}
          <Pressable
            onPress={handleDelete}
            hitSlop={8}
            style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
          >
            <Feather name="trash-2" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
  },
  artist: {
    fontSize: 13,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
  },
  dot: {
    fontSize: 10,
  },
  actions: {
    alignItems: "center",
    gap: 8,
  },
  activeBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
