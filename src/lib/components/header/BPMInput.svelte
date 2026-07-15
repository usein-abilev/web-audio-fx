<script lang="ts">
    import { timeline } from "$lib/stores/timeline.svelte";

    function handleInput(e: Event) {
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        if (!isNaN(val) && val >= 1 && val <= 300) {
            timeline.bpm = val;
        }
    }
</script>

<input type="number" value={timeline.bpm} min={1} max={300} oninput={handleInput} />

<style>
    input {
        width: 70px;
        padding: 5px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--bg-main);
        color: var(--text-primary);
        text-align: center;
        outline: none;
        font-weight: 600;

        &:focus {
            border-color: var(--accent-color);
        }
    }
</style>
