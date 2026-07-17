<script lang="ts">
    let {
        value = 0.5,
        min = 0,
        max = 1,
        defaultValue = 0.5,
        label = "",
        formatter = (v: number) => v.toFixed(2),
        onchange,
    }: {
        value: number;
        min?: number;
        max?: number;
        defaultValue?: number;
        label?: string;
        formatter?: (v: number) => string;
        onchange: (value: number) => void;
    } = $props();

    let inputEl = $state<HTMLInputElement>();

    const percent = $derived(((value - min) / (max - min)) * 100);

    function handleInput(e: Event) {
        const v = parseFloat((e.target as HTMLInputElement).value);
        onchange(v);
    }

    function handleDoubleClick() {
        onchange(defaultValue);
    }
</script>

<div class="slider-wrap" ondblclick={handleDoubleClick}>
    <span class="slider-value">{formatter(value)}</span>
    <div class="slider-row">
        {#if label}
            <span class="slider-label">{label}</span>
        {/if}
        <input
            bind:this={inputEl}
            type="range"
            {min}
            {max}
            step="any"
            {value}
            oninput={handleInput}
            class="slider-input"
            style="--percent: {percent}%"
        />
    </div>
</div>

<style>
    .slider-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        padding: 0 4px;
        box-sizing: border-box;
    }

    .slider-value {
        font-size: 8px;
        color: var(--text-secondary);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        line-height: 1;
        text-align: center;
    }

    .slider-row {
        display: flex;
        align-items: center;
        gap: 4px;
        width: 100%;
    }

    .slider-label {
        font-size: 8px;
        color: var(--text-secondary);
        flex-shrink: 0;
        line-height: 1;
    }

    .slider-input {
        -webkit-appearance: none;
        appearance: none;
        flex: 1;
        height: 4px;
        border-radius: 2px;
        background: linear-gradient(
            to right,
            var(--accent-primary) 0%,
            var(--accent-primary) var(--percent),
            var(--border-color) var(--percent),
            var(--border-color) 100%
        );
        outline: none;
        cursor: pointer;
        min-width: 0;
    }

    .slider-input::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--text-primary);
        border: 1px solid var(--border-color);
        cursor: grab;
    }

    .slider-input::-webkit-slider-thumb:active {
        cursor: grabbing;
    }

    .slider-input::-moz-range-thumb {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--text-primary);
        border: 1px solid var(--border-color);
        cursor: grab;
    }

    .slider-input::-moz-range-thumb:active {
        cursor: grabbing;
    }

    .slider-input::-moz-range-track {
        height: 4px;
        border-radius: 2px;
        background: transparent;
    }
</style>
