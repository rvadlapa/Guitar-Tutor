import { Feather, Ionicons } from "@expo/vector-icons";
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

type Props = {
  totalChords: number;
};

export default function PlaybackControls({ totalChords }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const {
    isPlaying, play, pause, stop, nextChord, prevChord,
    currentChordIndex, audioEnabled, setAudioEnabled,
    voiceEnabled, setVoiceEnabled,
  } = useTabContext();

  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleStop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stop();
  };

  const handlePrev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    prevChord();
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    nextChord();
  };

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
      {/* Progress indicator */}
      <Text style={[styles.progress, { color: colors.textSecondary }]}>
        {totalChords > 0
          ? `${currentChordIndex + 1} / ${totalChords}`
          : "—"}
      </Text>

      {/* Controls row */}
      <View style={styles.controls}>
        <Pressable
          onPress={handleStop}
          style={({ pressed }) => [
            styles.controlBtn,
            {
              backgroundColor: isDark ? "#2A2218" : "#F0EAE0",
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Feather name="square" size={18} color={colors.textSecondary} />
        </Pressable>

        <Pressable
          onPress={handlePrev}
          style={({ pressed }) => [
            styles.controlBtn,
            {
              backgroundColor: isDark ? "#2A2218" : "#F0EAE0",
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Feather name="skip-back" size={20} color={colors.text} />
        </Pressable>

        <Pressable
          onPress={handlePlay}
          style={({ pressed }) => [
            styles.playBtn,
            {
              backgroundColor: colors.tint,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
        >
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={28}
            color="#fff"
            style={!isPlaying ? { marginLeft: 3 } : undefined}
          />
        </Pressable>

        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.controlBtn,
            {
              backgroundColor: isDark ? "#2A2218" : "#F0EAE0",
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Feather name="skip-forward" size={20} color={colors.text} />
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setAudioEnabled(!audioEnabled);
          }}
          style={({ pressed }) => [
            styles.controlBtn,
            {
              backgroundColor: audioEnabled
                ? isDark ? "#2E2010" : "#FFF0DC"
                : isDark ? "#2A2218" : "#F0EAE0",
              opacity: pressed ? 0.7 : 1,
              borderWidth: audioEnabled ? 1.5 : 0,
              borderColor: audioEnabled ? colors.tint : "transparent",
            },
          ]}
        >
          <Feather
            name={audioEnabled ? "volume-2" : "volume-x"}
            size={18}
            color={audioEnabled ? colors.tint : colors.textSecondary}
          />
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setVoiceEnabled(!voiceEnabled);
          }}
          style={({ pressed }) => [
            styles.controlBtn,
            {
              backgroundColor: voiceEnabled
                ? isDark ? "#1C2E10" : "#EAF5DC"
                : isDark ? "#2A2218" : "#F0EAE0",
              opacity: pressed ? 0.7 : 1,
              borderWidth: voiceEnabled ? 1.5 : 0,
              borderColor: voiceEnabled ? "#6BBF3A" : "transparent",
            },
          ]}
        >
          <Feather
            name="mic"
            size={18}
            color={voiceEnabled ? "#6BBF3A" : colors.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
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
  progress: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  controlBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#E8872A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
});
