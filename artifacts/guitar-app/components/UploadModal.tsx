import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { parseGuitarTab, extractSongMeta } from "@/utils/tabParser";
import { isSargamText, parseSargamText } from "@/utils/sargamParser";
import { isWesternNotationText, parseWesternNotation } from "@/utils/westernNotationParser";
import { TabSong } from "@/context/TabContext";

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdd: (song: TabSong) => void;
};

const DEMO_SARGAM = `Maha Ganapatim Song (Sargam)
Raag: Nata Raag  Scale: Sa=A

(Variation 1)
maPa maGamaga SaSaga SaGama niPa maGamaga SaSaga SaGama maPa maGamaga Sa

(Variation 2)
maPa maGamaga SaSaGa GamaPa maPa maGamaga SaSaGa GamaPa maPa maGamaga Sa

(Vasishtha)
SaPama Pama GamaPa PaniPa maGagaSa SaPama Pama GamaPa PaniPa
`;

const DEMO_TAB = `Title: Smoke on the Water
Artist: Deep Purple

[Intro Riff]
e|-------------------------------------|
B|-------------------------------------|
G|--0--3--5---0--3-6-5---0--3--5--3--0-|
D|--0--3--5---0--3-6-5---0--3--5--3--0-|
A|-------------------------------------|
E|-------------------------------------|

[Verse]
e|-------------------------------------|
B|-------------------------------------|
G|--5--5--7---5--7-8-7---5--7--8--7--5-|
D|--5--5--7---5--7-8-7---5--7--8--7--5-|
A|--3--3--5---3--5-6-5---3--5--6--5--3-|
E|-------------------------------------|
`;

export default function UploadModal({ visible, onClose, onAdd }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"paste" | "upload">("paste");

  const handleClose = () => {
    setText("");
    setTitle("");
    setArtist("");
    onClose();
  };

  const handlePickFile = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/plain", "text/*", "application/octet-stream"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setLoading(true);
      const asset = result.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri);
      setText(content);

      const meta = extractSongMeta(content);
      if (meta.title && !title) setTitle(meta.title);
      if (meta.artist && !artist) setArtist(meta.artist || "");
    } catch (err) {
      Alert.alert("Error", "Could not read file. Try pasting the tab text.");
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = () => {
    setText(DEMO_TAB);
    setTitle("Smoke on the Water");
    setArtist("Deep Purple");
  };

  const handleDemoSargam = () => {
    setText(DEMO_SARGAM);
    setTitle("Maha Ganapatim");
    setArtist("Nata Raag");
  };

  const handleSubmit = () => {
    if (!text.trim()) {
      Alert.alert("No content", "Please paste a guitar tab, sargam, or Western notation.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let song: TabSong;
    if (isSargamText(text)) {
      song = parseSargamText(text, title.trim() || undefined);
    } else if (isWesternNotationText(text)) {
      song = parseWesternNotation(text, title.trim() || undefined);
    } else {
      song = parseGuitarTab(text, title.trim() || undefined);
    }

    if (artist.trim()) song.artist = artist.trim();
    if (title.trim()) song.title = title.trim();
    onAdd(song);
    handleClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? colors.background : "#F8F4EF",
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: colors.border },
          ]}
        >
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Add Tab or Sargam
          </Text>
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.closeBtn,
              {
                backgroundColor: isDark ? "#2A2218" : "#F0EAE0",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="x" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Song info */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Song Title
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Enter title..."
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.card : "#FFFFFF",
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              Artist
            </Text>
            <TextInput
              value={artist}
              onChangeText={setArtist}
              placeholder="Optional..."
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? colors.card : "#FFFFFF",
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
            />
          </View>

          {/* Tab source tabs */}
          <View style={[styles.tabSwitcher, { borderColor: colors.border }]}>
            {(["paste", "upload"] as const).map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tabOption,
                  {
                    backgroundColor:
                      activeTab === tab
                        ? colors.tint
                        : "transparent",
                  },
                ]}
              >
                <Feather
                  name={tab === "paste" ? "clipboard" : "upload"}
                  size={14}
                  color={activeTab === tab ? "#fff" : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.tabOptionText,
                    {
                      color:
                        activeTab === tab ? "#fff" : colors.textSecondary,
                    },
                  ]}
                >
                  {tab === "paste" ? "Paste Tab" : "Upload File"}
                </Text>
              </Pressable>
            ))}
          </View>

          {activeTab === "paste" ? (
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text
                  style={[styles.fieldLabel, { color: colors.textSecondary }]}
                >
                  Tab or Sargam Notation
                </Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <Pressable onPress={handleDemoSargam}>
                    <Text style={[styles.demoLink, { color: colors.tint }]}>
                      Sargam demo
                    </Text>
                  </Pressable>
                  <Pressable onPress={handleDemo}>
                    <Text style={[styles.demoLink, { color: colors.tint }]}>
                      Tab demo
                    </Text>
                  </Pressable>
                </View>
              </View>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={`Paste guitar tab:\ne|--0--2--3-|\nB|--1--3--0-|\n\nOr sargam notation:\nmaPa maGamaga SaSaga`}
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={12}
                style={[
                  styles.textArea,
                  {
                    backgroundColor: isDark ? colors.card : "#FFFFFF",
                    color: colors.text,
                    borderColor: colors.border,
                    fontFamily:
                      Platform.OS === "ios" ? "Menlo" : "monospace",
                  },
                ]}
                textAlignVertical="top"
              />
            </View>
          ) : (
            <Pressable
              onPress={handlePickFile}
              style={({ pressed }) => [
                styles.uploadArea,
                {
                  backgroundColor: isDark ? colors.card : "#FFFFFF",
                  borderColor: text ? colors.tint : colors.border,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.tint} />
              ) : text ? (
                <>
                  <Feather name="check-circle" size={32} color={colors.tint} />
                  <Text style={[styles.uploadTitle, { color: colors.tint }]}>
                    File loaded!
                  </Text>
                  <Text
                    style={[styles.uploadSubtitle, { color: colors.textMuted }]}
                  >
                    {text.split("\n").length} lines • Tap to replace
                  </Text>
                </>
              ) : (
                <>
                  <Feather name="file-text" size={36} color={colors.textMuted} />
                  <Text
                    style={[styles.uploadTitle, { color: colors.text }]}
                  >
                    Choose a .txt file
                  </Text>
                  <Text
                    style={[
                      styles.uploadSubtitle,
                      { color: colors.textMuted },
                    ]}
                  >
                    Upload a plain text guitar tab file
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </ScrollView>

        {/* Add button */}
        <View style={[styles.footer, { paddingHorizontal: 20 }]}>
          <Pressable
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.addBtn,
              {
                backgroundColor: colors.tint,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add Tab</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  demoLink: {
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  tabSwitcher: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  tabOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
  },
  tabOptionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  textArea: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 13,
    minHeight: 200,
    lineHeight: 20,
  },
  uploadArea: {
    height: 180,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  uploadTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  uploadSubtitle: {
    fontSize: 14,
  },
  footer: {
    paddingTop: 12,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
