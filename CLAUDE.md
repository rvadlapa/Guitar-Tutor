# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working tree caveat

The repo is a pnpm workspace monorepo, but the working tree on this machine currently shows the root `package.json`, `pnpm-workspace.yaml`, `tsconfig*.json`, `replit.md`, all of `lib/`, and `scripts/` as **deleted** (they are still tracked at HEAD). Only `artifacts/` exists on disk. Before running root scripts (`pnpm run typecheck`, `pnpm run build`) or touching shared libs, restore the deleted files (`git restore .`) — otherwise nothing at the root will work and the `@workspace/*` imports inside `artifacts/api-server` and `artifacts/guitar-app` won't resolve.

## Toolchain

- **Package manager: pnpm only.** The root `preinstall` script deletes `package-lock.json` / `yarn.lock` and exits non-zero if `npm`/`yarn` are used. Always use `pnpm` and `pnpm --filter <pkg> run <script>`.
- Node 24, TypeScript 5.9.
- Many dep versions are pinned via `pnpm-workspace.yaml` `catalog:` (e.g. `react`, `react-dom`, `tsx`, `vite`, `zod`, `drizzle-orm`). Reference catalog entries (`"react": "catalog:"`) instead of hard-coding versions.
- `pnpm-workspace.yaml` aggressively excludes non-Linux-x64 platform binaries via `overrides` because the project deploys on Replit (linux-x64 only). Don't unset these — adding macOS/Windows/Android variants would bloat the lockfile.

## Common commands

Root (run from repo root, requires the deleted root files restored):
- `pnpm run typecheck` — `tsc --build` across all project references. **Always typecheck from root**, not inside a single package — the composite-project graph requires upstream `.d.ts` to be emitted first.
- `pnpm run build` — typechecks then runs `pnpm -r --if-present run build` across every workspace package that defines `build`.

Per-package (use `pnpm --filter <name> run <script>`):
- `@workspace/api-server`: `dev` (tsx hot-run of `src/index.ts`), `build` (esbuild → `dist/index.cjs`, see below), `typecheck`.
- `@workspace/guitar-app`: `dev` (Expo with Replit proxy env vars), `build` (custom `scripts/build.js` static Expo Go pipeline), `serve` (zero-dep Node static server for the static build), `typecheck`.
- `@workspace/mockup-sandbox`: `dev`/`build`/`preview` (Vite), `typecheck`. Requires `PORT` and `BASE_PATH` env vars or it throws on startup.
- `@workspace/api-spec`: `codegen` — runs Orval to regenerate both `lib/api-client-react/src/generated/` (React Query hooks) and `lib/api-zod/src/generated/` (Zod schemas) from `openapi.yaml`. Run this whenever the OpenAPI spec changes; downstream `@workspace/api-server` and the guitar app pick up the regenerated code.
- `@workspace/db`: `push` / `push-force` — Drizzle Kit schema push against `DATABASE_URL`. Replit handles real migrations on publish; in dev we just push.
- `@workspace/scripts`: `pnpm --filter @workspace/scripts run <script>` — each `.ts` in `src/` has a matching npm script.

## Architecture

### Workspace layout

```
artifacts/                 deployable apps (each its own package)
  api-server/              Express 5 backend
  guitar-app/              Expo Router 6 / React Native + web frontend
  mockup-sandbox/          Vite + shadcn/ui component preview server
lib/                       shared libraries
  api-spec/                OpenAPI 3.1 source + Orval config (codegen owner)
  api-client-react/        generated React Query hooks (consumed by guitar-app)
  api-zod/                 generated Zod schemas (consumed by api-server)
  db/                      Drizzle ORM client + schema
scripts/                   misc utility scripts (single workspace package)
```

`pnpm-workspace.yaml` declares packages: `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`.

### TypeScript composite projects

Every package extends `tsconfig.base.json` with `composite: true`, and the root `tsconfig.json` lists each lib package as a project reference. Implications:

- When package A depends on B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses these to determine build order.
- `customConditions: ["workspace"]` is set so `@workspace/*` imports resolve to source via the package `exports` field (e.g. `lib/db/package.json` exports `./src/index.ts` directly).
- `tsc` is only used for type-checking and `.d.ts` emission. Actual JS bundling is done by tsx (dev), esbuild (api-server), Vite (mockup-sandbox), or Metro (guitar-app).

### API contract flow

