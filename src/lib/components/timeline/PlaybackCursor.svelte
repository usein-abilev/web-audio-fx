<script lang="ts">
    import { timeline } from "$lib/stores/timeline.svelte";
    import { audio } from "$lib/stores/audio.svelte";

    let { height }: { height: number } = $props();

    const cursorX = $derived(audio.playbackPosition * timeline.beatWidth);
</script>

{#if audio.playbackPosition > 0}
    <line x1={cursorX} y1={0} x2={cursorX} y2={height} stroke="var(--accent-primary)" stroke-width="2" opacity="0.8" />
{/if}
