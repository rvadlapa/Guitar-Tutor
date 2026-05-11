# Guitar Tutor Pro

A guitar-tab learning app that takes guitar tablature, Indian classical Sargam, or Western letter notation as input, parses it into a chord sequence, and plays it back with a synchronized fretboard visualization.

The repo is a pnpm workspace monorepo set up to deploy on Replit. The flagship app is `artifacts/guitar-app`; the other workspaces (`artifacts/api-server`, `artifacts/mockup-sandbox`, `lib/*`) are scaffolding for a future backend that the app does not currently use.

## What you can do with it

- Paste a guitar tab, Sargam, or Western notation, and step through it on a virtual fretboard.
- Upload a `.txt`, `.pdf`, or image of a tab; the upload modal extracts text via pdf.js or Tesseract OCR (web only) and runs it through the parsers.
- Adjust BPM, scrub through the chord sequence, see the next 5 notes, hear synthesized guitar audio (acoustic Karplus-Strong or electric), and optionally hear Sargam syllables spoken.
- Save songs to a local library (persisted via AsyncStorage).

Three demo presets ship with the app: Smoke on the Water (tab), Maha Ganapatim (Sargam), Aakasham (Western), and Gehra Hua / Durandhar (tab).

## Quick start

The app deploys on Replit; running locally needs a few platform-specific tweaks (see CLAUDE.md → "Working tree caveat").

```bash
pnpm install
cd artifacts/guitar-app
pnpm exec expo start
# press 'w' for web, scan QR with Expo Go for mobile
```

PDF and image upload only work in the web build. On native they show a clear error and fall back to text-only upload.

## Architecture (the part worth reading multiple files for)

### Input pipeline

Three independent parsers all produce the same `TabSong` shape (`sections[].chords[].notes[]`), which is the only thing the rest of the app understands:

- `utils/tabParser.ts` — column-scans 6-line ASCII guitar tab text. Detects techniques (bend, slide, hammer-on, pull-off, vibrato) from neighbouring characters. Disambiguates uppercase `E` rows by position in the block (first = high-e, second = low-E).
- `utils/sargamParser.ts` — tokenizes Indian classical syllables (Sa Re Ga Ma Pa Dha Ni), maps to MIDI then to guitar fret positions. Default `Sa = C4`. Lower-case syllables are komal (flat); `Ma#` is tivra.
- `utils/westernNotationParser.ts` — accepts letter notation (`C D D# F G A#`), maps to MIDI then to fret positions.

`UploadModal.tsx` calls `isSargamText` / `isWesternNotationText` to auto-route between them.

### Playback

`context/TabContext.tsx` is the playback state machine. It owns:

- `currentSong`, `currentChordIndex`, `isPlaying`, `bpm`, `audioEnabled`, `voiceEnabled`.
- A `setInterval` driven by BPM that advances `currentChordIndex`.
- A side effect on `currentChordIndex` change that calls `playChord(chord.notes)` and `speakLabel(chord.label)`.

The audio path branches by platform:

- `utils/audioEngine.ts` (web) — Web Audio API with two synthesis models: a Karplus-Strong physical model for acoustic guitar (correct 1/n² harmonic rolloff, pluck-position comb filtering, body resonance), and a sawtooth-based electric guitar with high-cut filtering.
- `utils/audioEngine.ts` (native) — generates plucked-string WAVs as base64, writes them to the cache directory, plays them via `expo-av`. Sounds are cached per `(string, fret)` pair so repeated plays are instant.

### Rendering

`app/(tabs)/index.tsx` is the player screen. The main visualization is `components/NoteHighway.tsx` — a scrolling 6-string lane view where notes flow toward a playhead at BPM rate. Around it:

- `ChordInfoBar` (inline in `index.tsx`) — current chord's per-string fret pills.
- `UpcomingNotes.tsx` — strip showing the next 5 notes after the playhead.
- `TabProgressBar.tsx` — full-song scrubber.
- `PlaybackControls.tsx`, `SpeedControl.tsx` — transport + BPM.
- `GuitarNeck.tsx` — alternate fretboard view used on the reference screen.

`app/(tabs)/library.tsx` lists saved songs. `app/(tabs)/reference.tsx` shows a Sargam-on-fretboard reference chart with finger-colour coding.

### Workspace layout

```
artifacts/
  guitar-app/          # the actual app (Expo + RN, web/iOS/Android)
  api-server/          # Express 5 backend (only health endpoint exists today)
  mockup-sandbox/      # Vite + shadcn UI component preview server
lib/
  api-spec/            # OpenAPI spec + Orval codegen
  api-client-react/    # generated React Query hooks
  api-zod/             # generated Zod schemas
  db/                  # Drizzle ORM + Postgres
scripts/               # workspace utility scripts
```

The lib/ packages are wired up but not consumed by the guitar app yet. See `CLAUDE.md` for monorepo build details and the pnpm/composite-project conventions.

## Tech stack

- **Frontend**: Expo Router 6, React Native 0.81, React 19, TypeScript 5.9
- **Audio**: Web Audio API (custom Karplus-Strong synth) + expo-av + Tone.js
- **File extraction**: pdfjs-dist (PDF text), tesseract.js (image OCR) — web only
- **Voice**: Web Speech API + expo-speech for Sargam syllable pronunciation
- **Backend** (scaffolded, unused): Express 5, Drizzle ORM, Postgres, Zod, Orval
- **Build**: pnpm workspaces, esbuild (server), Metro (mobile), Vite (sandbox)

## Limitations

- PDF and image upload are web-only.
- Slides (`/`, `\`) are detected and tagged but play as discrete pitch jumps, not gliding pitch.
- No backend persistence — songs live in the device's local AsyncStorage.
- The OpenAPI contract in `lib/api-spec` only declares a health endpoint; the front end does not call the API.
- Tesseract OCR quality on photographed handwritten tabs is hit-or-miss; works much better on screenshots of typed/printed tabs.