`lib/api-spec/openapi.yaml` is the single source of truth. `pnpm --filter @workspace/api-spec run codegen` regenerates two siblings:
- `lib/api-zod/src/generated/` — used server-side: `api-server` validates response payloads with `HealthCheckResponse.parse(...)` etc.
- `lib/api-client-react/src/generated/` — used client-side by the guitar app via React Query hooks. The fetch client is overridden to `lib/api-client-react/src/custom-fetch.ts`.

Treat everything under those `generated/` directories as build artifacts — never edit by hand. Routes in `api-server/src/routes/*` are mounted under `/api` (see `app.ts`); e.g. health is at `/api/healthz`.

### api-server build

`artifacts/api-server/build.ts` produces a single CJS bundle (`dist/index.cjs`) optimized for Replit cold-start: it bundles only an explicit allowlist of deps (express, cors, drizzle-orm, pg, zod, etc.) and externalizes the rest. When adding a new server-only dep that's safe to bundle, append it to `allowlist` in `build.ts` — otherwise it stays externalized.

### Guitar app

Expo Router 6 with file-based routing under `app/`. Entry tree wraps the navigator in `SafeAreaProvider` → `ErrorBoundary` → `QueryClientProvider` → `TabProvider` → gesture/keyboard providers (`app/_layout.tsx`).

`context/TabContext.tsx` is the playback state machine. It owns:
- The song library (persisted to `AsyncStorage` under `@guitar_tabs_songs`).
- `currentSong`, `currentChordIndex`, `isPlaying`, `bpm`, `audioEnabled`, `voiceEnabled`.
- Refs that mirror state (`currentSongRef`, `currentChordIndexRef`, `bpmRef`, etc.) so the `setInterval` tick reads fresh values without re-creating the interval.
- A side effect on `currentChordIndex` change that triggers `playChord` (audio) and `speakLabel` (voice). Mutating either ref/setter is the seam where audio/voice playback hooks in.

Three parsers live under `utils/`:
- `tabParser.ts` — column-scans 6-line guitar tab text into `TabChord[]`, detecting techniques (bend/slide/hammer/pull/vibrato).
- `sargamParser.ts` — converts Indian classical Sargam syllables (Sa/Re/Ga/...) to MIDI then to guitar string/fret positions, defaulting `Sa = A2 (MIDI 45)`.
- `audioEngine.ts` — dual playback: Web Audio API for browser/Expo web, `expo-av` for native; handles open-string frequencies and fret transposition.

The custom build (`scripts/build.js`) drives Expo Metro to produce a static deploy: starts Metro, downloads ios/android bundles + manifests, rewrites asset URLs to a Replit-supplied base URL, copies hashed assets to `static-build/`. Required env: `REPLIT_INTERNAL_APP_DOMAIN` or `REPLIT_DEV_DOMAIN` or `EXPO_PUBLIC_DOMAIN`. The companion `server/serve.js` is a zero-dep Node http server that returns the platform-specific manifest when an `expo-platform` header is present, otherwise serves the landing page / static files.

### mockup-sandbox

Vite app whose only purpose is rendering individual mockup components for an external workspace canvas. The custom Vite plugin `mockupPreviewPlugin.ts`:
- Watches `src/components/mockups/**/*.tsx` (excluding paths starting with `_`).
- Generates `src/.generated/mockup-components.ts` — a map of dynamic-import loaders keyed by `./components/mockups/<path>.tsx`.
- Re-runs on add/unlink and on 404s for paths in `/components/mockups/` or `/.generated/mockup-components` (handy when the canvas requests a component before the watcher debounce fires).

`src/App.tsx` reads that generated module map and routes `/preview/<componentPath>` to a dynamic loader that picks `default` → `Preview` named export → last function export. Don't hand-edit `src/.generated/`.

## Environment variables you'll encounter

- `DATABASE_URL` — Postgres URL for Drizzle (Replit injects this).
- `PORT` — required by api-server, mockup-sandbox; the guitar app dev script forwards it to Expo.
- `BASE_PATH` — required by mockup-sandbox Vite config and the guitar-app static build for asset URL rewriting.
- `REPL_ID`, `REPLIT_DEV_DOMAIN`, `REPLIT_INTERNAL_APP_DOMAIN`, `REPLIT_EXPO_DEV_DOMAIN`, `EXPO_PUBLIC_DOMAIN`, `EXPO_PUBLIC_REPL_ID` — Replit/Expo deployment plumbing; the guitar app's dev and build scripts read these.
