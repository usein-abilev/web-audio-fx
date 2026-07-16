<script lang="ts">
    import { timeline, type TimelineClip as TimelineClipType } from "$lib/stores/timeline.svelte";
    import { ui } from "$lib/stores/ui.svelte";
    import { generateWaveformPath } from "$lib/utils/waveform";

    let {
        clip,
        onDragStart,
    }: {
        clip: TimelineClipType;
        onDragStart?: (clipId: number, mouseX: number, mouseY: number) => void;
    } = $props();

    let selected = $derived(ui.selectedClipIds.has(clip.id));

    const x = $derived(timeline.musicalTimeToX(clip.time));
    const y = $derived(clip.trackId * timeline.trackHeight);
    const clipWidth = $derived(clip.duration.bar * timeline.barWidth + clip.duration.beat * timeline.beatWidth);
    const clipSampleId = $derived(clip.sampleId);

    const clipBufferDuration = $derived.by(() => {
        const buffer = timeline.getBufferSync(clipSampleId);
        return buffer ? buffer.duration : 1;
    });
    const offsetSeconds = $derived(timeline.musicalTimeToSeconds(clip.offset));
    const durationSeconds = $derived(timeline.musicalTimeToSeconds(clip.duration));
    const offsetFraction = $derived(offsetSeconds / clipBufferDuration);
    const durationFraction = $derived(durationSeconds / clipBufferDuration);

    const waveformPath = $derived.by(() => {
        const waveHeight = timeline.trackHeight - 24;
        const buffer = timeline.getBufferSync(clipSampleId);
        if (buffer) {
            return generateWaveformPath(
                buffer,
                Math.max(1, Math.floor(clipWidth)),
                waveHeight,
                offsetFraction,
                durationFraction,
            );
        }
    });

    let isResizing = $state(false);
    let resizeEdge = $state<"left" | "right">("right");
    let resizeStartMouseX = $state(0);
    let resizeStartMouseY = $state(0);
    let resizeStartClipTime = $state({ bar: 0, beat: 0 });
    let resizeStartClipDuration = $state({ bar: 0, beat: 0 });
    let resizeStartClipOffset = $state({ bar: 0, beat: 0 });
    let shiftHeld = $state(false);

    let isAdjustingVolume = $state(false);
    let volumeStartMouseY = $state(0);
    let volumeStartValue = $state(0);

    function beatsToMusical(b: number) {
        const clamped = Math.max(0, b);
        return { bar: Math.floor(clamped / 4), beat: clamped % 4 };
    }

    function handleContextMenu(e: MouseEvent) {
        e.preventDefault();
        timeline.removeClip(clip.id);
    }

    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();

        const addToSelection = e.ctrlKey || e.metaKey;

        if (addToSelection) {
            ui.selectClip(clip.id, true);
            ui.selectedSampleId = clip.sampleId;
            return;
        }

        if (!ui.isClipSelected(clip.id)) {
            ui.selectClip(clip.id, false);
            ui.selectedSampleId = clip.sampleId;
        }

        const svg = (e.currentTarget as HTMLElement).closest("svg");
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        onDragStart?.(clip.id, mouseX, mouseY);
    }

    function screenToSvg(clientX: number, clientY: number) {
        const svg = document.querySelector("svg.grid-svg") as SVGSVGElement | null;
        if (!svg) return { x: 0, y: 0 };
        const rect = svg.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function handleResizeStart(e: MouseEvent, edge: "left" | "right") {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();

        isResizing = true;
        resizeEdge = edge;
        resizeStartMouseX = e.clientX;
        resizeStartMouseY = e.clientY;
        resizeStartClipTime = { ...clip.time };
        resizeStartClipDuration = { ...clip.duration };
        resizeStartClipOffset = { ...clip.offset };

        document.addEventListener("mousemove", handleResizeMove);
        document.addEventListener("mouseup", handleResizeEnd);
    }

    function handleResizeMove(e: MouseEvent) {
        if (!isResizing) return;

        const { x: currentX } = screenToSvg(e.clientX, e.clientY);
        const { x: startSvgX } = screenToSvg(resizeStartMouseX, resizeStartMouseY);
        const svgDeltaX = currentX - startSvgX;

        const { gridStepValue } = timeline;

        const deltaBeatsRaw = svgDeltaX / timeline.beatWidth;
        const gridStepBeats = timeline.stepWidth / timeline.beatWidth;

        const bufferDurationBeats = clipBufferDuration * (timeline.bpm / 60);

        const oldDurationBeats = resizeStartClipDuration.bar * 4 + resizeStartClipDuration.beat;
        const oldOffsetBeats = resizeStartClipOffset.bar * 4 + resizeStartClipOffset.beat;

        if (resizeEdge === "right") {
            const absoluteEdgeBeats = oldDurationBeats + deltaBeatsRaw;
            const snappedEdgeBeats = shiftHeld
                ? absoluteEdgeBeats
                : Math.round(absoluteEdgeBeats / gridStepBeats) * gridStepBeats;
            const newDurationBeats = Math.max(
                shiftHeld ? 0.01 : gridStepValue,
                Math.min(snappedEdgeBeats, bufferDurationBeats - oldOffsetBeats),
            );
            timeline.resizeClip(clip.id, { duration: beatsToMusical(newDurationBeats) });
        } else {
            const newOffsetBeats = Math.max(
                0,
                Math.min(oldOffsetBeats + deltaBeatsRaw, bufferDurationBeats - gridStepValue),
            );
            const offsetDelta = newOffsetBeats - oldOffsetBeats;
            const newDurationBeats = Math.max(gridStepValue, oldDurationBeats - offsetDelta);
            const oldTimeBeats = resizeStartClipTime.bar * 4 + resizeStartClipTime.beat;
            const newTimeBeats = Math.max(0, oldTimeBeats + offsetDelta);
            timeline.resizeClip(clip.id, {
                offset: beatsToMusical(newOffsetBeats),
                duration: beatsToMusical(newDurationBeats),
                time: beatsToMusical(newTimeBeats),
            });
        }
    }

    function handleResizeEnd() {
        isResizing = false;
        document.removeEventListener("mousemove", handleResizeMove);
        document.removeEventListener("mouseup", handleResizeEnd);
    }

    const waveHeight = $derived(timeline.trackHeight - 24);

    function handleVolumeStart(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        isAdjustingVolume = true;
        volumeStartMouseY = e.clientY;
        volumeStartValue = clip.volume;
        document.addEventListener("mousemove", handleVolumeMove);
        document.addEventListener("mouseup", handleVolumeEnd);
    }

    function handleVolumeMove(e: MouseEvent) {
        if (!isAdjustingVolume) return;
        const deltaY = volumeStartMouseY - e.clientY;
        const delta = deltaY / waveHeight;
        timeline.setClipVolume(clip.id, volumeStartValue + delta);
    }

    function handleVolumeEnd() {
        isAdjustingVolume = false;
        document.removeEventListener("mousemove", handleVolumeMove);
        document.removeEventListener("mouseup", handleVolumeEnd);
    }
</script>

<svelte:window onkeyup={() => (shiftHeld = false)} onkeydown={(e) => (shiftHeld = e.shiftKey)} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<g class="clip" class:selected onmousedown={handleMouseDown} oncontextmenu={handleContextMenu}>
    <!-- Clip background -->
    <rect
        {x}
        {y}
        width={clipWidth}
        height={timeline.trackHeight}
        fill="var(--accent-blue, #34498c)"
        stroke={selected ? "var(--accent-primary)" : "#1e1e1e"}
        stroke-width={selected ? 2 : 1}
        rx="2"
    />

    <!-- Clip header -->
    <rect {x} {y} width={clipWidth} height={20} fill="var(--accent-blue-dark, #233161)" rx="2" />

    <!-- Clip name -->
    <foreignObject x={x + 4} y={y + 1} width={Math.max(0, clipWidth - 8)} height={18} pointer-events="none">
        <div class="clip-name">{clip.sampleName}</div>
    </foreignObject>

    <!-- Waveform -->
    <g transform="translate({x}, {y + 20})">
        <path d={waveformPath} stroke="var(--text-primary)" stroke-width="1" fill="none" opacity="0.6" />
    </g>

    <!-- Volume fill -->
    <rect
        {x}
        y={y + 20 + waveHeight * (1 - clip.volume)}
        width={clipWidth}
        height={waveHeight * clip.volume}
        fill="var(--accent-primary)"
        opacity="0.15"
        pointer-events="none"
    />

    <!-- Volume handle -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <line
        x1={x}
        y1={y + 20 + waveHeight * (1 - clip.volume)}
        x2={x + clipWidth}
        y2={y + 20 + waveHeight * (1 - clip.volume)}
        stroke="var(--accent-primary)"
        stroke-width="2"
        style="cursor: ns-resize;"
        onmousedown={handleVolumeStart}
    />

    <!-- Resize handles -->
    <rect
        {x}
        {y}
        width={6}
        height={timeline.trackHeight}
        fill="transparent"
        style="cursor: ew-resize;"
        onmousedown={(e) => handleResizeStart(e, "left")}
    />
    <rect
        x={x + clipWidth - 6}
        {y}
        width={6}
        height={timeline.trackHeight}
        fill="transparent"
        style="cursor: ew-resize;"
        onmousedown={(e) => handleResizeStart(e, "right")}
    />
</g>

<style>
    .clip {
        cursor: default;
    }

    .clip.selected {
        cursor: move;
    }

    .clip:hover rect:first-child {
        filter: brightness(1.1);
    }

    .clip-name {
        color: white;
        font-size: 11px;
        font-family: var(--font-family);
        line-height: 18px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
