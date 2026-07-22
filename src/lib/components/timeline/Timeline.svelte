<script lang="ts">
    import { timeline, MASTER_TRACK_ID, type TimelineClip as ClipData } from "$lib/stores/timeline.svelte";
    import { ui } from "$lib/stores/ui.svelte";
    import { audio } from "$lib/stores/audio.svelte";
    import { samples } from "$lib/stores/samples.svelte";
    import { bufferStore } from "$lib/stores/buffer.svelte";
    import TimelineGrid from "./TimelineGrid.svelte";
    import TimelineClip from "./TimelineClip.svelte";
    import PlaybackCursor from "./PlaybackCursor.svelte";
    import RangeSlider from "$lib/components/ui/RangeSlider.svelte";
    import { onMount } from "svelte";
    import RotaryKnob from "../ui/RotaryKnob.svelte";
    import { placeTimelineClip, placeTimelineClipDerivedFrom, reverseTimelineClip } from "$lib/actions/app.actions";

    function clampDeltaWithBounds(baseValues: number[], rawDelta: number, minBound: number, maxBound: number): number {
        let min = Infinity;
        let max = -Infinity;
        for (const v of baseValues) {
            const proposed = v + rawDelta;
            if (proposed < min) min = proposed;
            if (proposed > max) max = proposed;
        }
        let delta = rawDelta;
        if (min < minBound) delta -= min - minBound;
        else if (max > maxBound) delta -= max - maxBound;
        return delta;
    }

    let gridSvgEl = $state<SVGSVGElement>();
    let wrapperEl = $state<HTMLDivElement>();

    const totalBars = 32;
    const gridWidth = $derived(totalBars * timeline.barWidth);
    const totalHeight = $derived(timeline.totalHeight);

    type InteractionType = "drag" | "resize" | "volume" | "header" | "marquee" | null;
    let activeInteraction = $state<InteractionType>(null);

    let mouseStartX = $state(0);
    let mouseStartY = $state(0);

    type ClipSnapshot = Partial<ClipData> & { bufferDuration?: number };
    let clipSnapshots = $state<Map<number, ClipSnapshot>>(new Map());

    let resizeEdge = $state<"left" | "right">("right");
    let marqueeStartX = $state(0);
    let marqueeStartY = $state(0);
    let marqueeCurrentX = $state(0);
    let marqueeCurrentY = $state(0);

    let isDragOver = $state(false);
    let shiftHeld = false;
    let ctrlHeld = false;

    onMount(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Shift") shiftHeld = true;
            if (e.key === "Control" || e.key === "Meta") ctrlHeld = true;
            if (e.code === "Space") {
                e.preventDefault();
                if (audio.isPlaying) {
                    audio.pause();
                } else {
                    audio.resume();
                }
            }

            const isArrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code);

            if (ui.selectedClipIds.size > 0 && isArrow && shiftHeld) {
                e.preventDefault();

                const stepSize = timeline.gridStepValue;
                const trackCount = timeline.tracks.length;
                const dir = e.code === "ArrowLeft" || e.code === "ArrowUp" ? -1 : 1;

                if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
                    const selected = [...ui.selectedClipIds]
                        .map((id) => ({ id, clip: timeline.getClip(id) }))
                        .filter((e) => e.clip !== undefined) as { id: number; clip: (typeof timeline.clips)[number] }[];

                    let clampOffset = 0;
                    if (dir === -1) {
                        let minNewBeats = Infinity;
                        for (const { clip } of selected) {
                            const currentBeats = timeline.musicalTimeToBeats(clip.time);
                            const newBeats = currentBeats - stepSize;
                            if (newBeats < minNewBeats) minNewBeats = newBeats;
                        }
                        if (minNewBeats < 0) clampOffset = -minNewBeats;
                    }

                    for (const { id, clip } of selected) {
                        const currentBeats = timeline.musicalTimeToBeats(clip.time);
                        const newBeats = currentBeats + dir * stepSize + clampOffset;
                        timeline.moveClip(id, timeline.beatsToMusical(newBeats), clip.trackId);
                    }
                } else {
                    const selected = [...ui.selectedClipIds]
                        .map((id) => ({ id, clip: timeline.getClip(id) }))
                        .filter((e) => e.clip !== undefined) as { id: number; clip: (typeof timeline.clips)[number] }[];

                    const trackIds = selected.map(({ clip }) => clip.trackId);
                    const effectiveDelta = clampDeltaWithBounds(trackIds, dir, 0, trackCount - 1);

                    for (const { id, clip } of selected) {
                        timeline.moveClip(id, { ...clip.time }, clip.trackId + effectiveDelta);
                    }
                }
            }

            if ((e.code === "ArrowLeft" || e.code === "ArrowRight") && !shiftHeld) {
                e.preventDefault();
                const dir = e.code === "ArrowLeft" ? -1 : 1;
                audio.playbackPosition = Math.max(0, audio.playbackPosition + dir * timeline.gridStepValue);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Shift") shiftHeld = false;
            if (e.key === "Control" || e.key === "Meta") ctrlHeld = false;
        };
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("keyup", handleKeyUp);
        document.addEventListener("mousemove", handleDocumentMouseMove);
        document.addEventListener("mouseup", handleDocumentMouseUp);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("keyup", handleKeyUp);
            document.removeEventListener("mousemove", handleDocumentMouseMove);
            document.removeEventListener("mouseup", handleDocumentMouseUp);
        };
    });

    $effect(() => {
        const el = wrapperEl;
        if (!el) return;
        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => el.removeEventListener("wheel", handleWheel);
    });

    function handleDocumentMouseMove(e: MouseEvent) {
        switch (activeInteraction) {
            case "drag":
                handleDragMove(e);
                break;
            case "resize":
                handleClipResizeMove(e);
                break;
            case "volume":
                handleClipVolumeMove(e);
                break;
            case "header":
                handleHeaderMouseMove(e);
                break;
            case "marquee":
                handleMarqueeMove(e);
                break;
        }
    }

    let isLeftMousePressed = $state(true);

    function handleDocumentMouseUp() {
        activeInteraction = null;
        isLeftMousePressed = false;
    }

    function screenToSvg(clientX: number, clientY: number): { x: number; y: number } {
        if (!gridSvgEl) return { x: 0, y: 0 };
        const rect = gridSvgEl.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    }

    function startDrag(clipId: number, mouseSvgX: number, mouseSvgY: number) {
        const clip = timeline.getClip(clipId);
        if (!clip) return;

        if (!ui.isClipSelected(clipId)) {
            ui.selectClip(clipId, false);
        }

        mouseStartX = mouseSvgX;
        mouseStartY = mouseSvgY;

        clipSnapshots.clear();
        for (const id of ui.selectedClipIds) {
            const c = timeline.getClip(id);
            if (c) {
                clipSnapshots.set(id, { time: { ...c.time }, trackId: c.trackId });
            }
        }

        activeInteraction = "drag";
    }

    function handleDragMove(e: MouseEvent) {
        const { x: currentX, y: currentY } = screenToSvg(e.clientX, e.clientY);
        const deltaX = currentX - mouseStartX;

        const startTrackId = timeline.yToTrackId(mouseStartY);
        const currentTrackId = timeline.yToTrackId(currentY);
        if (currentTrackId === MASTER_TRACK_ID) return;

        const deltaTrack = currentTrackId - startTrackId;
        const isMulti = ui.selectedClipIds.size > 1;
        const trackCount = timeline.tracks.length;

        let effectiveDeltaTrack = deltaTrack;
        if (isMulti) {
            const origTracks = [...ui.selectedClipIds]
                .map((id) => clipSnapshots.get(id)?.trackId)
                .filter((t): t is number => t !== undefined);
            effectiveDeltaTrack = clampDeltaWithBounds(origTracks, deltaTrack, 0, trackCount - 1);
        }

        let effectiveDelta = deltaX;
        if (isMulti) {
            const origXs = [...ui.selectedClipIds]
                .map((id) => {
                    const t = clipSnapshots.get(id)?.time;
                    return t && timeline.musicalTimeToX(t);
                })
                .filter((x) => x !== undefined);
            effectiveDelta = clampDeltaWithBounds(origXs, deltaX, 0, Infinity);
        }

        for (const id of ui.selectedClipIds) {
            const snap = clipSnapshots.get(id);
            if (!snap?.time || snap.trackId === undefined) continue;

            const origX = timeline.musicalTimeToX(snap.time);
            const newX = Math.max(0, origX + effectiveDelta);
            const newTime = shiftHeld ? timeline.xToMusicalTimeRaw(newX) : timeline.xToMusicalTime(newX);

            const targetTrack = isMulti
                ? Math.min(trackCount - 1, Math.max(0, snap.trackId + effectiveDeltaTrack))
                : currentTrackId;

            timeline.moveClip(id, newTime, targetTrack);
        }
    }

    function handleClipResizeStart(clipId: number, edge: "left" | "right", e: MouseEvent) {
        if (!ui.isClipSelected(clipId)) {
            ui.selectClip(clipId);
        }

        resizeEdge = edge;
        mouseStartX = e.clientX;

        clipSnapshots.clear();
        for (const id of ui.selectedClipIds) {
            const clip = timeline.getClip(id);
            if (!clip) continue;
            const buffer = bufferStore.getBuffer(clip.bufferId);
            clipSnapshots.set(id, {
                time: { ...clip.time },
                duration: { ...clip.duration },
                offset: { ...clip.offset },
                bufferDuration: buffer ? buffer.duration : 1,
            });
        }

        activeInteraction = "resize";
    }

    function handleClipResizeMove(e: MouseEvent) {
        const { x: currentX } = screenToSvg(e.clientX, e.clientY);
        const { x: startSvgX } = screenToSvg(mouseStartX, 0);
        const svgDeltaX = currentX - startSvgX;

        const deltaBeatsRaw = svgDeltaX / timeline.beatWidth;
        const shiftKey = e.shiftKey;
        const gridStepBeats = timeline.stepWidth / timeline.beatWidth;
        const gridStepValue = timeline.gridStepValue;
        const minDuration = shiftKey ? 0.01 : gridStepValue;
        const bpm = timeline.bpm;

        let effectiveDelta = shiftKey ? deltaBeatsRaw : Math.round(deltaBeatsRaw / gridStepBeats) * gridStepBeats;

        if (resizeEdge === "right") {
            for (const snap of clipSnapshots.values()) {
                const oldDurationBeats = timeline.musicalTimeToBeats(snap.duration!);
                const oldOffsetBeats = timeline.musicalTimeToBeats(snap.offset!);
                const bufferDurationBeats = snap.bufferDuration! * (bpm / 60);
                const maxDelta = bufferDurationBeats - oldOffsetBeats - oldDurationBeats;
                const minDelta = minDuration - oldDurationBeats;
                effectiveDelta = Math.min(Math.max(effectiveDelta, minDelta), maxDelta);
            }

            for (const [id, snap] of clipSnapshots) {
                const oldDurationBeats = timeline.musicalTimeToBeats(snap.duration!);
                const newDurationBeats = Math.max(minDuration, oldDurationBeats + effectiveDelta);
                timeline.resizeClip(id, { duration: timeline.beatsToMusical(newDurationBeats) });
            }
        } else {
            for (const snap of clipSnapshots.values()) {
                const oldOffsetBeats = timeline.musicalTimeToBeats(snap.offset!);
                const bufferDurationBeats = snap.bufferDuration! * (bpm / 60);
                const maxDelta = bufferDurationBeats - gridStepValue - oldOffsetBeats;
                const minDelta = -oldOffsetBeats;
                effectiveDelta = Math.min(Math.max(effectiveDelta, minDelta), maxDelta);
            }

            for (const [id, snap] of clipSnapshots) {
                const oldOffsetBeats = timeline.musicalTimeToBeats(snap.offset!);
                const oldDurationBeats = timeline.musicalTimeToBeats(snap.duration!);
                const oldTimeBeats = timeline.musicalTimeToBeats(snap.time!);
                const newOffsetBeats = oldOffsetBeats + effectiveDelta;
                const newDurationBeats = Math.max(minDuration, oldDurationBeats - effectiveDelta);
                const newTimeBeats = Math.max(0, oldTimeBeats + effectiveDelta);
                timeline.resizeClip(id, {
                    offset: timeline.beatsToMusical(newOffsetBeats),
                    duration: timeline.beatsToMusical(newDurationBeats),
                    time: timeline.beatsToMusical(newTimeBeats),
                });
            }
        }
    }

    function handleClipVolumeStart(clipId: number, e: MouseEvent) {
        if (!ui.isClipSelected(clipId)) {
            ui.selectClip(clipId);
        }

        mouseStartY = e.clientY;

        clipSnapshots.clear();
        for (const id of ui.selectedClipIds) {
            const clip = timeline.getClip(id);
            if (clip) {
                clipSnapshots.set(id, { params: { volume: clip.params.volume } });
            }
        }

        activeInteraction = "volume";
    }

    function handleClipVolumeMove(e: MouseEvent) {
        const waveHeight = timeline.trackHeight - 24;
        const deltaY = mouseStartY - e.clientY;
        const delta = deltaY / waveHeight;

        for (const [id, snap] of clipSnapshots) {
            timeline.setClipVolume(id, Math.max(0, Math.min(1, snap.params!.volume + delta)));
        }
    }

    function handleHeaderMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        setPlayheadFromMouse(e);
        activeInteraction = "header";
    }

    function handleHeaderMouseMove(e: MouseEvent) {
        setPlayheadFromMouse(e);
    }

    function setPlayheadFromMouse(e: MouseEvent) {
        const headerSvg = document.querySelector(".grid-header-svg") as SVGSVGElement | null;
        if (!headerSvg) return;
        const rect = headerSvg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const rawBeats = x / timeline.beatWidth;
        const beats = Math.max(0, Math.floor(rawBeats / timeline.gridStepValue) * timeline.gridStepValue);
        audio.playbackPosition = beats;
    }

    async function handleGridMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        isLeftMousePressed = true;

        if (audio.isLoadingSample) return;

        const { x, y } = screenToSvg(e.clientX, e.clientY);
        if (x < 0) return;

        if (ctrlHeld) {
            marqueeStartX = x;
            marqueeStartY = y;
            marqueeCurrentX = x;
            marqueeCurrentY = y;
            activeInteraction = "marquee";
            return;
        }

        const time = timeline.xToMusicalTime(x);
        const trackId = timeline.yToTrackId(y);

        if (trackId === MASTER_TRACK_ID) return;

        const selectedClip = ui.lastSelectedClipId && timeline.getClip(ui.lastSelectedClipId);
        let clipId: number | null = null;

        if (selectedClip) {
            clipId = await placeTimelineClipDerivedFrom(selectedClip.id, time, trackId);
        } else if (ui.selectedSampleId) {
            clipId = await placeTimelineClip(ui.selectedSampleId, time, trackId);
        }

        if (clipId != null) {
            ui.selectClip(clipId, false);
            if (isLeftMousePressed) {
                startDrag(clipId, x, y);
            }
        }
    }

    async function handleFileDrop(e: DragEvent) {
        e.preventDefault();
        isDragOver = false;

        const { x, y } = screenToSvg(e.clientX, e.clientY);
        if (x < 0) return;

        const trackId = timeline.yToTrackId(y);
        if (trackId === MASTER_TRACK_ID) return;

        const time = timeline.xToMusicalTime(x);
        const createdClipIds: number[] = [];

        const sampleId = e.dataTransfer?.getData("application/x-sample-id");
        const files = Array.from(e.dataTransfer?.files ?? []);

        if (sampleId) {
            const clipId = await placeTimelineClip(sampleId, time, trackId);
            if (!clipId) return;

            createdClipIds.push(clipId);
        } else {
            if (!files.length) return;

            const uploadedSampleIds = await Promise.all(files.map((file) => samples.uploadFile(file)));
            for (const sampleId of uploadedSampleIds) {
                if (!sampleId) continue;

                const clipId = await placeTimelineClip(sampleId, time, trackId);
                if (!clipId) return;

                createdClipIds.push(clipId);
            }
        }

        if (createdClipIds.length === 1) {
            ui.selectClip(createdClipIds[0]);
        } else if (createdClipIds.length > 1) {
            ui.setSelectedClips(createdClipIds);
        }
    }

    function handleMarqueeMove(e: MouseEvent) {
        const { x, y } = screenToSvg(e.clientX, e.clientY);
        marqueeCurrentX = x;
        marqueeCurrentY = y;

        const left = Math.min(marqueeStartX, marqueeCurrentX);
        const right = Math.max(marqueeStartX, marqueeCurrentX);
        const top = Math.min(marqueeStartY, marqueeCurrentY);
        const bottom = Math.max(marqueeStartY, marqueeCurrentY);

        const selected: number[] = [];
        for (const clip of timeline.clips) {
            const cx = timeline.musicalTimeToX(clip.time);
            const cy = clip.trackId * timeline.trackHeight;
            const cw = timeline.musicalTimeToBeats(clip.duration) * timeline.beatWidth;
            const ch = timeline.trackHeight;

            if (cx < right && cx + cw > left && cy < bottom && cy + ch > top) {
                selected.push(clip.id);
            }
        }
        ui.setSelectedClips(selected);
    }

    function handleClipDragStart(clipId: number, mouseSvgX: number, mouseSvgY: number) {
        if (audio.isLoadingSample) return;
        startDrag(clipId, mouseSvgX, mouseSvgY);
    }

    async function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            e.preventDefault();
            ui.deselectAllClips();
        }

        if (e.key === "s" || e.key === "S") {
            e.preventDefault();
            const splitBeat = audio.playbackPosition;
            const newClipIds: number[] = [];
            for (const clipId of [...ui.selectedClipIds]) {
                const newClip = timeline.splitClip(clipId, splitBeat);
                if (newClip) newClipIds.push(newClip.id);
            }
            if (newClipIds.length > 0) {
                ui.setSelectedClips(newClipIds);
            }
        }

        if (e.key === "r" || e.key === "R") {
            e.preventDefault();
            for (const clipId of [...ui.selectedClipIds]) {
                await reverseTimelineClip(clipId);
            }
        }

        if (e.key === "Delete" || e.key === "Backspace") {
            if (ui.selectedClipIds.size > 0) {
                timeline.removeClips([...ui.selectedClipIds]);
                ui.deselectAllClips();
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
            if (ui.selectedClipIds.size > 0) {
                timeline.copyClips([...ui.selectedClipIds]);
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "v") {
            const pasted = timeline.pasteClips(audio.playbackPosition);
            if (pasted.length > 0) {
                ui.deselectAllClips();
                for (const clip of pasted) {
                    ui.selectClip(clip.id, true);
                }
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "a") {
            e.preventDefault();
            ui.deselectAllClips();
            for (const clip of timeline.clips) {
                ui.selectClip(clip.id, true);
            }
        }
    }

    function handleWheel(e: WheelEvent) {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();

        const scrollContainer = (e.currentTarget as HTMLElement).querySelector(".timeline-scroll");
        if (!scrollContainer) return;
        const containerRect = scrollContainer.getBoundingClientRect();
        const containerX = e.clientX - containerRect.left;

        const oldZoom = timeline.zoom;
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        timeline.setZoom(oldZoom * factor);
        const newZoom = timeline.zoom;

        const scrollLeft = scrollContainer.scrollLeft;
        scrollContainer.scrollLeft = (scrollLeft + containerX) * (newZoom / oldZoom) - containerX;
    }

    function handleGainChange(trackId: number, value: number) {
        audio.updateTrackGain(trackId, value);
    }

    function handlePanChange(trackId: number, value: number) {
        audio.updateTrackPan(trackId, value);
    }
</script>

<div
    class="timeline-wrapper"
    class:drag-over={isDragOver}
    bind:this={wrapperEl}
    onkeydown={handleKeydown}
    tabindex="0"
    role="application"
    ondragover={(e) => {
        e.preventDefault();
        isDragOver = true;
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }}
    ondragleave={() => (isDragOver = false)}
    ondrop={handleFileDrop}
>
    <div class="timeline-scroll">
        <div class="timeline-grid">
            <!-- Corner: sticky top-left -->
            <div class="corner"></div>

            <!-- Grid header: sticky top, scrolls horizontally -->
            <div class="grid-header">
                <svg
                    width={gridWidth}
                    height={timeline.headerHeight}
                    class="grid-header-svg"
                    onmousedown={handleHeaderMouseDown}
                >
                    <!-- Bar background alternation -->
                    {#each Array.from({ length: totalBars }, (_, i) => i) as i (i)}
                        {#if i % 2 === 0}
                            <rect
                                x={i * timeline.barWidth}
                                y={0}
                                width={timeline.barWidth}
                                height={timeline.headerHeight}
                                fill="var(--bg-grid-alt)"
                            />
                        {/if}
                    {/each}

                    <!-- Header background -->
                    <rect
                        x={0}
                        y={0}
                        width={gridWidth}
                        height={timeline.headerHeight}
                        fill="var(--bg-secondary)"
                        opacity="0.5"
                    />

                    <!-- Bar lines + numbers -->
                    {#each Array.from({ length: totalBars + 1 }, (_, i) => i) as i (i)}
                        <line
                            x1={i * timeline.barWidth}
                            y1={0}
                            x2={i * timeline.barWidth}
                            y2={timeline.headerHeight}
                            stroke="var(--grid-bar-color, #0f0f0f)"
                            stroke-width="1"
                        />
                        {#if i < totalBars}
                            <text
                                x={i * timeline.barWidth + 4}
                                y={timeline.headerHeight - 6}
                                fill="var(--text-secondary)"
                                font-size="10"
                                font-family="var(--font-family)"
                            >
                                {i + 1}
                            </text>
                        {/if}
                    {/each}

                    <!-- Beat lines + numbers -->
                    {#each Array.from({ length: totalBars }, (_, bar) => bar) as bar (bar)}
                        {#each Array.from({ length: 3 }, (_, beat) => beat + 1) as beat (beat)}
                            {@const x = bar * timeline.barWidth + beat * timeline.beatWidth}
                            <line
                                x1={x}
                                y1={timeline.headerHeight - 4}
                                x2={x}
                                y2={timeline.headerHeight}
                                stroke="var(--grid-color, #0b0b0d)"
                                stroke-width="0.5"
                            />
                            {#if timeline.beatWidth > 25}
                                <text
                                    x={x + 3}
                                    y={timeline.headerHeight - 6}
                                    fill="var(--text-tertiary, #666)"
                                    font-size="8"
                                    font-family="var(--font-family)"
                                >
                                    {beat + 1}
                                </text>
                            {/if}
                        {/each}
                    {/each}
                </svg>
            </div>

            <!-- Track pane: sticky left, scrolls vertically -->
            <div class="track-pane">
                {#each timeline.tracks as track}
                    <div
                        class="track-row"
                        class:selected={ui.selectedTrackId === track.id}
                        style="border-left: 3px solid {track.color}"
                        role="button"
                        tabindex="-1"
                        onkeydown={() => {}}
                        onclick={() => {
                            ui.selectedTrackId = track.id;
                        }}
                    >
                        <div class="track-row-header">
                            <span class="track-name" class:selected={ui.selectedTrackId === track.id}>
                                {track.name}
                            </span>
                            <div class="ms-buttons">
                                <button
                                    class="ms-btn mute"
                                    class:active={track.muted}
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        audio.toggleMute(track.id);
                                    }}>M</button
                                >
                                <button
                                    class="ms-btn solo"
                                    class:active={track.solo}
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        audio.toggleSolo(track.id);
                                    }}>S</button
                                >
                            </div>
                        </div>
                        <div class="track-controls">
                            <RangeSlider
                                value={track.gain}
                                defaultValue={1}
                                min={0}
                                max={1}
                                formatter={(v) => `${Math.round(v * 100)} %`}
                                onchange={(v) => handleGainChange(track.id, v)}
                            />
                            <RotaryKnob
                                label=""
                                value={(track.pan + 1) / 2}
                                min={0}
                                max={1}
                                formatter={() => ""}
                                onchange={(v) => handlePanChange(track.id, v * 2 - 1)}
                            />
                        </div>
                    </div>
                {/each}
                <div class="master-separator"></div>
                <div
                    class="track-row"
                    class:selected={ui.selectedTrackId === MASTER_TRACK_ID}
                    role="button"
                    tabindex="-1"
                    onkeydown={() => {}}
                    onclick={() => {
                        ui.selectedTrackId = MASTER_TRACK_ID;
                    }}
                >
                    <div class="track-row-header">
                        <span class="track-name" class:selected={ui.selectedTrackId === MASTER_TRACK_ID}> Master </span>
                    </div>
                    <div class="track-controls">
                        <RangeSlider
                            value={timeline.masterTrack.gain}
                            defaultValue={1}
                            label="Vol"
                            min={0}
                            max={1}
                            formatter={(v) => `${Math.round(v * 100)}%`}
                            onchange={(v) => handleGainChange(MASTER_TRACK_ID, v)}
                        />
                        <RotaryKnob
                            value={(timeline.masterTrack.pan + 1) / 2}
                            label="Pan"
                            min={0}
                            max={1}
                            formatter={(v) => {
                                const pan = v * 2 - 1;
                                if (Math.abs(pan) < 0.05) return "C";
                                return pan < 0 ? `L${Math.round(Math.abs(pan) * 100)}` : `R${Math.round(pan * 100)}`;
                            }}
                            onchange={(v) => handlePanChange(MASTER_TRACK_ID, v * 2 - 1)}
                        />
                    </div>
                </div>
            </div>

            <!-- Grid content: defines the scroll area size -->
            <div class="grid-content">
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <svg
                    bind:this={gridSvgEl}
                    width={gridWidth}
                    height={totalHeight}
                    class="grid-svg"
                    class:dragging={activeInteraction === "drag"}
                    class:loading={audio.isLoadingSample}
                    onmousedown={handleGridMouseDown}
                    oncontextmenu={(e) => {
                        e.preventDefault();
                        ui.deselectAllClips();
                    }}
                >
                    <TimelineGrid width={gridWidth} height={totalHeight} />
                    {#each timeline.clips as clip (clip.id)}
                        {@const track = timeline.getTrackById(clip.trackId)}
                        <TimelineClip
                            {clip}
                            color={track?.color}
                            onDragStart={handleClipDragStart}
                            onResizeStart={handleClipResizeStart}
                            onVolumeStart={handleClipVolumeStart}
                        />
                    {/each}
                    <PlaybackCursor height={totalHeight} />
                    {#if activeInteraction === "marquee"}
                        <rect
                            x={Math.min(marqueeStartX, marqueeCurrentX)}
                            y={Math.min(marqueeStartY, marqueeCurrentY)}
                            width={Math.abs(marqueeCurrentX - marqueeStartX)}
                            height={Math.abs(marqueeCurrentY - marqueeStartY)}
                            fill="var(--accent-primary)"
                            fill-opacity="0.15"
                            stroke="var(--accent-primary)"
                            stroke-width="1"
                            stroke-opacity="0.5"
                            pointer-events="none"
                        />
                    {/if}
                </svg>
            </div>
        </div>
    </div>
</div>

<style>
    .timeline-wrapper {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--bg-main);
        outline: none;
        user-select: none;
    }

    .timeline-wrapper.drag-over {
        outline: 2px dashed var(--accent-primary);
        outline-offset: -2px;
    }

    .timeline-scroll {
        flex: 1;
        overflow: auto;
    }

    .timeline-grid {
        display: grid;
        grid-template-columns: 200px auto;
        grid-template-rows: 24px auto;
        width: min-content;
    }

    .corner {
        position: sticky;
        top: 0;
        left: 0;
        z-index: 3;
        background: var(--bg-surface);
        border-right: 1px solid var(--border-color);
        border-bottom: 1px solid var(--border-color);
    }

    .grid-header {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--bg-surface);
        border-bottom: 1px solid var(--border-color);
    }

    .grid-header-svg {
        display: block;
    }

    .track-pane {
        position: sticky;
        left: 0;
        z-index: 2;
        background: var(--bg-surface);
        border-right: 1px solid var(--border-color);
        align-self: start;
        box-shadow: 0 0 20px rgb(0 0 0 / 45%);
    }

    .track-row {
        height: var(--track-height, 82px);
        position: relative;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 10px;
        padding: 8px;
        box-sizing: border-box;
        border-bottom: 1px solid var(--grid-color);

        .track-controls {
            display: flex;
            :global(input.slider-input) {
                height: 8px;
                border-radius: 20px;
            }
        }
    }
    .track-row-header {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .track-name {
            font-size: 11px;
            color: var(--text-secondary);
            font-weight: 400;
            line-height: 1;
            pointer-events: none;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .track-name.selected {
            color: var(--accent-primary);
            font-weight: 600;
        }

        .ms-buttons {
            display: flex;
            gap: 2px;
            align-items: flex-start;
            justify-content: flex-end;
        }

        .ms-btn {
            width: 18px;
            height: 16px;
            font-size: 9px;
            line-height: 14px;
            font-weight: 700;
            border: 1px solid var(--border-color);
            border-radius: 2px;
            background: var(--bg-main);
            color: var(--text-secondary);
            cursor: pointer;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .ms-btn.mute.active {
            background: var(--accent-red);
            color: white;
            border-color: var(--accent-red);
        }

        .ms-btn.solo.active {
            background: var(--orange-color);
            color: white;
            border-color: var(--orange-color);
        }

        .ms-btn:hover {
            opacity: 0.8;
        }
    }

    .track-row.selected {
        background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
    }

    .master-separator {
        height: 2px;
        background: var(--border-color);
        flex-shrink: 0;
    }

    .grid-svg {
        display: block;
        cursor: crosshair;
    }

    .grid-svg.dragging {
        cursor: grabbing;
    }

    .grid-svg.loading {
        cursor: wait;
        pointer-events: none;
    }
</style>
