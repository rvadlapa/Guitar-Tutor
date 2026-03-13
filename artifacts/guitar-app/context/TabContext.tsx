import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { playChord } from "@/utils/audioEngine";
import { speakLabel, setVoiceEnabled as _setVoiceEnabled } from "@/utils/voiceEngine";

export type GuitarNote = {
  string: number;
  fret: number | "x" | "0";
  finger?: number;
  technique?: "bend" | "slide" | "hammer" | "pull" | "vibrato" | "none";
};

export type TabChord = {
  id: string;
  notes: GuitarNote[];
  duration?: number;
  label?: string;
};

export type TabSection = {
  id: string;
  name: string;
  chords: TabChord[];
};

export type TabSong = {
  id: string;
  title: string;
  artist?: string;
  tuning: string[];
  sections: TabSection[];
  createdAt: number;
  rawText?: string;
};

type TabContextType = {
  songs: TabSong[];
  currentSong: TabSong | null;
  currentChordIndex: number;
  isPlaying: boolean;
  bpm: number;
  audioEnabled: boolean;
  voiceEnabled: boolean;
  setBpm: (bpm: number) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  loadSong: (song: TabSong) => void;
  deleteSong: (id: string) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  nextChord: () => void;
  prevChord: () => void;
  seekToChord: (index: number) => void;
  addSong: (song: TabSong) => void;
};

const TabContext = createContext<TabContextType | null>(null);

const STORAGE_KEY = "@guitar_tabs_songs";

export function TabProvider({ children }: { children: React.ReactNode }) {
  const [songs, setSongs] = useState<TabSong[]>([]);
  const [currentSong, setCurrentSong] = useState<TabSong | null>(null);
  const [currentChordIndex, setCurrentChordIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpmState] = useState(80);
  const [audioEnabled, setAudioEnabledState] = useState(true);
  const [voiceEnabled, setVoiceEnabledState] = useState(false);

  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentSongRef = useRef<TabSong | null>(null);
  const currentChordIndexRef = useRef(0);
  const bpmRef = useRef(80);
  const audioEnabledRef = useRef(true);
  const voiceEnabledRef = useRef(false);

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { currentChordIndexRef.current = currentChordIndex; }, [currentChordIndex]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { audioEnabledRef.current = audioEnabled; }, [audioEnabled]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);

  // Play audio and voice whenever the current chord changes
  useEffect(() => {
    if (!currentSong) return;
    const allChords = currentSong.sections.flatMap((s) => s.chords);
    const chord = allChords[currentChordIndex];
    if (!chord) return;
    if (audioEnabledRef.current && chord.notes.length > 0) {
      playChord(chord.notes).catch(() => {});
    }
    if (voiceEnabledRef.current && chord.label) {
      speakLabel(chord.label).catch(() => {});
    }
  }, [currentChordIndex, currentSong]);

  useEffect(() => {
    loadSongs();
  }, []);

  const loadSongs = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setSongs(JSON.parse(raw));
    } catch {}
  };

  const saveSongs = async (updated: TabSong[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  };

  const addSong = useCallback((song: TabSong) => {
    setSongs((prev) => {
      const next = [song, ...prev];
      saveSongs(next);
      return next;
    });
  }, []);

  const deleteSong = useCallback((id: string) => {
    setSongs((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSongs(next);
      return next;
    });
    setCurrentSong((prev) => (prev?.id === id ? null : prev));
  }, []);

  const getAllChords = (song: TabSong): TabChord[] =>
    song.sections.flatMap((s) => s.chords);

  const stopPlayback = useCallback(() => {
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const loadSong = useCallback((song: TabSong) => {
    stopPlayback();
    setCurrentSong(song);
    setCurrentChordIndex(0);
  }, [stopPlayback]);

  const play = useCallback(() => {
    if (!currentSongRef.current) return;
    const allChords = getAllChords(currentSongRef.current);
    if (allChords.length === 0) return;

    setIsPlaying(true);

    const tick = () => {
      const song = currentSongRef.current;
      if (!song) return;
      const chords = getAllChords(song);
      const next = currentChordIndexRef.current + 1;
      if (next >= chords.length) {
        stopPlayback();
        setCurrentChordIndex(0);
      } else {
        setCurrentChordIndex(next);
      }
    };

    const interval = (60 / bpmRef.current) * 1000;
    playIntervalRef.current = setInterval(tick, interval);
  }, [stopPlayback]);

  const pause = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const stop = useCallback(() => {
    stopPlayback();
    setCurrentChordIndex(0);
  }, [stopPlayback]);

  const nextChord = useCallback(() => {
    if (!currentSongRef.current) return;
    const allChords = getAllChords(currentSongRef.current);
    setCurrentChordIndex((prev) => Math.min(prev + 1, allChords.length - 1));
  }, []);

  const prevChord = useCallback(() => {
    setCurrentChordIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const seekToChord = useCallback((index: number) => {
    setCurrentChordIndex(index);
  }, []);

  const setBpm = useCallback(
    (newBpm: number) => {
      setBpmState(newBpm);
      if (isPlaying) {
        stopPlayback();
        setTimeout(() => setIsPlaying(false), 50);
      }
    },
    [isPlaying, stopPlayback]
  );

  const setAudioEnabled = useCallback((enabled: boolean) => {
    setAudioEnabledState(enabled);
  }, []);

  const setVoiceEnabled = useCallback((enabled: boolean) => {
    setVoiceEnabledState(enabled);
    _setVoiceEnabled(enabled);
  }, []);

  return (
    <TabContext.Provider
      value={{
        songs,
        currentSong,
        currentChordIndex,
        isPlaying,
        bpm,
        audioEnabled,
        voiceEnabled,
        setBpm,
        setAudioEnabled,
        setVoiceEnabled,
        loadSong,
        deleteSong,
        play,
        pause,
        stop,
        nextChord,
        prevChord,
        seekToChord,
        addSong,
      }}
    >
      {children}
    </TabContext.Provider>
  );
}

export function useTabContext() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error("useTabContext must be inside TabProvider");
  return ctx;
}
