<script lang="ts">
    import { timeline } from "$lib/stores/timeline.svelte";
</script>

<button
    class="svg-button"
    class:active={timeline.isRecording}
    aria-label="Record"
    onclick={() => (timeline.isRecording = !timeline.isRecording)}
>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"></circle>
        <circle cx="12" cy="12" r="5" fill="currentColor"></circle>
    </svg>
</button>
