<script lang="ts">
    import type { AudioNodeParam } from "$lib/audio/plugins/params";

    let { params, isEq = false }: { params: AudioNodeParam[]; isEq?: boolean } = $props();

    const displayParams = $derived(params.filter((p) => p.id !== "bypass"));
</script>

<div class="plugin-controls" class:eq={isEq}>
    {#each displayParams as param (param.id)}
        {#if param.type === "select" && param.options}
            <div class="control-row">
                {#if !param.hideLabel}
                    <label for="param-{param.id}">{param.name}</label>
                {/if}
                <select
                    id="param-{param.id}"
                    value={param.getValue()}
                    onchange={(e) => param.setValue((e.target as HTMLSelectElement).value)}
                >
                    {#each param.options as option (option.value)}
                        <option value={option.value}>{option.label}</option>
                    {/each}
                </select>
            </div>
        {:else if param.type === "boolean"}
            <div class="control-row">
                <label for="param-{param.id}">{param.name}</label>
                <input
                    id="param-{param.id}"
                    type="checkbox"
                    checked={param.getValue() as boolean}
                    onchange={(e) => param.setValue((e.target as HTMLInputElement).checked)}
                />
            </div>
        {:else}
            <div class="control-row" class:eq-band={isEq}>
                <input
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    value={param.getValue()}
                    oninput={(e) => param.setValue(+(e.target as HTMLInputElement).value)}
                />
                <label for="param-{param.id}">{param.name}</label>
            </div>
        {/if}
    {/each}
</div>

<style>
    .plugin-controls {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .plugin-controls.eq {
        flex-direction: row;
        gap: 4px;
    }

    .control-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .control-row.eq-band {
        flex-direction: column;
        gap: 2px;
        align-items: center;
    }

    .control-row label {
        font-size: 11px;
        color: var(--text-secondary);
        white-space: nowrap;
        min-width: 0;
    }

    .control-row.eq-band label {
        writing-mode: horizontal-tb;
        font-size: 9px;
    }

    .control-row input[type="range"] {
        flex: 1;
        height: 4px;
        -webkit-appearance: none;
        background: var(--border-color);
        border-radius: 2px;
        outline: none;
        min-width: 60px;
    }

    .control-row input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        background: var(--text-secondary);
        border-radius: 50%;
        cursor: pointer;
    }

    .control-row.eq-band input[type="range"] {
        writing-mode: vertical-lr;
        direction: rtl;
        width: 4px;
        height: 80px;
        min-width: 4px;
        min-height: 100px;
    }

    .control-row select {
        flex: 1;
        background: var(--bg-main);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 3px;
        padding: 2px 4px;
        font-size: 11px;
    }

    .control-row input[type="checkbox"] {
        cursor: pointer;
        accent-color: var(--accent-primary);
    }
</style>
