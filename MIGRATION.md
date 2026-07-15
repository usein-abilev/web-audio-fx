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
