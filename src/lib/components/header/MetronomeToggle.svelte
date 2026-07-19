<script lang="ts">
    import { audio } from "$lib/stores/audio.svelte";
</script>

<button
    class="svg-button"
    class:active={audio.metronome}
    aria-label="Toggle metronome"
    onclick={() => audio.setMetronome(!audio.metronome)}
>
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="6" x2="5" y2="14" />
        <line x1="12" y1="6" x2="19" y2="14" />
        <line x1="8" y1="18" x2="16" y2="18" />
    </svg>
</button>
