<script lang="ts">
    import { timeline } from "$lib/stores/timeline.svelte";

    const timeSignatures = [
        { label: "4/4", top: 4, bottom: 4 },
        { label: "3/4", top: 3, bottom: 4 },
        { label: "6/8", top: 6, bottom: 8 },
        { label: "5/4", top: 5, bottom: 4 },
        { label: "7/8", top: 7, bottom: 8 },
    ];

    function handleChange(e: Event) {
        const value = (e.target as HTMLSelectElement).value;
        const signature = timeSignatures.find((t) => t.label === value);
        if (signature) {
            timeline.timeSignature = { top: signature.top, bottom: signature.bottom };
        }
    }

    let currentLabel = $derived(
        timeSignatures.find((t) => t.top === timeline.timeSignature.top && t.bottom === timeline.timeSignature.bottom)
            ?.label ?? "4/4",
    );
</script>

<select onchange={handleChange}>
    {#each timeSignatures as ts}
        <option value={ts.label} selected={ts.label === currentLabel}>{ts.label}</option>
    {/each}
</select>

<style>
    select {
        background: var(--bg-main);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        height: 28px;
        padding: 0 5px;
        cursor: pointer;
        font-weight: 600;

        &:focus {
            border-color: var(--accent-color);
        }
    }
</style>
