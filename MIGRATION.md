# Svelte 5 Migration Plan for web-audio-fx

## Current State

**Stack:** Svelte 5 + SvelteKit 2 + Vite 8 + TypeScript + SCSS + gh-pages
**Architecture:** SvelteKit SSG with `adapter-static`, two routes (`/`, `/loopstation` dev-only)
**Phase:** All phases complete ✅

**Framework-agnostic (stays as-is):**

- `src/lib/audio/` - Audio nodes, plugins, clock, metronome
- `static/processors/recording.processor.js` - AudioWorkletProcessor

---

## Target UI

```
┌─────────────────────────────────────────────────┐
│  [BPM: 120] [Time Sig: 4/4 ▾] [▶ Play] [● Rec] │  Header
├─────────────────────────────────────────────────┤
│  ┌─ Sample Viewer (collapsible) ──────────────┐ │
│  │  [Waveform SVG] [Play][Loop][Rev][Trim]    │ │
│  └────────────────────────────────────────────┘ │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│ Browser  │         Timeline SVG                 │
│ (files)  │   (click track name → select track)  │
│          │                                      │
├──────────┴──────────────────────────────────────┤
│ ▾ Effects: Track 2  [+ Add Plugin ▾]            │  Collapsible
│ ┌──────────┐ ┌──────────┐                       │
│ │  Delay   │ │  Reverb  │  ...                  │
│ │ [Mix]    │ │ [Mix]    │                       │
│ │ [Time]   │ │ [IR ▾]   │                       │
│ │ [Fb]     │ │ [Decay]  │                       │
│ └──────────┘ └──────────┘                       │
└─────────────────────────────────────────────────┘
```

---

## Completed Phases

### Phase 1: SvelteKit Scaffold ✅

- Installed dependencies, configured `adapter-static`
- Moved `public/` → `static/`, audio classes → `src/lib/audio/`
- Created `vite.config.ts`, `app.html`, route structure

### Phase 2: Header + State ✅

- Migrated `state.ts` (Proxy) → `state.svelte.ts` (Svelte 5 runes)
- Created header components: `AppHeader`, `BPMInput`, `TimeSignatureSelect`, `TransportControls`, `RecordButton`

### Phase 3: Sample Viewer Panel ✅

- Created collapsible panel with SVG waveform display
- Editor controls: play/pause, loop, reverse, trim (trim TODO)
- Uses `onMount` for AudioContext, fetches+decodes samples on selection

### Phase 4: SVG Timeline + File Browser ✅

- Created SVG-based timeline: `Timeline`, `TimelineGrid`, `TimelineClip`, `PlaybackCursor`
- Created `FileBrowser` sidebar listing samples
- Click-to-place clips, right-click context menu, Delete/Backspace to remove
- `+page.server.ts` scans `static/` at build time for sample discovery
- `SampleViewer` loads samples by path from server-provided list

### Phase 5: Per-Track Effects Rack ✅

- `audio.svelte.ts` - Audio graph manager (AudioContext, per-track nodes, rewiring)
- `EffectsRack.svelte` - Collapsible bottom panel, shows selected track's plugins
- `PluginSlot.svelte` - Single plugin card (drag handle, name, bypass/remove, controls)
- `PluginControls.svelte` - Auto-generated param UI from `AudioNodeParam[]`
- Track selection in Timeline (click track name → selectedTrackId)
- Audio wiring: track output → plugins → masterBusNode → destination

### Phase 6: Loopstation (Dev-Only) + Cleanup ✅

- Dev-only route at `/loopstation` via `$app/environment` `dev` flag
- `+layout.svelte` gates access, `+page.ts` disables prerendering
- Full loopstation: 5 tracks, mic input, input FX chain, scheduler, metronome
- Removed old files: `app.ts`, `looper.ts`, `state.ts`, `graph.ts`, `timeline.ts`, `contextmenu.ts`, `clock.ts`, `metronome.ts`, `meter.ts`, `utils/`, `nodes/`, `plugins/`, `styles/`, `processors/`
- Removed `index.html`, `loopstation.html`, `dist/`
- Moved `metronome.ts` → `src/lib/audio/metronome.ts`

---

## Key Technical Decisions

1. **SVG over Canvas** - Timeline uses SVG for native DOM events (click, drag, hover)
2. **Svelte 5 runes** - State in `.svelte.ts` files, reactivity automatic
3. **Config in vite.config.ts** - No `svelte.config.js` (SvelteKit 2.62.0+)
4. **Global styles in +layout.svelte** - No separate `styles/` directory
5. **AudioWorklet path** - `/web-audio-fx/processors/recording.processor.js`
6. **Per-track effects** - Each timeline track is a mixer channel with its own FX chain
7. **Build-time sample discovery** - `+page.server.ts` scans `static/` at build time
8. **Dev-only loopstation** - `$app/environment` `dev` flag, `adapter-static` with `strict: false`

---

## Dependencies

**Installed:** `svelte@5`, `@sveltejs/kit@2`, `@sveltejs/adapter-static@3`, `vite@8`, `prettier`, `prettier-plugin-svelte`
**Note:** `sass` is transitive dep of Vite 8

---

## Migration Complete

1. ~~Phase 1: Scaffold~~ ✅
2. ~~Phase 2: Header + State~~ ✅
3. ~~Phase 3: Sample Viewer~~ ✅
4. ~~Phase 4: SVG Timeline + File Browser~~ ✅
5. ~~Phase 5: Per-Track Effects Rack~~ ✅
6. ~~Phase 6: Loopstation + Cleanup~~ ✅

---

## Feature Summary: `migration` vs `main`

**Scope:** 61 files changed, +5,745 lines added, -3,078 lines removed, 11 commits

