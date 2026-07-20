<script lang="ts">
    import { timeline, type TimelineClip as TimelineClipType } from "$lib/stores/timeline.svelte";
    import { bufferStore } from "$lib/stores/buffer.svelte";
    import { ui } from "$lib/stores/ui.svelte";
    import { generateWaveformPath } from "$lib/utils/waveform";

    let {
        clip,
        onDragStart,
        onResizeStart,
        onVolumeStart,
    }: {
        clip: TimelineClipType;
        onDragStart?: (clipId: number, mouseX: number, mouseY: number) => void;
        onResizeStart?: (clipId: number, edge: "left" | "right", e: MouseEvent) => void;
        onVolumeStart?: (clipId: number, e: MouseEvent) => void;
    } = $props();

    let selected = $derived(ui.selectedClipIds.has(clip.id));

    const x = $derived(timeline.musicalTimeToX(clip.time));
    const y = $derived(clip.trackId * timeline.trackHeight);
    const clipWidth = $derived(clip.duration.bar * timeline.barWidth + clip.duration.beat * timeline.beatWidth);
    const clipBufferId = $derived(clip.bufferId);

    const clipBufferDuration = $derived.by(() => {
        const buffer = bufferStore.getBuffer(clipBufferId);
        return buffer ? buffer.duration : 1;
    });
    const offsetSeconds = $derived(timeline.musicalTimeToSeconds(clip.offset));
    const durationSeconds = $derived(timeline.musicalTimeToSeconds(clip.duration));
    const offsetFraction = $derived(offsetSeconds / clipBufferDuration);
    const durationFraction = $derived(durationSeconds / clipBufferDuration);

    const waveformPath = $derived.by(() => {
        const waveHeight = timeline.trackHeight - 24;
        const buffer = bufferStore.getBuffer(clipBufferId);
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

    function handleContextMenu(e: MouseEvent) {
        e.preventDefault();
        timeline.removeClips([clip.id]);
    }

    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();

        const addToSelection = e.ctrlKey || e.metaKey;

        if (addToSelection) {
            ui.selectClip(clip.id, true);
            return;
        }

        if (!ui.isClipSelected(clip.id)) {
            ui.selectClip(clip.id, false);
        }

        const svg = (e.currentTarget as HTMLElement).closest("svg");
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        onDragStart?.(clip.id, mouseX, mouseY);
    }

    function handleResizeStart(e: MouseEvent, edge: "left" | "right") {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        onResizeStart?.(clip.id, edge, e);
    }

    const waveHeight = $derived(timeline.trackHeight - 24);

    function handleVolumeStart(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        onVolumeStart?.(clip.id, e);
    }
</script>

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
        <div class="clip-name">{clip.name}</div>
    </foreignObject>

    <!-- Waveform -->
    <g transform="translate({x}, {y + 20})">
        <path d={waveformPath} stroke="#111" stroke-width="1" fill="none" opacity="0.6" />
    </g>

    <!-- Volume indicator (shown on hover) -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <g class="volume-indicator">
        <rect
            {x}
            y={y + 20 + waveHeight * (1 - clip.params.volume)}
            width={clipWidth}
            height={waveHeight * clip.params.volume}
            fill="var(--accent-primary)"
            opacity="0.15"
            pointer-events="none"
        />
        <line
            x1={x}
            y1={y + 20 + waveHeight * (1 - clip.params.volume)}
            x2={x + clipWidth}
            y2={y + 20 + waveHeight * (1 - clip.params.volume)}
            stroke="var(--accent-primary)"
            stroke-width="2"
            style="cursor: ns-resize;"
            onmousedown={handleVolumeStart}
        />
        {#if clipWidth > 25}
            <text
                x={x + clipWidth - 4}
                y={y + 20 + waveHeight * (1 - clip.params.volume) - (clip.params.volume < 0.75 ? 4 : -10)}
                fill="var(--text-primary)"
                font-size="10"
                font-weight="600"
                font-family="var(--font-family)"
                text-anchor="end"
                pointer-events="none"
            >
                {Math.round(clip.params.volume * 100)}%
            </text>
        {/if}
    </g>

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

    .volume-indicator {
        opacity: 0;
        transition: opacity 0.15s ease;
    }

    .clip:hover .volume-indicator {
        opacity: 1;
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
