<script lang="ts">
    import { timeline } from "$lib/stores/timeline.svelte";

    let { width, height }: { width: number; height: number } = $props();

    const barCount = $derived(Math.ceil(width / timeline.barWidth) + 1);
    const stepCount = $derived(Math.ceil(width / timeline.stepWidth) + 1);
    const beatCount = $derived(Math.ceil(width / timeline.beatWidth) + 1);
</script>

<!-- Bar lines -->
{#each Array.from({ length: barCount }, (_, i) => i) as i (i)}
    <line
        x1={i * timeline.barWidth}
        y1={0}
        x2={i * timeline.barWidth}
        y2={height}
        stroke="var(--grid-bar-color, #0f0f0f)"
        stroke-width="1"
    />
    <!-- Alternating bar background -->
    {#if i % 2 === 0}
        <rect x={i * timeline.barWidth} y={0} width={timeline.barWidth} {height} fill="var(--bg-grid-alt)" />
    {/if}
{/each}

<!-- Step lines -->
{#each Array.from({ length: stepCount }, (_, i) => i) as i (i)}
    <line
        x1={i * timeline.stepWidth}
        y1={0}
        x2={i * timeline.stepWidth}
        y2={height}
        stroke="var(--grid-step-color, #0f0f0faa)"
        stroke-width="0.5"
    />
{/each}

<!-- Beat lines -->
{#each Array.from({ length: beatCount }, (_, i) => i) as i (i)}
    <line
        x1={i * timeline.beatWidth}
        y1={0}
        x2={i * timeline.beatWidth}
        y2={height}
        stroke="var(--grid-color, #0b0b0d)"
        stroke-width="1"
    />
{/each}

<!-- Track lines -->
{#each { length: timeline.tracks.length + 1 }, i}
    <line
        x1={0}
        y1={i * timeline.trackHeight}
        x2={width}
        y2={i * timeline.trackHeight}
        stroke="var(--grid-color, #0b0b0d)"
        stroke-width="1"
    />
{/each}
