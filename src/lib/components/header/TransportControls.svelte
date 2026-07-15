<script lang="ts">
    import { timeline } from "$lib/stores/timeline.svelte";
</script>

<div class="transport">
    <button
        class="svg-button"
        class:active={timeline.isPlaying}
        aria-label={timeline.isPlaying ? "Pause" : "Play"}
        onclick={() => (timeline.isPlaying = !timeline.isPlaying)}
    >
        {#if timeline.isPlaying}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="6" y="5" width="4" height="14" fill="currentColor" rx="1" />
                <rect x="14" y="5" width="4" height="14" fill="currentColor" rx="1" />
            </svg>
        {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                    d="M8 5v14l11-7L8 5z"
                    fill="currentColor"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linejoin="round"
                />
            </svg>
        {/if}
    </button>

    <button class="svg-button" aria-label="Stop" onclick={() => (timeline.isPlaying = false)}>
        <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
        </svg>
    </button>
</div>

<style>
    .transport {
        display: flex;
        gap: 4px;
        align-items: center;
    }
</style>
