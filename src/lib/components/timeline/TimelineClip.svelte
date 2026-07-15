<script lang="ts">
    import { timeline, type TimelineClip as TimelineClipType } from "$lib/stores/timeline.svelte";
    import { generateWaveformPath } from "$lib/utils/waveform";

    let {
        clip,
        selected = false,
        onDragStart,
    }: {
        clip: TimelineClipType;
        selected?: boolean;
        onclick?: (e: MouseEvent) => void;
        onDragStart?: (clipId: number, mouseX: number, mouseY: number) => void;
    } = $props();

    const x = $derived(timeline.musicalTimeToX(clip.time));
    const y = $derived(clip.trackId * timeline.trackHeight);
    const clipWidth = $derived(clip.duration.bar * timeline.barWidth + clip.duration.beat * timeline.beatWidth);
    const clipSampleId = $derived(clip.sampleId);

    const waveformPath = $derived.by(() => {
        console.log("Re-rendering sample waveform", clipSampleId);
        const waveHeight = timeline.trackHeight - 24;
        const buffer = timeline.getBufferSync(clipSampleId);
        if (buffer) {
            return generateWaveformPath(buffer, Math.max(1, Math.floor(clipWidth)), waveHeight);
        }
    });

    function handleContextMenu(e: MouseEvent) {
        e.preventDefault();
        timeline.removeClip(clip.id);
    }

    function handleMouseDown(e: MouseEvent) {
        if (e.button !== 0) return;
        e.stopPropagation();

        const svg = (e.currentTarget as HTMLElement).closest("svg");
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const scrollParent = svg.parentElement;
        const mouseX = e.clientX - rect.left + (scrollParent?.scrollLeft ?? 0);
        const mouseY = e.clientY - rect.top + (scrollParent?.scrollTop ?? 0);

        onDragStart?.(clip.id, mouseX, mouseY);
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
    <text x={x + 4} y={y + 14} fill="white" font-size="11" font-family="var(--font-family)">
        {clip.sampleName}
    </text>

    <!-- Waveform -->
    <g transform="translate({x}, {y + 20})">
        <path d={waveformPath} stroke="var(--text-primary)" stroke-width="1" fill="none" opacity="0.6" />
    </g>
</g>

<style>
    .clip {
        cursor: pointer;
    }

    .clip:hover rect:first-child {
        filter: brightness(1.1);
    }
</style>
