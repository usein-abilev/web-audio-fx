<script lang="ts">
    import { timeline, MASTER_TRACK_ID, type MusicalTime } from "$lib/stores/timeline.svelte";
    import { audio } from "$lib/stores/audio.svelte";
    import { samples } from "$lib/stores/samples.svelte";
    import { ui } from "$lib/stores/ui.svelte";
    import TimelineGrid from "./TimelineGrid.svelte";
    import TimelineClip from "./TimelineClip.svelte";
    import PlaybackCursor from "./PlaybackCursor.svelte";
    import RangeSlider from "$lib/components/ui/RangeSlider.svelte";
    import { onMount } from "svelte";
    import RotaryKnob from "../ui/RotaryKnob.svelte";

    let {
        onTimelineClick,
    }: {
        onTimelineClick?: (time: MusicalTime, trackId: number) => Promise<number | null>;
    } = $props();

    let gridSvgEl = $state<SVGSVGElement>();
    let wrapperEl = $state<HTMLDivElement>();

    const totalBars = 32;
    const gridWidth = $derived(totalBars * timeline.barWidth);
    const totalHeight = $derived(timeline.totalHeight);

    let isDragging = $state(false);
    let dragStartMouseX = $state(0);
    let dragStartMouseY = $state(0);
    let dragStartClipPositions = $state<Map<number, MusicalTime>>(new Map());
    let dragStartClipTracks = $state<Map<number, number>>(new Map());
    let shiftHeld = false;
    let ctrlHeld = false;

    let isDragOver = $state(false);

    let isMarquee = $state(false);
    let marqueeStartX = $state(0);
    let marqueeStartY = $state(0);
    let marqueeCurrentX = $state(0);
    let marqueeCurrentY = $state(0);

    let isHeaderScrubbing = $state(false);

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
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Shift") shiftHeld = false;
            if (e.key === "Control" || e.key === "Meta") ctrlHeld = false;
        };
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("keyup", handleKeyUp);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("keyup", handleKeyUp);
        };
    });

    $effect(() => {
        const el = wrapperEl;
        if (!el) return;
        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => el.removeEventListener("wheel", handleWheel);
    });

    function screenToSvg(clientX: number, clientY: number): { x: number; y: number } {
        if (!gridSvgEl) return { x: 0, y: 0 };
        const rect = gridSvgEl.getBoundingClientRect();
        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    }

    function startDrag(clipId: number, mouseSvgX: number, mouseSvgY: number) {
        const clip = timeline.clips.find((c) => c.id === clipId);
        if (!clip) return;

        if (!ui.isClipSelected(clipId)) {
            ui.selectClip(clipId, false);
            ui.selectedSampleId = clip.sampleId;
        }

        isDragging = true;
        dragStartMouseX = mouseSvgX;
        dragStartMouseY = mouseSvgY;

        const positions = new Map<number, MusicalTime>();
        const tracks = new Map<number, number>();
        for (const id of ui.selectedClipIds) {
            const c = timeline.clips.find((cl) => cl.id === id);
            if (c) {
                positions.set(id, { ...c.time });
                tracks.set(id, c.trackId);
            }
        }
        dragStartClipPositions = positions;
        dragStartClipTracks = tracks;

        document.addEventListener("mousemove", handleDragMove);
        document.addEventListener("mouseup", handleDragEnd);
    }

    function handleDragMove(e: MouseEvent) {
        if (!isDragging) return;

        const { x: currentX, y: currentY } = screenToSvg(e.clientX, e.clientY);
        const deltaX = currentX - dragStartMouseX;

        const startTrackId = timeline.yToTrackId(dragStartMouseY);
        const currentTrackId = timeline.yToTrackId(currentY);
        if (currentTrackId === MASTER_TRACK_ID) return;

        const deltaTrack = currentTrackId - startTrackId;
        const isMulti = ui.selectedClipIds.size > 1;
        const trackCount = timeline.tracks.length;

        let effectiveDeltaTrack = deltaTrack;
        if (isMulti) {
            let minProposed = Infinity;
            let maxProposed = -Infinity;
            for (const id of ui.selectedClipIds) {
                const origTrack = dragStartClipTracks.get(id);
                if (origTrack === undefined) continue;
                const proposed = origTrack + deltaTrack;
                if (proposed < minProposed) minProposed = proposed;
                if (proposed > maxProposed) maxProposed = proposed;
            }
            if (minProposed < 0) {
                effectiveDeltaTrack = deltaTrack - minProposed;
            } else if (maxProposed > trackCount - 1) {
                effectiveDeltaTrack = deltaTrack - (maxProposed - (trackCount - 1));
            }
        }

        let effectiveDelta = deltaX;
        if (isMulti) {
            let minOrigX = Infinity;
            for (const id of ui.selectedClipIds) {
                const t = dragStartClipPositions.get(id);
                if (t !== undefined) {
                    const x = timeline.musicalTimeToX(t);
                    if (x < minOrigX) minOrigX = x;
                }
            }
            if (minOrigX !== Infinity) {
                const rawMinX = minOrigX + deltaX;
                if (rawMinX < 0) effectiveDelta = deltaX - rawMinX;
            }
        }

        for (const id of ui.selectedClipIds) {
            const origTime = dragStartClipPositions.get(id);
            const origTrack = dragStartClipTracks.get(id);
            if (origTime === undefined || origTrack === undefined) continue;

            const origX = timeline.musicalTimeToX(origTime);
            const newX = Math.max(0, origX + effectiveDelta);
            const newTime = shiftHeld ? timeline.xToMusicalTimeRaw(newX) : timeline.xToMusicalTime(newX);

            const targetTrack = isMulti
                ? Math.min(trackCount - 1, Math.max(0, origTrack + effectiveDeltaTrack))
                : currentTrackId;

            timeline.moveClip(id, newTime, targetTrack);
        }
    }

    function handleDragEnd() {
        isDragging = false;
        document.removeEventListener("mousemove", handleDragMove);
        document.removeEventListener("mouseup", handleDragEnd);
    }

    function handleHeaderMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        isHeaderScrubbing = true;
        setPlayheadFromMouse(e);
        document.addEventListener("mousemove", handleHeaderMouseMove);
        document.addEventListener("mouseup", handleHeaderMouseUp);
    }

    function handleHeaderMouseMove(e: MouseEvent) {
        if (!isHeaderScrubbing) return;
        setPlayheadFromMouse(e);
    }

    function handleHeaderMouseUp() {
        isHeaderScrubbing = false;
        document.removeEventListener("mousemove", handleHeaderMouseMove);
        document.removeEventListener("mouseup", handleHeaderMouseUp);
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

    function handleGridMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        if (audio.isLoadingSample) return;

        const { x, y } = screenToSvg(e.clientX, e.clientY);
        if (x < 0) return;

        if (ctrlHeld) {
            isMarquee = true;
            marqueeStartX = x;
            marqueeStartY = y;
            marqueeCurrentX = x;
            marqueeCurrentY = y;
            document.addEventListener("mousemove", handleMarqueeMove);
            document.addEventListener("mouseup", handleMarqueeEnd);
            return;
        }

        const time = timeline.xToMusicalTime(x);
        const trackId = timeline.yToTrackId(y);

        // ignore clicking on master track
        if (trackId === MASTER_TRACK_ID) return;

        if (ui.selectedSampleId !== null) {
            onTimelineClick?.(time, trackId).then((clipId) => {
                if (clipId != null) {
                    ui.selectClip(clipId, false);
                    startDrag(clipId, x, y);
                }
            });
        } else {
            ui.deselectAllClips();
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

        if (sampleId) {
            const buffer = await samples.getBuffer(sampleId);
            if (!buffer) return;

            const sampleName = samples.getSampleName(sampleId) ?? "Sample";
            const durationBeats = buffer.duration * (timeline.bpm / 60);
            const clip = timeline.addClip(sampleId, sampleName, trackId, time, durationBeats, 0);
            createdClipIds.push(clip.id);
        } else {
            const files = Array.from(e.dataTransfer?.files ?? []);
            if (!files.length) return;

            for (const file of files) {
                const uploadedId = await samples.uploadFile(file);
                if (!uploadedId) continue;

                const buffer = await samples.getBuffer(uploadedId);
                if (!buffer) continue;

                const sampleName = samples.getSampleName(uploadedId) ?? file.name;
                const durationBeats = buffer.duration * (timeline.bpm / 60);
                const clip = timeline.addClip(uploadedId, sampleName, trackId, time, durationBeats, 0);
                createdClipIds.push(clip.id);
            }
        }

        if (createdClipIds.length === 1) {
            ui.selectClip(createdClipIds[0]);
        } else if (createdClipIds.length > 1) {
            ui.setSelectedClips(createdClipIds);
        }
    }

    function handleMarqueeMove(e: MouseEvent) {
        if (!isMarquee) return;
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
            const cw = clip.duration.bar * timeline.barWidth + clip.duration.beat * timeline.beatWidth;
            const ch = timeline.trackHeight;

            if (cx < right && cx + cw > left && cy < bottom && cy + ch > top) {
                selected.push(clip.id);
            }
        }
        ui.setSelectedClips(selected);
    }

    function handleMarqueeEnd() {
        isMarquee = false;
        document.removeEventListener("mousemove", handleMarqueeMove);
        document.removeEventListener("mouseup", handleMarqueeEnd);
    }

    function handleClipDragStart(clipId: number, mouseSvgX: number, mouseSvgY: number) {
        if (audio.isLoadingSample) return;
        startDrag(clipId, mouseSvgX, mouseSvgY);
    }

    function handleKeydown(e: KeyboardEvent) {
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
            const pasted = timeline.pasteClips();
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
                {#each timeline.tracks as track, i}
                    <div
                        class="track-row"
                        class:selected={ui.selectedTrackId === track.id}
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
                            <!--     <RangeSlider -->
                            <!--         value={(track.pan + 1) / 2} -->
                            <!--         min={0} -->
                            <!--         max={1} -->
                            <!--         formatter={(v) => { -->
                            <!--             const pan = v * 2 - 1; -->
                            <!--             if (Math.abs(pan) < 0.05) return "C"; -->
                            <!--             return pan < 0 -->
                            <!--                 ? `L${Math.round(Math.abs(pan) * 100)}` -->
                            <!--                 : `R${Math.round(pan * 100)}`; -->
                            <!--         }} -->
                            <!--         onchange={(v) => handlePanChange(track.id, v * 2 - 1)} -->
                            <!--     /> -->
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
                    class:dragging={isDragging}
                    class:loading={audio.isLoadingSample}
                    onmousedown={handleGridMouseDown}
                    oncontextmenu={(e) => {
                        e.preventDefault();
                        ui.deselectAllClips();
                    }}
                >
                    <TimelineGrid width={gridWidth} height={totalHeight} />
                    {#each timeline.clips as clip (clip.id)}
                        <TimelineClip {clip} onDragStart={handleClipDragStart} />
                    {/each}
                    <PlaybackCursor height={totalHeight} />
                    {#if isMarquee}
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
            background: var(--error-color);
            color: white;
            border-color: var(--error-color);
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
