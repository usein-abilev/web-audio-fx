<script lang="ts">
    import { timeline, MASTER_TRACK_ID, type MusicalTime } from "$lib/stores/timeline.svelte";
    import { ui } from "$lib/stores/ui.svelte";
    import TimelineGrid from "./TimelineGrid.svelte";
    import TimelineClip from "./TimelineClip.svelte";
    import PlaybackCursor from "./PlaybackCursor.svelte";
    import RangeSlider from "$lib/components/ui/RangeSlider.svelte";

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
    const masterY = $derived(timeline.tracks.length * timeline.trackHeight);

    let isDragging = $state(false);
    let dragStartMouseX = $state(0);
    let dragStartMouseY = $state(0);
    let dragStartClipPositions = $state<Map<number, MusicalTime>>(new Map());
    let dragStartClipTracks = $state<Map<number, number>>(new Map());
    let shiftHeld = false;
    let ctrlHeld = false;

    let isMarquee = $state(false);
    let marqueeStartX = $state(0);
    let marqueeStartY = $state(0);
    let marqueeCurrentX = $state(0);
    let marqueeCurrentY = $state(0);

    $effect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Shift") shiftHeld = true;
            if (e.key === "Control" || e.key === "Meta") ctrlHeld = true;
            if (e.code === "Space") {
                timeline.stop();
                timeline.play();
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

    let isScrubbing = $state(false);

    function handleHeaderMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        isScrubbing = true;
        setPlayheadFromMouse(e);
        document.addEventListener("mousemove", handleHeaderMouseMove);
        document.addEventListener("mouseup", handleHeaderMouseUp);
    }

    function handleHeaderMouseMove(e: MouseEvent) {
        if (!isScrubbing) return;
        setPlayheadFromMouse(e);
    }

    function handleHeaderMouseUp() {
        isScrubbing = false;
        document.removeEventListener("mousemove", handleHeaderMouseMove);
        document.removeEventListener("mouseup", handleHeaderMouseUp);
    }

    function setPlayheadFromMouse(e: MouseEvent) {
        const headerSvg = document.querySelector(".grid-header-svg") as SVGSVGElement | null;
        if (!headerSvg) return;
        const rect = headerSvg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const beats = Math.max(0, x / timeline.beatWidth);
        timeline.playbackPosition = beats;
    }

    function handleGridMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        if (timeline.isLoadingSample) return;

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
        if (timeline.isLoadingSample) return;
        startDrag(clipId, mouseSvgX, mouseSvgY);
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Delete" || e.key === "Backspace") {
            const ids = [...ui.selectedClipIds];
            if (ids.length > 0) {
                for (const id of ids) {
                    timeline.removeClip(id);
                }
                ui.deselectAllClips();
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
            const ids = [...ui.selectedClipIds];
            if (ids.length > 0) {
                timeline.copyClips(ids);
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

    $effect(() => {
        const el = wrapperEl;
        if (!el) return;
        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => el.removeEventListener("wheel", handleWheel);
    });

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
        timeline.updateTrackGain(trackId, value);
    }

    function handlePanChange(trackId: number, value: number) {
        timeline.updateTrackPan(trackId, value);
    }
</script>

<div class="timeline-wrapper" bind:this={wrapperEl} onkeydown={handleKeydown} tabindex="0" role="application">
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
                        {#each Array.from({ length: 4 }, (_, beat) => beat) as beat (beat)}
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
                <svg width={timeline.trackPaneWidth} height={totalHeight} class="track-pane-svg">
                    <rect x={0} y={0} width={timeline.trackPaneWidth} height={totalHeight} fill="var(--bg-surface)" />

                    {#each timeline.tracks as track, i}
                        {@const rowY = i * timeline.trackHeight}
                        <rect
                            x={0}
                            y={rowY}
                            width={timeline.trackPaneWidth}
                            height={timeline.trackHeight}
                            fill={ui.selectedTrackId === track.id
                                ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)"
                                : "transparent"}
                            class="track-hitarea"
                            role="button"
                            tabindex="-1"
                            onkeydown={() => {}}
                            onclick={() => {
                                ui.selectedTrackId = track.id;
                            }}
                        />

                        <!-- Track name -->
                        <text
                            x={8}
                            y={rowY + 12}
                            fill={ui.selectedTrackId === track.id ? "var(--accent-primary)" : "var(--text-secondary)"}
                            font-size="11"
                            font-family="var(--font-family)"
                            font-weight={ui.selectedTrackId === track.id ? "600" : "400"}
                            pointer-events="none"
                        >
                            {track.name}
                        </text>

                        <!-- Volume slider -->
                        <foreignObject
                            x={0}
                            y={rowY + 18}
                            width={timeline.trackPaneWidth}
                            height={24}
                            pointer-events="all"
                        >
                            <RangeSlider
                                value={track.gain}
                                label="Vol"
                                min={0}
                                max={1}
                                formatter={(v) => `${Math.round(v * 100)}%`}
                                onchange={(v) => handleGainChange(track.id, v)}
                            />
                        </foreignObject>

                        <!-- Pan slider -->
                        <foreignObject
                            x={0}
                            y={rowY + 44}
                            width={timeline.trackPaneWidth}
                            height={24}
                            pointer-events="all"
                        >
                            <RangeSlider
                                value={(track.pan + 1) / 2}
                                label="Pan"
                                min={0}
                                max={1}
                                formatter={(v) => {
                                    const pan = v * 2 - 1;
                                    if (Math.abs(pan) < 0.05) return "C";
                                    return pan < 0
                                        ? `L${Math.round(Math.abs(pan) * 100)}`
                                        : `R${Math.round(pan * 100)}`;
                                }}
                                onchange={(v) => handlePanChange(track.id, v * 2 - 1)}
                            />
                        </foreignObject>

                        <!-- M/S buttons (rendered last = on top) -->
                        <foreignObject
                            x={timeline.trackPaneWidth - 42}
                            y={rowY + 1}
                            width={38}
                            height={16}
                            pointer-events="all"
                        >
                            <div class="ms-buttons">
                                <button
                                    class="ms-btn mute"
                                    class:active={track.muted}
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        timeline.toggleMute(track.id);
                                    }}>M</button
                                >
                                <button
                                    class="ms-btn solo"
                                    class:active={track.solo}
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        timeline.toggleSolo(track.id);
                                    }}>S</button
                                >
                            </div>
                        </foreignObject>
                    {/each}

                    <!-- Master track separator -->
                    <line
                        x1={0}
                        y1={masterY}
                        x2={timeline.trackPaneWidth}
                        y2={masterY}
                        stroke="var(--border-color)"
                        stroke-width="2"
                    />
                    <rect
                        x={0}
                        y={masterY}
                        width={timeline.trackPaneWidth}
                        height={timeline.trackHeight}
                        fill={ui.selectedTrackId === MASTER_TRACK_ID
                            ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)"
                            : "transparent"}
                        class="track-hitarea"
                        role="button"
                        tabindex="-1"
                        onkeydown={() => {}}
                        onclick={() => {
                            ui.selectedTrackId = MASTER_TRACK_ID;
                        }}
                    />
                    <text
                        x={8}
                        y={masterY + 12}
                        fill={ui.selectedTrackId === MASTER_TRACK_ID
                            ? "var(--accent-primary)"
                            : "var(--text-secondary)"}
                        font-size="11"
                        font-family="var(--font-family)"
                        font-weight={ui.selectedTrackId === MASTER_TRACK_ID ? "600" : "400"}
                        pointer-events="none"
                    >
                        Master
                    </text>
                    <!-- Volume slider -->
                    <foreignObject
                        x={0}
                        y={masterY + 18}
                        width={timeline.trackPaneWidth}
                        height={24}
                        pointer-events="all"
                    >
                        <RangeSlider
                            value={timeline.masterTrack.gain}
                            label="Vol"
                            min={0}
                            max={1}
                            formatter={(v) => `${Math.round(v * 100)}%`}
                            onchange={(v) => handleGainChange(MASTER_TRACK_ID, v)}
                        />
                    </foreignObject>
                    <!-- Pan slider -->
                    <foreignObject
                        x={0}
                        y={masterY + 44}
                        width={timeline.trackPaneWidth}
                        height={24}
                        pointer-events="all"
                    >
                        <RangeSlider
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
                    </foreignObject>
                </svg>
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
                    class:loading={timeline.isLoadingSample}
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

    .timeline-scroll {
        flex: 1;
        overflow: auto;
    }

    .timeline-grid {
        display: grid;
        grid-template-columns: 140px auto;
        grid-template-rows: 24px auto;
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
    }

    .track-pane-svg {
        display: block;
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

    .track-hitarea {
        cursor: pointer;
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
        line-height: 1;
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
</style>
