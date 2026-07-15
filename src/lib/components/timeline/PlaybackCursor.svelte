<script lang="ts">
    import { timeline } from "$lib/stores/timeline.svelte";

    let { height }: { height: number } = $props();

    const cursorX = $derived(timeline.playbackPosition * timeline.beatWidth);
</script>

{#if timeline.playbackPosition > 0}
    <line x1={cursorX} y1={0} x2={cursorX} y2={height} stroke="var(--accent-primary)" stroke-width="2" opacity="0.8" />
{/if}
