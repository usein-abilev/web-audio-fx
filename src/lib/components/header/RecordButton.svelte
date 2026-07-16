<script lang="ts">
    import { audio } from "$lib/stores/audio.svelte";
</script>

<button
    class="svg-button"
    class:active={audio.isRecording}
    aria-label="Record"
    onclick={() => {
        if (audio.isRecording) {
            audio.disarmRecording();
        } else {
            audio.armRecording();
        }
    }}
>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"></circle>
        <circle cx="12" cy="12" r="5" fill="currentColor"></circle>
    </svg>
</button>