### Framework / Architecture Changes

| Aspect | `main` (old) | `migration` (new) |
|---|---|---|
| Framework | Vanilla Vite 7 + manual DOM | SvelteKit 2 + Vite 8 + Svelte 5 |
| UI paradigm | Imperative DOM manipulation | Declarative Svelte 5 components with runes (`$state`, `$derived`, `$effect`, `$props`) |
| State management | Custom `Proxy`-based observer (`state.ts`) | Svelte 5 rune classes (`timeline.svelte.ts`, `ui.svelte.ts`) |
| Styling | Separate SCSS files (6 files) | CSS custom properties in `+layout.svelte` + scoped `<style>` blocks |
| Routing | Single page (`index.html` + `loopstation.html`) | SvelteKit file-based: `/` + `/loopstation` (dev-only) |
| Sample discovery | Client-side file input | Server-side build-time scan of `static/` via `+page.server.ts` |

### Timeline (fully rebuilt as SVG)

- **Multi-track** (15 tracks + master), musical time `{ bar, beat }`, configurable grid step, zoom with Ctrl+Scroll
- **Clip operations**: add, move (grid-snapped, Shift for pixel-precise), resize (left/right handles), delete (Delete/Backspace)
- **Per-clip volume** with visual fill overlay
- **Multi-select**: Ctrl+Click toggle, Ctrl+Drag marquee (rubber band rectangle)
- **Multi-clip drag** with boundary clamping across tracks
- **Copy/Paste** (Ctrl+C/V), Select All (Ctrl+A)
- **Spacebar play/stop** keyboard shortcut
- **Per-clip fade in/out** (10ms exponential, offset-aware to preserve transients on kicks/snares)
- **Playhead scrubbing** (click/drag on header)
- **Loop playback** with automatic rescheduling at loop boundaries
- **Resume from position**: adjusts offset/duration when resuming mid-clip
- **Configurable grid step**: beat, 1/2, 1/4, 1/8, 1/16

### Recording

- **Microphone recording** in timeline: `MediaRecorder` + `getUserMedia` (mono, no processing), auto-places clip on first free track, creates new track if none available
- **Loop Station** (`/loopstation`): 5-track state-machine looper with AudioWorklet recording processor, input FX chain, metronome, count-in, overdub, per-track volume/mute/solo/clear
- **Loop station input controls**: gain, pan, mono switch, monitoring toggle (routes input to output for live monitoring)
- **Loop station FX chain**: drag-and-drop reorderable plugin chain on the input bus (before recording)
- **Loop station state machine**: IDLE → COUNT_IN → PREPARE_REC → RECORDING → PREPARE_PLAY → PLAYING → PREPARE_DUB → OVERDUBBING
- **Count-in**: 4-beat countdown with visual flashing before recording starts

### Effects / Plugins

- **4 plugins** (Reverb/IR, 7-Band EQ, Delay, Compressor) rewritten with typed `AudioNodeParam` system
- **Effects Rack UI**: collapsible bottom panel, drag-reorder, bypass toggle, auto-generated controls from param descriptors
- **Per-track plugin chains** (including Master) with rewiring logic
- **Plugin rewiring**: disconnect all nodes → reconnect through active (non-bypassed) plugins → master/pre node

### New Components (30 `.svelte` files)

| Category | Components |
|---|---|
| Header | `AppHeader`, `BPMInput`, `TimeSignatureSelect`, `TransportControls`, `RecordButton`, `ThemeToggle` |
| Timeline | `Timeline`, `TimelineClip`, `TimelineGrid`, `PlaybackCursor` |
| Sample Viewer | `SampleViewer`, `WaveformDisplay`, `EditorControls` |
| Effects | `EffectsRack`, `PluginSlot`, `PluginControls` |
| UI Primitives | `RangeSlider`, `RotaryKnob` |
| File Browser | `FileBrowser` |
| Layout | `+layout.svelte`, `+page.svelte`, `loopstation/+page.svelte` |

### New Audio Infrastructure

- **AudioScheduler** (`clock.ts`): beat-accurate clock with lookahead scheduling for loop station
- **Metronome** (`metronome.ts`): oscillator-based click integrated with scheduler
- **AudioSinkNode** (`sink.node.ts`): mixer channel strip with gain, stereo pan, mono summing
- **AudioBaseNode** (`node.ts`): abstract base with safe `connect()`/`disconnect()`
- **Plugin param system** (`params.ts`): formal `AudioNodeParam` interface driving auto-generated UI
- **New audio assets**: `Vox_1.ogg`, `Vox_2.ogg` vocal samples
- **Impulse responses**: Church Schellingwoude, Claustrofobia v1.1, Factory Hall IRs for reverb plugin

### Deleted from `main`

| Feature | File(s) | Replacement |
|---|---|---|
| Canvas node-graph editor | `graph.ts` (554 lines) | Linear per-track effects rack |
| Imperative UI builder | `uibuilder.ts` (208 lines) | Auto-generated Svelte components from params |
| SCSS theming system | 6 SCSS files | CSS custom properties in `+layout.svelte` |
| Volume meter | `meter.ts` (86 lines) | None |
| Floating windows | `FloatingWindowType` system | Collapsible docked panels |
| Client-side file upload | `utils/file.ts` | Build-time static discovery |
| Proxy-based state | `state.ts` (57 lines) | Svelte 5 rune classes |
| Old audio nodes/plugins | `src/nodes/`, `src/plugins/` | `src/lib/audio/nodes/`, `src/lib/audio/plugins/` |
| ASD analysis files | 5 `.wav.asd` files | Cleanup |
| Old entry points | `index.html`, `loopstation.html` | SvelteKit `app.html` |
